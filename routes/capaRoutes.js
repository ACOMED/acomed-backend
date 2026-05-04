const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const authMiddleware = require('../middlewares/authMiddleware');
const {
  listCapas,
  createCapa,
  updateCapa,
  updateCapaStatus,
  assignCapa
} = require('../controllers/capaController');

const router = express.Router();

router.get('/', authMiddleware, asyncHandler(listCapas));
router.post('/', authMiddleware, asyncHandler(createCapa));
router.put('/:id', authMiddleware, asyncHandler(updateCapa));
router.patch('/:id/status', authMiddleware, asyncHandler(updateCapaStatus));
router.patch('/:id/assign', authMiddleware, asyncHandler(assignCapa));

module.exports = router;
