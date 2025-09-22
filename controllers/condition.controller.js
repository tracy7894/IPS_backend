const conditionService = require('../services/condition.service');

/**
 * 處理 GET 請求，取得 condition JSON 資料並回傳
 * @param {object} req - Express request 物件
 * @param {object} res - Express response 物件
 */
exports.getSnomed = async (req, res) => {
  try {
    // 呼叫 service 來讀取檔案資料
    const snomedData = await conditionService.readSnomedJson();

    // 成功讀取後，以 JSON 格式回傳給前端，狀態碼為 200 (OK)
    res.status(200).json(snomedData);

  } catch (error) {
    // 如果 service 層拋出錯誤，在這裡捕捉
    // 回傳 500 (Internal Server Error) 錯誤訊息給前端
    res.status(500).json({
      message: 'Failed to retrieve snomed data.',
      error: error.message
    });
  }
};