const { sendToConverter } = require('./converter.service');
const { loadRule } = require('../utils/fileLoader');

exports.convertPatient = async (patientData) => {
  const rulesYml = loadRule('patient_rules.yml');
  return await sendToConverter(patientData, rulesYml);
};
