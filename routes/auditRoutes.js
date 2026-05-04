const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const authMiddleware = require('../middlewares/authMiddleware');
const {
  listAudits,
  getAuditById,
  createAudit,
  updateAudit,
  updateAuditStatus
} = require('../controllers/auditController');

const router = express.Router();

router.get('/', authMiddleware, asyncHandler(listAudits));
router.get('/:id', authMiddleware, asyncHandler(getAuditById));
router.post('/', authMiddleware, asyncHandler(createAudit));
router.put('/:id', authMiddleware, asyncHandler(updateAudit));
router.patch('/:id/status', authMiddleware, asyncHandler(updateAuditStatus));

module.exports = router;
