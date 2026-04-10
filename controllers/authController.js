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
    `SELECT id, full_name, email, password_hash, role, created_at, updated_at
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
      sub: user.id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '12h'
    }
  );

  return sendResponse(
    res,
    200,
    true,
    {
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    },
    'Login successful.'
  );
};

module.exports = {
  login
};
