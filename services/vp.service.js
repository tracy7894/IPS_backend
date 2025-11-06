/**
 * services/vp.service.js
 * * 處理所有與 VP 驗證相關的服務
 */
const axios = require('axios');
const { v4: uuidv4 } = require('uuid'); // 引入 UUID 套件

// 讀取環境變數
const API_URL = process.env.VP_VERIFIER_API_URL;
const ACCESS_TOKEN = process.env.VP_VERIFIER_ACCESS_TOKEN; // << 使用我們建議的 .env 變數名稱
console.log(API_URL)
console.log(ACCESS_TOKEN)
/**
 * 呼叫外部 VC 驗證沙盒，取得 QR Code
 * @param {string} ref - 來自前端的驗證服務代碼
 * @returns {Promise<object>} - 包含 qrcodeImage, authUri, transactionId 的物件
 */
exports.getVPQRCode = async (ref) => {
  // 1. 檢查輸入
  if (!ref) {
    throw new Error('"ref" (驗證服務代碼) 為必填欄位。');
  }
  if (!API_URL || !ACCESS_TOKEN) {
    throw new Error('VP Verifier API URL 或 Access Token 尚未在 .env 中正確設定。');
  }

  // 2. 後端自動產生唯一的 transactionId
  const transactionId = uuidv4();
  console.log(`正在為 ref: ${ref} 產生 VP QR Code，使用 transactionId: ${transactionId}`);

  // 3. 組合完整的 API URL
  const fullApiUrl = `${API_URL}/api/oidvp/qrcode`;

  try {
    // 4. 呼叫外部 API
    // 附上 params (ref & transactionId) 和 headers (Access-Token)
    const response = await axios.get(fullApiUrl, {
      params: {
        ref, // 來自前端
        transactionId  // 後端產生
      },
      headers: {
        'Access-Token': ACCESS_TOKEN,
        'Accept': 'application/json'
      }
    });

    // 5. 回傳外部 API 的完整回應資料
    console.log('成功從 VC 驗證端取得 QR Code 資料。');
    return response.data; // 這應該就是包含 qrcodeImage, authUri, transactionId 的物件

  } catch (error) {
    console.error('呼叫 VC 驗證沙盒 API 時發生錯誤:');
    if (error.response) {
      // 伺服器有回傳錯誤
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      // 請求已發出，但未收到回應
      console.error('No response received:', error.request);
    } else {
      // 其他錯誤
      console.error('Error:', error.message);
    }
    // 拋出一個更清晰的錯誤，讓 controller 層去捕捉
    throw new Error(`呼叫 VC 驗證端 API 失敗: ${error.message}`);
  }
};

/**
 * 呼叫外部 VC 驗證沙盒，查詢上傳結果
 * @param {string} transactionId - 從前端傳來的、先前產生的交易 ID
 * @returns {Promise<object>} - 包含 { status: number, data: object } 的結果物件
 */
exports.getVPResult = async (transactionId) => {
  // 1. 檢查輸入
  if (!transactionId) {
    throw new Error('"transactionId" 為必填欄位。');
  }
  if (!API_URL || !ACCESS_TOKEN) {
    throw new Error('VP Verifier API URL 或 Access Token 尚未在 .env 中正確設定。');
  }

  // 2. 組合 API URL 和請求資料
  const fullApiUrl = `${API_URL}/api/oidvp/result`;
  const requestBody = {
    transactionId: transactionId
  };
  const requestHeaders = {
    'Access-Token': ACCESS_TOKEN,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  console.log(`正在查詢 VP 結果，transactionId: ${transactionId}`);

  try {
    // 3. 呼叫外部 API (使用 POST)
    const response = await axios.post(fullApiUrl, requestBody, {
      headers: requestHeaders
    });

    // 4. 回傳成功的結果 (狀態 200)
    // 這是使用者已上傳資料的狀況
    console.log('成功取得 VP 驗證結果 (200)。');
    return { status: response.status, data: response.data };

  } catch (error) {
    console.warn('呼叫 VC 驗證結果 API 時發生錯誤 (可能為 400 Not Ready)：');
    if (error.response) {
      // 這是最重要的地方：
      // 外部 API 回傳 400 (尚未上傳) 或 500 (系統錯誤)
      // 這對我們的後端來說是「可預期的錯誤」，我們要把這個狀態回傳給前端
      console.warn(`API 回應狀態: ${error.response.status}`);
      return { status: error.response.status, data: error.response.data };
    } else {
      // 這是非預期的錯誤 (例如網路中斷、DNS 查不到)
      console.error('Error:', error.message);
      throw new Error(`呼叫 VC 驗證端 API 時發生非預期的錯誤: ${error.message}`);
    }
  }
};