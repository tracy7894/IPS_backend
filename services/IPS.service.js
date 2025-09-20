const { sendToConverter } = require('./converter.service');
const { loadRule } = require('../utils/fileLoader');

exports.convertIPS = async (IPSData) => {
  const rulesYml = loadRule('IPS_rules.yml');
  return await sendToConverter(IPSData, rulesYml);
};
