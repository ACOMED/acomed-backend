const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { sendResponse } = require('../utils/response');

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return sendResponse(res, 400, false, null, 'Email and password are required.');
  }

  const result = await db.query(
    `SELECT id, tenant_id, full_name, email, password_hash, role, created_at, updated_at
     FROM users
     WHERE email = $1
     LIMIT 1`,
    [email]
  );

  if (result.rows.length === 0) {
    return sendResponse(res, 401, false, null, 'Invalid credentials.');
  }

  const user = result.rows[0];
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    return sendResponse(res, 401, false, null, 'Invalid credentials.');
  }

  const token = jwt.sign(
    {
      id: user.id,
      role: user.role,
      tenant_id: user.tenant_id
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '12h'
    }
  );

  return res.status(200).json({
    success: true,
    token,
    user: {
      id: user.id,
      name: user.full_name,
      email: user.email,
      role: user.role
    }
  });
};

const updateProfile = async (req, res) => {
  const userId = req.user && req.user.id;
  const tenantId = req.user && req.user.tenant_id;
  const { name, email, password } = req.body || {};

  if (!userId || !tenantId) {
    return sendResponse(res, 401, false, null, 'Unauthorized: token is required.');
  }

  if (!name || !email) {
    return sendResponse(res, 400, false, null, 'name and email are required.');
  }

  let passwordHash = null;
  if (password && password.trim()) {
    passwordHash = await bcrypt.hash(password, 10);
  }

  const result = await db.query(
    `UPDATE users
     SET full_name = $3,
         email = $4,
         password_hash = COALESCE($5, password_hash)
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, full_name, email, role`,
    [userId, tenantId, name, email, passwordHash]
  );

  if (result.rows.length === 0) {
    return sendResponse(res, 404, false, null, 'User not found.');
  }

  const updatedUser = result.rows[0];

  return sendResponse(res, 200, true, {
    id: updatedUser.id,
    name: updatedUser.full_name,
    email: updatedUser.email,
    role: updatedUser.role
  }, 'Profile updated successfully.');
};

module.exports = {
  login,
  updateProfile
};
