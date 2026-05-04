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

const mapRows = (rows, type, linkPrefix) => {
  return rows.map((row) => ({
    id: row.id,
    type,
    title: row.title,
    link: linkPrefix
  }));
};

const searchAll = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const query = (req.query.q || '').trim();

  if (!query) {
    return sendResponse(res, 200, true, [], 'Search completed.');
  }

  const likeQuery = `%${query}%`;

  const [audits, facilities, templates, capas] = await Promise.all([
    db.query(
      `SELECT id, ref AS title
       FROM audits
       WHERE tenant_id = $1
         AND ref ILIKE $2
       ORDER BY updated_at DESC
       LIMIT 10`,
      [tenantId, likeQuery]
    ),
    db.query(
      `SELECT id, name AS title
       FROM facilities
       WHERE tenant_id = $1
         AND name ILIKE $2
       ORDER BY name ASC
       LIMIT 10`,
      [tenantId, likeQuery]
    ),
    db.query(
      `SELECT id, name AS title
       FROM templates
       WHERE tenant_id = $1
         AND (name ILIKE $2 OR code ILIKE $2)
       ORDER BY created_at DESC
       LIMIT 10`,
      [tenantId, likeQuery]
    ),
    db.query(
      `SELECT id, title
       FROM capa
       WHERE tenant_id = $1
         AND title ILIKE $2
       ORDER BY created_at DESC
       LIMIT 10`,
      [tenantId, likeQuery]
    )
  ]);

  const results = [
    ...mapRows(audits.rows, 'Audit', '/audits-management'),
    ...mapRows(facilities.rows, 'Facility', '/tenant-settings/facilities'),
    ...mapRows(templates.rows, 'Template', '/templates'),
    ...mapRows(capas.rows, 'CAPA', '/capa')
  ];

  return sendResponse(res, 200, true, results, 'Search completed.');
};

module.exports = {
  searchAll
};
