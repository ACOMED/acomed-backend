const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const authMiddleware = require('../middlewares/authMiddleware');
const { getKnowledgeBaseArticles } = require('../controllers/knowledgeBaseController');

const router = express.Router();

router.get('/articles', authMiddleware, asyncHandler(getKnowledgeBaseArticles));

module.exports = router;
