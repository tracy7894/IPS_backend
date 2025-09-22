const snomedData = require('../data/snomedConditions.ts');


/**
 * 直接回傳已載入的 Snomed Condition 資料
 * @returns {Promise<Object>} Snomed 資料物件
 */
exports.readSnomedJson = async () => {
  // 因為資料已經在啟動時載入，這裡直接回傳即可
  // 我們仍然使用 async 是為了保持與 controller 的介面一致
  return snomedData;
};