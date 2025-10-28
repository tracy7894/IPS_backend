// 假設在 fhir.service.js 或類似檔案中
const axios = require('axios');

/**
 * 將 FHIR Bundle (通常是 transaction) 發送到指定的 FHIR 伺服器
 * @param {object} bundle - 要發送的 FHIR Bundle 物件
 * @param {string} fhirServerBaseUrl - FHIR 伺服器的根 URL (例如 "http://localhost:8080/fhir")
 * @returns {Promise<object>} - FHIR 伺服器返回的回應 Bundle
 */
async function sendBundleToServer(bundle, fhirServerBaseUrl) {
  if (!bundle || !fhirServerBaseUrl) {
    throw new Error("sendBundleToServer: Missing bundle or fhirServerBaseUrl");
  }

  // 伺服器的根端點通常就是 base URL
  const url = fhirServerBaseUrl.endsWith('/') ? fhirServerBaseUrl : `${fhirServerBaseUrl}/`;

  console.log(`正在將 Transaction Bundle POST 到: ${url}`);

  try {
    const response = await axios.post(url, bundle, {
      headers: {
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json' // 告知伺服器我們期望收到 FHIR JSON
      },
      // 可以增加 timeout 設定
      // timeout: 30000 // 例如 30 秒
    });

    console.log(`FHIR 伺服器回應狀態: ${response.status}`);
    // console.log("FHIR 伺服器回應內容:", JSON.stringify(response.data, null, 2)); // 除錯用

    // 檢查回應是否成功 (通常是 200 OK)
    if (response.status === 200 && response.data && response.data.resourceType === 'Bundle') {
       console.log("Bundle 成功提交到 FHIR 伺服器！");
       // 檢查 transaction response bundle 的結果
       if (response.data.type === 'transaction-response') {
           response.data.entry?.forEach(entry => {
               console.log(` - ${entry.response?.location || entry.response?.outcome?.issue?.[0]?.diagnostics || 'Unknown status'}: ${entry.response?.status}`);
           });
       }
       return response.data; // 返回伺服器的回應 Bundle
    } else {
        throw new Error(`FHIR server returned unexpected status ${response.status} or invalid response body.`);
    }

  } catch (error) {
    console.error('傳送 Bundle 到 FHIR 伺服器時發生錯誤:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2)); // 顯示伺服器返回的錯誤細節
    } else {
      console.error('Error:', error.message);
    }
    throw new Error(`Failed to send Bundle to FHIR server: ${error.message}`); // 重新拋出錯誤
  }
}

module.exports = { sendBundleToServer };