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

const ensureFacility = async (tenantId, facilityId) => {
  const result = await db.query(
    `SELECT id FROM facilities WHERE id = $1 AND tenant_id = $2`,
    [facilityId, tenantId]
  );

  if (result.rows.length === 0) {
    throw createHttpError(404, 'Facility not found.');
  }
};

const ensureInspector = async (tenantId, inspectorId) => {
  const result = await db.query(
    `SELECT id FROM users WHERE id = $1 AND tenant_id = $2`,
    [inspectorId, tenantId]
  );

  if (result.rows.length === 0) {
    throw createHttpError(404, 'Inspector not found.');
  }
};

const ensureTemplate = async (tenantId, templateId) => {
  const result = await db.query(
    `SELECT id FROM templates WHERE id = $1 AND tenant_id = $2`,
    [templateId, tenantId]
  );

  if (result.rows.length === 0) {
    throw createHttpError(404, 'Template not found.');
  }
};

const normalizeStatus = (status) => {
  if (!status) {
    return 'brouillon';
  }

  return status.toLowerCase();
};

const generateRef = () => {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AUD-${year}-${random}`;
};

const listAudits = async (req, res) => {
  const tenantId = ensureTenantId(req);

  const result = await db.query(
    `SELECT a.id, a.ref, a.status, COALESCE(a.date, a.scheduled_date) AS date,
            f.name AS facility,
            u.full_name AS inspector
     FROM audits a
     LEFT JOIN facilities f ON f.id = a.facility_id
     LEFT JOIN users u ON u.id = a.inspector_id
     WHERE a.tenant_id = $1
     ORDER BY a.updated_at DESC`,
    [tenantId]
  );

  const audits = result.rows.map((row) => ({
    id: row.id,
    ref: row.ref,
    facility: row.facility,
    inspector: row.inspector,
    date: row.date,
    status: normalizeStatus(row.status)
  }));

  return sendResponse(res, 200, true, audits, 'Audits fetched successfully.');
};

const getAuditById = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { id } = req.params;

  const result = await db.query(
    `SELECT a.id, a.ref, a.status, COALESCE(a.date, a.scheduled_date) AS date,
            a.answers,
            f.name AS facility,
            u.full_name AS inspector
     FROM audits a
     LEFT JOIN facilities f ON f.id = a.facility_id
     LEFT JOIN users u ON u.id = a.inspector_id
     WHERE a.id = $1 AND a.tenant_id = $2
     LIMIT 1`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    return sendResponse(res, 404, false, null, 'Audit not found.');
  }

  const audit = result.rows[0];
  return sendResponse(res, 200, true, {
    id: audit.id,
    ref: audit.ref,
    facility: audit.facility,
    inspector: audit.inspector,
    date: audit.date,
    status: normalizeStatus(audit.status),
    answers: Array.isArray(audit.answers) ? audit.answers : audit.answers || []
  }, 'Audit fetched successfully.');
};

const createAudit = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { template_id, facility_id, inspector_id, date } = req.body || {};

  if (!template_id || !facility_id || !inspector_id || !date) {
    return sendResponse(res, 400, false, null, 'template_id, facility_id, inspector_id, and date are required.');
  }

  await ensureInspector(tenantId, inspector_id);
  await ensureFacility(tenantId, facility_id);
  await ensureTemplate(tenantId, template_id);

  const ref = generateRef();

  const result = await db.query(
    `INSERT INTO audits (tenant_id, template_id, inspector_id, facility_id, date, status, ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, ref, status`,
    [tenantId, template_id, inspector_id, facility_id, date, 'brouillon', ref]
  );

  return sendResponse(res, 201, true, {
    id: result.rows[0].id,
    ref: result.rows[0].ref,
    status: normalizeStatus(result.rows[0].status)
  }, 'Audit created successfully.');
};

const updateAudit = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { id } = req.params;
  const { inspector_id, facility_id, status, date } = req.body || {};

  if (status) {
    const normalizedStatus = status.toLowerCase();
    const allowedStatuses = new Set(['soumis', 'planifie', 'cloture', 'brouillon']);

    if (!allowedStatuses.has(normalizedStatus)) {
      return sendResponse(res, 400, false, null, 'Invalid status.');
    }
  }

  if (inspector_id) {
    await ensureInspector(tenantId, inspector_id);
  }

  if (facility_id) {
    await ensureFacility(tenantId, facility_id);
  }

  const result = await db.query(
    `UPDATE audits
     SET inspector_id = COALESCE($3, inspector_id),
       facility_id = COALESCE($4, facility_id),
       status = COALESCE($5, status),
       date = COALESCE($6, date)
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, ref, status`,
    [id, tenantId, inspector_id || null, facility_id || null, status || null, date || null]
  );

  if (result.rows.length === 0) {
    return sendResponse(res, 404, false, null, 'Audit not found.');
  }

  return sendResponse(res, 200, true, {
    id: result.rows[0].id,
    ref: result.rows[0].ref,
    status: normalizeStatus(result.rows[0].status)
  }, 'Audit updated successfully.');
};

const updateAuditStatus = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { id } = req.params;
  const { status } = req.body || {};

  if (!status) {
    return sendResponse(res, 400, false, null, 'status is required.');
  }

  const normalizedStatus = status.toLowerCase();
  const allowedStatuses = new Set(['soumis', 'planifie', 'cloture', 'brouillon']);

  if (!allowedStatuses.has(normalizedStatus)) {
    return sendResponse(res, 400, false, null, 'Invalid status.');
  }

  const result = await db.query(
    `UPDATE audits
     SET status = $3
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, status`,
    [id, tenantId, normalizedStatus]
  );

  if (result.rows.length === 0) {
    return sendResponse(res, 404, false, null, 'Audit not found.');
  }

  return sendResponse(res, 200, true, {
    id: result.rows[0].id,
    status: normalizeStatus(result.rows[0].status)
  }, 'Audit status updated successfully.');
};

module.exports = {
  listAudits,
  getAuditById,
  createAudit,
  updateAudit,
  updateAuditStatus
};
