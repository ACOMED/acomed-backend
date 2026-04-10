const express = require('express');
const { login } = require('../controllers/authController');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

router.post('/login', asyncHandler(login));

module.exports = router;
