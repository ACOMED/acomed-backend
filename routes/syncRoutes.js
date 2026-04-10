const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const { syncData } = require('../controllers/syncController');

const router = express.Router();

router.post('/', authMiddleware, syncData);

module.exports = router;
