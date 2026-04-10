const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const { syncData } = require('../controllers/syncController');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

router.post('/', authMiddleware, asyncHandler(syncData));

module.exports = router;
