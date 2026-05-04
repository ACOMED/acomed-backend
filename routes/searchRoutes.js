const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const authMiddleware = require('../middlewares/authMiddleware');
const { searchAll } = require('../controllers/searchController');

const router = express.Router();

router.get('/', authMiddleware, asyncHandler(searchAll));

module.exports = router;
