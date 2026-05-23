const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const authMiddleware = require('../middlewares/authMiddleware');
const {
  listNotifications,
  markNotificationRead,
  registerDevice
} = require('../controllers/notificationController');

const router = express.Router();

router.get('/', authMiddleware, asyncHandler(listNotifications));
router.post('/register-device', authMiddleware, asyncHandler(registerDevice));
router.patch('/:id/read', authMiddleware, asyncHandler(markNotificationRead));

module.exports = router;
