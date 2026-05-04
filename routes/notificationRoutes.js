const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const authMiddleware = require('../middlewares/authMiddleware');
const {
  listNotifications,
  markNotificationRead
} = require('../controllers/notificationController');

const router = express.Router();

router.get('/', authMiddleware, asyncHandler(listNotifications));
router.patch('/:id/read', authMiddleware, asyncHandler(markNotificationRead));

module.exports = router;
