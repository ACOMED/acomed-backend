const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const authMiddleware = require('../middlewares/authMiddleware');
const { getAnalyticsOverview } = require('../controllers/analyticsController');

const router = express.Router();

router.get('/overview', authMiddleware, asyncHandler(getAnalyticsOverview));

module.exports = router;
