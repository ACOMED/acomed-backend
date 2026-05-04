const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const {
	listTemplates,
	getTemplateById,
	createTemplate,
	updateTemplate,
	deleteTemplate
} = require('../controllers/templateController');

const router = express.Router();

router.get('/', authMiddleware, asyncHandler(listTemplates));
router.get('/:id', authMiddleware, asyncHandler(getTemplateById));
router.post('/', authMiddleware, asyncHandler(createTemplate));
router.put('/:id', authMiddleware, asyncHandler(updateTemplate));
router.delete('/:id', authMiddleware, asyncHandler(deleteTemplate));

module.exports = router;
