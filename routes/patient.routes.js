const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patient.controller');

router.post('/convert', patientController.convertPatient);

module.exports = router;
