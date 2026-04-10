const jwt = require('jsonwebtoken');
const { sendResponse } = require('../utils/response');

const authMiddleware = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return sendResponse(res, 401, false, null, 'Authorization token is required.');
  }

  const token = authorization.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (error) {
    return sendResponse(res, 401, false, null, 'Invalid or expired token.');
  }
};

module.exports = authMiddleware;
