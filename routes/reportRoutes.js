const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const authMiddleware = require('../middlewares/authMiddleware');
const { getReports } = require('../controllers/reportController');

const router = express.Router();

router.get('/', authMiddleware, asyncHandler(getReports));

module.exports = router;
