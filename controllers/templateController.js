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

const listTemplates = async (req, res) => {
  const tenantId = ensureTenantId(req);

  const result = await db.query(
    `SELECT id, name, code, schema_json, created_at
     FROM templates
     WHERE tenant_id = $1
     ORDER BY updated_at DESC`,
    [tenantId]
  );

  const templates = result.rows.map(normalizeTemplate);
  return sendResponse(res, 200, true, templates, 'Templates fetched successfully.');
};

const getTemplateById = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { id } = req.params;

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

  return sendResponse(res, 200, true, normalizeTemplate(result.rows[0]), 'Template fetched successfully.');
};

const createTemplate = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { name, code, schema } = req.body || {};

  if (!name || !code || !schema) {
    return sendResponse(res, 400, false, null, 'name, code, and schema are required.');
  }

  const result = await db.query(
    `INSERT INTO templates (tenant_id, name, code, schema_json)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, code, schema_json, created_at`,
    [tenantId, name, code, schema]
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
