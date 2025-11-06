/**
 * controllers/oidvp.controller.js
 */
const vpService = require('../services/vp.service');

exports.getQRCode = async (req, res) => {
  try {
    // 1. 從前端的 query string 取得 ref
    const { ref } = req.query;
        console.log("ref")
      console.log(ref)
    // 2. 呼叫 service 處理核心邏輯
    const result = await vpService.getVPQRCode(ref);

    // 3. 將從沙盒 API 拿到的結果 (包含 qrcodeImage, authUri) 原封不動回傳給前端
    res.status(200).json(result);

  } catch (error) {
    console.error('Error in getQRCode controller:', error.message);
    
    // 根據錯誤類型給予不同的 HTTP 狀態碼
    if (error.message.includes('"ref"')) {
      return res.status(400).json({ message: error.message }); // 400 Bad Request
    }
    // 其他一律視為伺服器內部錯誤
    res.status(500).json({ message: '產生 QR Code 失敗', error: error.message });
  }
};

exports.getResult = async (req, res) => {
  try {
    // 1. 從前端的 request body 取得 transactionId
    const { transactionId } = req.body;
        console.log("transactionId")
      console.log(transactionId)
    if (!transactionId) {
      return res.status(400).json({ message: 'Request body 中必須包含 transactionId' });
    }

    // 2. 呼叫 service 處理
    const result = await vpService.getVPResult(transactionId);

    // 3. 將從沙盒 API 拿到的狀態碼 (200 或 400) 和資料，原封不動回傳給前端
    res.status(result.status).json(result.data);

  } catch (error) {
    // 這裡只會捕捉到 service 拋出的「非預期」錯誤 (例如 .env 沒設)
    console.error('Error in getResult controller:', error.message);
    res.status(500).json({ message: '查詢 VP 結果時發生未預期的伺服器錯誤', error: error.message });
  }
};