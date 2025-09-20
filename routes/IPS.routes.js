const express = require('express');
const router = express.Router();
const IPSController = require('../controllers/IPS.controller.js');

router.post('/convert', IPSController.convertIPS);

module.exports = router;
