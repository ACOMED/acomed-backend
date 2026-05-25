const bcrypt = require('bcrypt');
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

const listFacilities = async (req, res) => {
  const tenantId = ensureTenantId(req);

  const result = await db.query(
    `SELECT f.id, f.name, f.type, f.region AS location,
            COUNT(fi.inspector_id)::int AS inspector_count,
            COALESCE(
              ARRAY_AGG(DISTINCT fi.inspector_id) FILTER (WHERE fi.inspector_id IS NOT NULL),
              '{}'::uuid[]
            ) AS inspector_ids
     FROM facilities f
     LEFT JOIN facility_inspectors fi ON fi.facility_id = f.id
     WHERE f.tenant_id = $1
     GROUP BY f.id
     ORDER BY f.name ASC`,
    [tenantId]
  );

  return sendResponse(res, 200, true, result.rows, 'Facilities fetched successfully.');
};

const createFacility = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { name, type, location } = req.body || {};

  if (!name || !type || !location) {
    return sendResponse(res, 400, false, null, 'name, type, and location are required.');
  }

  const result = await db.query(
    `INSERT INTO facilities (tenant_id, name, type, region)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, type, region AS location, created_at`,
    [tenantId, name, type, location]
  );

  return sendResponse(res, 201, true, result.rows[0], 'Facility created successfully.');
};

const updateFacility = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { id } = req.params;
  const { name, type, location } = req.body || {};

  const result = await db.query(
    `UPDATE facilities
     SET name = COALESCE($3, name),
         type = COALESCE($4, type),
         region = COALESCE($5, region)
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, name, type, region AS location, created_at`,
    [id, tenantId, name || null, type || null, location || null]
  );

  if (result.rows.length === 0) {
    return sendResponse(res, 404, false, null, 'Facility not found.');
  }

  return sendResponse(res, 200, true, result.rows[0], 'Facility updated successfully.');
};

const deleteFacility = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { id } = req.params;
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM audits
       WHERE tenant_id = $1 AND facility_id = $2`,
      [tenantId, id]
    );

    await client.query(
      `DELETE FROM facility_inspectors
       WHERE facility_id = $1`,
      [id]
    );

    const result = await client.query(
      `DELETE FROM facilities
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return sendResponse(res, 404, false, null, 'Facility not found.');
    }

    await client.query('COMMIT');
    return sendResponse(res, 200, true, null, 'Facility deleted successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const listUsers = async (req, res) => {
  const tenantId = ensureTenantId(req);

  const result = await db.query(
    `SELECT id, full_name, email, role
     FROM users
     WHERE tenant_id = $1
     ORDER BY full_name ASC`,
    [tenantId]
  );

  const users = result.rows.map((user) => ({
    id: user.id,
    name: user.full_name,
    email: user.email,
    role: user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : user.role
  }));

  return sendResponse(res, 200, true, users, 'Users fetched successfully.');
};

const createUser = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { name, email, password, role } = req.body || {};

  if (!name || !email || !password || !role) {
    return sendResponse(res, 400, false, null, 'name, email, password, and role are required.');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const normalizedRole = role.toLowerCase();

  const result = await db.query(
    `INSERT INTO users (tenant_id, full_name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, full_name, email, role`,
    [tenantId, name, email, passwordHash, normalizedRole]
  );

  return sendResponse(res, 201, true, {
    id: result.rows[0].id,
    name: result.rows[0].full_name,
    email: result.rows[0].email,
    role: result.rows[0].role ? result.rows[0].role.charAt(0).toUpperCase() + result.rows[0].role.slice(1) : result.rows[0].role
  }, 'User created successfully.');
};

const updateUser = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { id } = req.params;
  const { name, email, password, role } = req.body || {};

  let passwordHash = null;
  if (password) {
    passwordHash = await bcrypt.hash(password, 10);
  }

  const normalizedRole = role ? role.toLowerCase() : null;
  const result = await db.query(
    `UPDATE users
     SET full_name = COALESCE($3, full_name),
         email = COALESCE($4, email),
         password_hash = COALESCE($5, password_hash),
         role = COALESCE($6, role)
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, full_name, email, role`,
    [id, tenantId, name || null, email || null, passwordHash, normalizedRole]
  );

  if (result.rows.length === 0) {
    return sendResponse(res, 404, false, null, 'User not found.');
  }

  return sendResponse(res, 200, true, {
    id: result.rows[0].id,
    name: result.rows[0].full_name,
    email: result.rows[0].email,
    role: result.rows[0].role ? result.rows[0].role.charAt(0).toUpperCase() + result.rows[0].role.slice(1) : result.rows[0].role
  }, 'User updated successfully.');
};

const updateUserRole = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { id } = req.params;
  const { role } = req.body || {};

  if (!role) {
    return sendResponse(res, 400, false, null, 'role is required.');
  }

  const normalizedRole = role.toLowerCase();
  const result = await db.query(
    `UPDATE users
     SET role = $3
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, role`,
    [id, tenantId, normalizedRole]
  );

  if (result.rows.length === 0) {
    return sendResponse(res, 404, false, null, 'User not found.');
  }

  return sendResponse(res, 200, true, {
    id: result.rows[0].id,
    role: result.rows[0].role ? result.rows[0].role.charAt(0).toUpperCase() + result.rows[0].role.slice(1) : result.rows[0].role
  }, 'User role updated successfully.');
};

const deleteUser = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { id } = req.params;
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE capa
       SET assigned_to = NULL
       WHERE assigned_to = $1`,
      [id]
    );

    await client.query(
      `DELETE FROM facility_inspectors
       WHERE inspector_id = $1`,
      [id]
    );

    await client.query(
      `DELETE FROM audits
       WHERE tenant_id = $1 AND inspector_id = $2`,
      [tenantId, id]
    );

    await client.query(
      `DELETE FROM user_devices
       WHERE user_id = $1`,
      [id]
    );

    const result = await client.query(
      `DELETE FROM users
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return sendResponse(res, 404, false, null, 'User not found.');
    }

    await client.query('COMMIT');
    return sendResponse(res, 200, true, null, 'User deleted successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const listFacilityInspectors = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { id } = req.params;

  const facilityResult = await db.query(
    `SELECT id FROM facilities WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  if (facilityResult.rows.length === 0) {
    return sendResponse(res, 404, false, null, 'Facility not found.');
  }

  const result = await db.query(
    `SELECT u.id, u.full_name, u.email, u.role
     FROM facility_inspectors fi
     INNER JOIN users u ON u.id = fi.inspector_id
     WHERE fi.facility_id = $1
     ORDER BY u.full_name ASC`,
    [id]
  );

  return sendResponse(res, 200, true, result.rows, 'Facility inspectors fetched successfully.');
};

const assignInspectorToFacility = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { id } = req.params;
  const { inspector_id } = req.body || {};

  if (!inspector_id) {
    return sendResponse(res, 400, false, null, 'inspector_id is required.');
  }

  const facilityResult = await db.query(
    `SELECT id FROM facilities WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  if (facilityResult.rows.length === 0) {
    return sendResponse(res, 404, false, null, 'Facility not found.');
  }

  const inspectorResult = await db.query(
    `SELECT id FROM users WHERE id = $1 AND tenant_id = $2`,
    [inspector_id, tenantId]
  );

  if (inspectorResult.rows.length === 0) {
    return sendResponse(res, 404, false, null, 'Inspector not found.');
  }

  await db.query(
    `INSERT INTO facility_inspectors (facility_id, inspector_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [id, inspector_id]
  );

  return sendResponse(res, 200, true, { facility_id: id, inspector_id }, 'Inspector assigned successfully.');
};

const removeInspectorFromFacility = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { id, inspectorId, inspector_id } = req.params;
  const resolvedInspectorId = inspectorId || inspector_id;

  const result = await db.query(
    `DELETE FROM facility_inspectors fi
     USING facilities f
     WHERE fi.facility_id = f.id
       AND fi.facility_id = $1
       AND fi.inspector_id = $2
       AND f.tenant_id = $3
     RETURNING fi.facility_id`,
    [id, resolvedInspectorId, tenantId]
  );

  if (result.rows.length === 0) {
    return sendResponse(res, 404, false, null, 'Assignment not found.');
  }

  return sendResponse(
    res,
    200,
    true,
    { facility_id: id, inspector_id: resolvedInspectorId },
    'Inspector removed successfully.'
  );
};

module.exports = {
  listFacilities,
  createFacility,
  updateFacility,
  deleteFacility,
  listUsers,
  createUser,
  updateUser,
  updateUserRole,
  deleteUser,
  listFacilityInspectors,
  assignInspectorToFacility,
  removeInspectorFromFacility
};
