const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const authMiddleware = require('../middlewares/authMiddleware');
const { upload } = require('../middlewares/guideUpload');
const { listGuides, uploadGuide } = require('../controllers/guideController');

const router = express.Router();

router.get('/', authMiddleware, asyncHandler(listGuides));
router.post('/', authMiddleware, upload.single('file'), asyncHandler(uploadGuide));

module.exports = router;
