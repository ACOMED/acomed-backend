const db = require('../config/db');
const { sendResponse } = require('../utils/response');

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const ensureTenantId = (req) => {
  const tenantId = req.user && req.user.tenant_id;

  if (!tenantId) {
    throw createHttpError(401, 'Unauthorized: tenant_id is required in token payload.');
  }

  return tenantId;
};

const ensureAudit = async (tenantId, auditId) => {
  const result = await db.query(
    `SELECT id FROM audits WHERE id = $1 AND tenant_id = $2`,
    [auditId, tenantId]
  );

  if (result.rows.length === 0) {
    throw createHttpError(404, 'Audit not found.');
  }
};

const ensureUser = async (tenantId, userId) => {
  const result = await db.query(
    `SELECT id FROM users WHERE id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );

  if (result.rows.length === 0) {
    throw createHttpError(404, 'User not found.');
  }
};

const notifyAdmins = async (tenantId, message) => {
  await db.query(
    `INSERT INTO notifications (tenant_id, user_id, message)
     SELECT $1, u.id, $2
     FROM users u
     WHERE u.tenant_id = $1
       AND u.role = 'admin'`,
    [tenantId, message]
  );
};

const normalizeCapaStatus = (status) => {
  if (!status) {
    return 'todo';
  }

  return status;
};

const listCapas = async (req, res) => {
  const tenantId = ensureTenantId(req);

  const result = await db.query(
    `SELECT c.id, c.title, c.severity, c.status, c.due_date,
            c.assignee_id
     FROM capa c
     WHERE c.tenant_id = $1
     ORDER BY c.updated_at DESC`,
    [tenantId]
  );

  const capas = result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    severity: row.severity ? row.severity.toLowerCase() : row.severity,
    status: normalizeCapaStatus(row.status),
    due_date: row.due_date,
    assignee_avatar: null
  }));

  return sendResponse(res, 200, true, capas, 'CAPA tickets fetched successfully.');
};

const createCapa = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { audit_id, title, severity, due_date } = req.body || {};

  if (!audit_id || !title || !severity) {
    return sendResponse(res, 400, false, null, 'audit_id, title, and severity are required.');
  }

  const normalizedSeverity = severity.toLowerCase();
  const allowedSeverities = new Set(['critical', 'major', 'minor']);
  if (!allowedSeverities.has(normalizedSeverity)) {
    return sendResponse(res, 400, false, null, 'Invalid severity.');
  }

  await ensureAudit(tenantId, audit_id);

  const result = await db.query(
    `INSERT INTO capa (audit_id, title, severity, status, due_date, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, title, severity, status`,
    [audit_id, title, normalizedSeverity, 'todo', due_date || null, tenantId]
  );

  return sendResponse(res, 201, true, {
    id: result.rows[0].id,
    title: result.rows[0].title,
    severity: result.rows[0].severity,
    status: normalizeCapaStatus(result.rows[0].status)
  }, 'CAPA ticket created successfully.');
};

const updateCapa = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { id } = req.params;
  const { title, severity, status, due_date } = req.body || {};

  const result = await db.query(
    `UPDATE capa c
     SET title = COALESCE($3, c.title),
         severity = COALESCE($4, c.severity),
         status = COALESCE($5, c.status),
         due_date = COALESCE($6, c.due_date)
     WHERE c.id = $1
       AND c.tenant_id = $2
     RETURNING c.id, c.title, c.severity, c.status, c.due_date`,
    [id, tenantId, title || null, severity || null, status || null, due_date || null]
  );

  if (result.rows.length === 0) {
    return sendResponse(res, 404, false, null, 'CAPA ticket not found.');
  }

  return sendResponse(res, 200, true, {
    id: result.rows[0].id,
    title: result.rows[0].title,
    severity: result.rows[0].severity,
    status: normalizeCapaStatus(result.rows[0].status),
    due_date: result.rows[0].due_date
  }, 'CAPA ticket updated successfully.');
};

const updateCapaStatus = async (req, res) => {
  const { status } = req.body || {};

  if (!status) {
    return sendResponse(res, 400, false, null, 'status is required.');
  }

  const allowedStatuses = new Set(['todo', 'inProgress', 'review', 'closed']);
  if (!allowedStatuses.has(status)) {
    return sendResponse(res, 400, false, null, 'Invalid status.');
  }

  const tenantId = ensureTenantId(req);
  const { id } = req.params;
  const currentResult = await db.query(
    `SELECT status, title FROM capa WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  if (currentResult.rows.length === 0) {
    return sendResponse(res, 404, false, null, 'CAPA ticket not found.');
  }

  const previousStatus = currentResult.rows[0].status;
  const updated = await updateCapa({ ...req, body: { status } }, res);

  if (previousStatus !== status && ['todo', 'inProgress', 'review'].includes(status)) {
    const title = currentResult.rows[0].title || id;
    await notifyAdmins(tenantId, `CAPA ${title} moved to ${status}.`);
  }

  return updated;
};

const assignCapa = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { id } = req.params;
  const { assigned_to } = req.body || {};

  if (!assigned_to) {
    return sendResponse(res, 400, false, null, 'assigned_to is required.');
  }

  await ensureUser(tenantId, assigned_to);

  const result = await db.query(
    `UPDATE capa
     SET assignee_id = $3
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, status`,
    [id, tenantId, assigned_to]
  );

  if (result.rows.length === 0) {
    return sendResponse(res, 404, false, null, 'CAPA ticket not found.');
  }

  return sendResponse(res, 200, true, {
    id: result.rows[0].id,
    status: normalizeCapaStatus(result.rows[0].status)
  }, 'CAPA assignee updated successfully.');
};

module.exports = {
  listCapas,
  createCapa,
  updateCapa,
  updateCapaStatus,
  assignCapa
};
