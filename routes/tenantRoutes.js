const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const authMiddleware = require('../middlewares/authMiddleware');
const {
  listFacilities,
  createFacility,
  updateFacility,
  deleteFacility,
  listUsers,
  createUser,
  updateUser,
  updateUserRole,
  deleteUser,
  listFacilityInspectors,
  assignInspectorToFacility,
  removeInspectorFromFacility
} = require('../controllers/tenantController');

const router = express.Router();

router.get('/facilities', authMiddleware, asyncHandler(listFacilities));
router.post('/facilities', authMiddleware, asyncHandler(createFacility));
router.put('/facilities/:id', authMiddleware, asyncHandler(updateFacility));
router.delete('/facilities/:id', authMiddleware, asyncHandler(deleteFacility));

router.get('/users', authMiddleware, asyncHandler(listUsers));
router.post('/users', authMiddleware, asyncHandler(createUser));
router.put('/users/:id', authMiddleware, asyncHandler(updateUser));
router.patch('/users/:id/role', authMiddleware, asyncHandler(updateUserRole));
router.delete('/users/:id', authMiddleware, asyncHandler(deleteUser));

router.get('/facilities/:id/inspectors', authMiddleware, asyncHandler(listFacilityInspectors));
router.post('/facilities/:id/inspectors', authMiddleware, asyncHandler(assignInspectorToFacility));
router.delete('/facilities/:id/inspectors/:inspectorId', authMiddleware, asyncHandler(removeInspectorFromFacility));

router.post('/facilities/:id/assign-inspector', authMiddleware, asyncHandler(assignInspectorToFacility));
router.delete('/facilities/:id/assign-inspector/:inspector_id', authMiddleware, asyncHandler(removeInspectorFromFacility));

module.exports = router;
