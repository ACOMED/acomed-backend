const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const { getTemplateById } = require('../controllers/templateController');

const router = express.Router();

router.get('/:id', authMiddleware, asyncHandler(getTemplateById));

module.exports = router;
