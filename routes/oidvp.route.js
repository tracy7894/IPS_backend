/**
 * routes/oidvp.route.js
 */
const express = require('express');
const router = express.Router();
const oidvpController = require('../controllers/oidvp.controller');

// 定義路由： GET /api/oidvp/qrcode
// 前端呼叫時會是： GET /api/oidvp/qrcode?ref=YOUR_REF_CODE
router.get('/qrcode', oidvpController.getQRCode);
router.post('/result', oidvpController.getResult);
module.exports = router;