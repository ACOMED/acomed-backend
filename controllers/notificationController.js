const db = require('../config/db');
const { sendResponse } = require('../utils/response');

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const ensureUser = (req) => {
  const userId = req.user && req.user.id;
  const tenantId = req.user && req.user.tenant_id;

  if (!userId || !tenantId) {
    throw createHttpError(401, 'Unauthorized: token is required.');
  }

  return { userId, tenantId };
};

const listNotifications = async (req, res) => {
  const { userId, tenantId } = ensureUser(req);

  const result = await db.query(
    `SELECT id, message, created_at
     FROM notifications
     WHERE user_id = $1
       AND tenant_id = $2
       AND is_read = FALSE
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId, tenantId]
  );

  const notifications = result.rows.map((row) => ({
    id: row.id,
    message: row.message,
    time: row.created_at
  }));

  return sendResponse(res, 200, true, notifications, 'Notifications fetched successfully.');
};

const markNotificationRead = async (req, res) => {
  const { userId, tenantId } = ensureUser(req);
  const { id } = req.params;

  const result = await db.query(
    `UPDATE notifications
     SET is_read = TRUE
     WHERE id = $1
       AND user_id = $2
       AND tenant_id = $3
     RETURNING id`,
    [id, userId, tenantId]
  );

  if (result.rows.length === 0) {
    return sendResponse(res, 404, false, null, 'Notification not found.');
  }

  return sendResponse(res, 200, true, { id }, 'Notification marked as read.');
};

const registerDevice = async (req, res) => {
  const { userId } = ensureUser(req);
  const { fcm_token, device_type } = req.body || {};

  if (!fcm_token || !device_type) {
    return sendResponse(res, 400, false, null, 'fcm_token and device_type are required.');
  }

  const normalizedType = String(device_type).toLowerCase();
  if (!['android', 'ios'].includes(normalizedType)) {
    return sendResponse(res, 400, false, null, 'device_type must be android or ios.');
  }

  const result = await db.query(
    `INSERT INTO user_devices (user_id, fcm_token, device_type, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (fcm_token)
     DO UPDATE SET user_id = EXCLUDED.user_id,
                   device_type = EXCLUDED.device_type,
                   updated_at = NOW()
     RETURNING id, user_id, fcm_token, device_type, updated_at`,
    [userId, fcm_token, normalizedType]
  );

  return sendResponse(res, 200, true, result.rows[0], 'Device registered successfully.');
};

module.exports = {
  listNotifications,
  markNotificationRead,
  registerDevice
};
