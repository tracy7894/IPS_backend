const { sendToConverter } = require('./converter.service');
const { loadRule } = require('../utils/fileLoader');

exports.convertAllergy = async (allergyData) => {
  const rulesYml = loadRule('allergyintolerance_rules.yml');
  return await sendToConverter(allergyData, rulesYml);
};
