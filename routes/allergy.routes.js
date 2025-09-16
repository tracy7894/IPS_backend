const express = require('express');
const router = express.Router();
const allergyController = require('../controllers/allergy.controller');

router.post('/convert', allergyController.convertAllergy);

module.exports = router;
