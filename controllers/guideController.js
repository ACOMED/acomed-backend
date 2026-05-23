const path = require('path');
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

const resolveBaseUrl = (req) => {
  const configured = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL;
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
};

const listGuides = async (req, res) => {
  const tenantId = ensureTenantId(req);

  const result = await db.query(
    `SELECT id, title, file_path, created_at
     FROM guides
     WHERE tenant_id = $1
     ORDER BY created_at DESC`,
    [tenantId]
  );

  const baseUrl = resolveBaseUrl(req);
  const guides = result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    file_url: `${baseUrl}/${row.file_path.replace(/\\/g, '/')}`,
    created_at: row.created_at
  }));

  return sendResponse(res, 200, true, guides, 'Guides fetched successfully.');
};

const uploadGuide = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { title } = req.body || {};

  if (!title) {
    return sendResponse(res, 400, false, null, 'title is required.');
  }

  if (!req.file) {
    return sendResponse(res, 400, false, null, 'file is required.');
  }

  const relativePath = path.posix.join('uploads', 'guides', req.file.filename);

  const result = await db.query(
    `INSERT INTO guides (tenant_id, title, file_path, original_name)
     VALUES ($1, $2, $3, $4)
     RETURNING id, title, file_path, created_at`,
    [tenantId, title, relativePath, req.file.originalname]
  );

  const baseUrl = resolveBaseUrl(req);
  const guide = result.rows[0];

  return sendResponse(res, 201, true, {
    id: guide.id,
    title: guide.title,
    file_url: `${baseUrl}/${guide.file_path}`,
    created_at: guide.created_at
  }, 'Guide uploaded successfully.');
};

module.exports = {
  listGuides,
  uploadGuide
};
