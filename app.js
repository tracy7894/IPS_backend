const express = require('express');
require('dotenv').config();

const patientRoutes = require('./routes/patient.routes');
const allergyRoutes = require('./routes/allergy.routes');

const app = express();
app.use(express.json());

// 註冊路由
app.use('/patient', patientRoutes);
app.use('/allergy', allergyRoutes);

module.exports = app;
