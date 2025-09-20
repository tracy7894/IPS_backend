const express = require('express');
require('dotenv').config();

const patientRoutes = require('./routes/patient.routes');
const allergyRoutes = require('./routes/allergy.routes');
const IPSRoutes=require('./routes/IPS.routes')
const app = express();
app.use(express.json());

// 註冊路由
app.use('/patient', patientRoutes);
app.use('/allergy', allergyRoutes);
app.use('/IPS',IPSRoutes)
module.exports = app;
