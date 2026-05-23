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

const normalizeTemplate = (row) => {
  if (!row) {
    return row;
  }

  return {
    id: row.id,
    name: row.name,
    code: row.code,
    schema: row.schema_json,
    created_at: row.created_at
  };
};

const generateTemplateCode = (name) => {
  const base = String(name || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (base) {
    return base;
  }

  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TPL-${random}`;
};

const listTemplates = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const role = String(req.user?.role || '').toLowerCase();
  const isInspector = role === 'inspector';
  const inspectorId = req.user?.id;

  if (isInspector && !inspectorId) {
    return sendResponse(res, 401, false, null, 'Unauthorized: inspector id is missing in token payload.');
  }

  let result = null;

  if (isInspector) {
    result = await db.query(
      `SELECT DISTINCT t.id, t.name, t.code, t.schema_json, t.created_at
       FROM templates t
       LEFT JOIN audits a ON a.template_id = t.id AND a.tenant_id = t.tenant_id
       LEFT JOIN facility_inspectors fi ON fi.facility_id = a.facility_id
       WHERE t.tenant_id = $1
         AND (a.inspector_id = $2 OR fi.inspector_id = $2)
       ORDER BY t.updated_at DESC`,
      [tenantId, inspectorId]
    );
  } else {
    result = await db.query(
      `SELECT id, name, code, schema_json, created_at
       FROM templates
       WHERE tenant_id = $1
       ORDER BY updated_at DESC`,
      [tenantId]
    );
  }

  const templates = result.rows.map(normalizeTemplate);
  return sendResponse(res, 200, true, templates, 'Templates fetched successfully.');
};

const getTemplateById = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { id } = req.params;
  const role = String(req.user?.role || '').toLowerCase();
  const isInspector = role === 'inspector';
  const inspectorId = req.user?.id;

  if (isInspector && !inspectorId) {
    return sendResponse(res, 401, false, null, 'Unauthorized: inspector id is missing in token payload.');
  }

  const result = await db.query(
    `SELECT id, name, code, schema_json, created_at
     FROM templates
     WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    return sendResponse(res, 404, false, null, 'Template not found.');
  }

  if (isInspector) {
    const accessResult = await db.query(
      `SELECT 1
       FROM templates t
       LEFT JOIN audits a ON a.template_id = t.id AND a.tenant_id = t.tenant_id
       LEFT JOIN facility_inspectors fi ON fi.facility_id = a.facility_id
       WHERE t.id = $1
         AND t.tenant_id = $2
         AND (a.inspector_id = $3 OR fi.inspector_id = $3)
       LIMIT 1`,
      [id, tenantId, inspectorId]
    );

    if (accessResult.rows.length === 0) {
      return sendResponse(res, 403, false, null, 'Access Denied: Template not assigned to your active scope.');
    }
  }

  return sendResponse(res, 200, true, normalizeTemplate(result.rows[0]), 'Template fetched successfully.');
};

const createTemplate = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { name, code, schema } = req.body || {};

  if (!name || !schema) {
    return sendResponse(res, 400, false, null, 'name and schema are required.');
  }

  const resolvedCode = code || generateTemplateCode(name);

  const result = await db.query(
    `INSERT INTO templates (tenant_id, name, code, schema_json)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, code, schema_json, created_at`,
    [tenantId, name, resolvedCode, schema]
  );

  return sendResponse(res, 201, true, normalizeTemplate(result.rows[0]), 'Template created successfully.');
};

const updateTemplate = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { id } = req.params;
  const { name, code, schema } = req.body || {};

  const result = await db.query(
    `UPDATE templates
     SET name = COALESCE($3, name),
       code = COALESCE($4, code),
       schema_json = COALESCE($5, schema_json)
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, name, code, schema_json, created_at`,
    [id, tenantId, name || null, code || null, schema || null]
  );

  if (result.rows.length === 0) {
    return sendResponse(res, 404, false, null, 'Template not found.');
  }

  return sendResponse(res, 200, true, normalizeTemplate(result.rows[0]), 'Template updated successfully.');
};

const deleteTemplate = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { id } = req.params;

  const result = await db.query(
    `DELETE FROM templates
     WHERE id = $1 AND tenant_id = $2
     RETURNING id`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    return sendResponse(res, 404, false, null, 'Template not found.');
  }

  return sendResponse(res, 200, true, { id }, 'Template deleted successfully.');
};

module.exports = {
  listTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate
};
