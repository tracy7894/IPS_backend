const express = require('express');
require('dotenv').config();
const cors = require("cors");

const patientRoutes = require('./routes/patient.routes');
const allergyRoutes = require('./routes/allergy.routes');
const IPSRoutes=require('./routes/IPS.routes')
const conditionRoutes=require('./routes/condition.routes')
const fhirRoutes=require('./routes/fhir.routes')
//const vcRoutes=require('./routes/vc.routes')
const app = express();

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || "http://localhost:3001",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));
app.use(express.json());
// 註冊路由
app.use('/patient', patientRoutes);
app.use('/allergy', allergyRoutes);
app.use('/IPS',IPSRoutes)
app.use('/condition',conditionRoutes)
app.use('/fhir',fhirRoutes)
//app.use('/vc',vcRoutes)
module.exports = app;
