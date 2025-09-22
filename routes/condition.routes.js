const express = require('express');
const router = express.Router();
const conditionController = require('../controllers/condition.controller')

router.get('/snomed', conditionController.getSnomed);

module.exports = router;
