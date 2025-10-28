// converter.service.js
const axios = require('axios');
const CONVERTER_API_URL = process.env.CONVERTER_API_URL || 'http://localhost:3000/v1/conversions'; // <<<< 確認 API 端點
const CONVERTER_API_BUNDLE_PATH = process.env.CONVERTER_API_BUNDLE_PATH || '/bundle'; // <<<< 確認 Bundle 路徑
const CONVERTER_API_HEADERS = { 'Content-Type': 'application/json', 'Accept': 'application/json' };

// 輔助函式：延遲
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

exports.sendToConverter = async (data, rulesYml) => {
  const requestBody = {
    source: { type: 'raw', raw: { data, rulesYml } },
    options: { verbose: true } // 開啟 verbose 以便除錯
  };

  try {
    // 1. 初始 POST 請求
    console.log(`正在發送初始請求至 ${CONVERTER_API_URL}...`);
    const initialResponse = await axios.post(CONVERTER_API_URL, requestBody, { headers: CONVERTER_API_HEADERS });

    if (initialResponse.data?.resourceType === 'Bundle') { return initialResponse.data; } // 同步模式?

    if (!initialResponse.data?.status?.includes('queued') && !initialResponse.data?.status?.includes('processing') || !initialResponse.data.links?.self || !initialResponse.data.id) {
        throw new Error(`Converter API 未返回預期的佇列狀態。接收到: ${JSON.stringify(initialResponse.data)}`);
    }

    const statusUrl = initialResponse.data.links.self; // 使用 self link
    // Bundle URL 可能需要從 statusUrl 推斷或固定路徑
    const bundleUrl = statusUrl.endsWith(CONVERTER_API_BUNDLE_PATH) ? statusUrl : `${statusUrl}${CONVERTER_API_BUNDLE_PATH}`;
    const conversionId = initialResponse.data.id;
    console.log(`轉換已佇列 ID: ${conversionId}. 正在輪詢狀態: ${statusUrl}`);

    // 2. 輪詢狀態
    let statusData;
    let attempts = 0;
    const maxAttempts = 15; // 增加嘗試次數
    const pollInterval = 2000; // 增加輪詢間隔

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`輪詢嘗試 ${attempts}/${maxAttempts}...`);
      try {
        await delay(pollInterval); // 先等待再查詢
        const statusResponse = await axios.get(statusUrl, { headers: { 'Accept': 'application/json' } });
        statusData = statusResponse.data;

        console.log(`目前狀態: ${statusData.status}`);

        if (statusData.status === 'completed') {
          console.log('轉換完成！正在取得 Bundle...');
          // 3. 取得最終 Bundle
          const bundleResponse = await axios.get(bundleUrl, { headers: { 'Accept': 'application/fhir+json' } });

          if (bundleResponse.data?.resourceType === 'Bundle' && Array.isArray(bundleResponse.data.entry)) {
            console.log('成功取得最終 Bundle。');
            return bundleResponse.data;
          } else {
            throw new Error(`取得的結果不是有效的 Bundle。接收到: ${JSON.stringify(bundleResponse.data)}`);
          }
        } else if (statusData.status === 'failed') {
          console.error('轉換失敗 (來自狀態 API)。', statusData);
          throw new Error(`轉換失敗 ID: ${conversionId}. 原因: ${statusData.meta?.error || '未知'}`);
        }
        // 若狀態仍為 queued 或 processing，繼續輪詢
      } catch (pollError) {
          console.error(`輪詢嘗試 ${attempts} 失敗:`, pollError.message);
          if (attempts >= maxAttempts || pollError.response?.status === 404) { // 如果 404 也直接失敗
             throw new Error(`輪詢失敗或找不到轉換 ID: ${conversionId}. ${pollError.message}`);
          }
          // 其他錯誤則繼續嘗試
      }
    }

    // 超時
    throw new Error(`轉換超時 ID: ${conversionId} (超過 ${maxAttempts} 次嘗試)`);

  } catch (error) {
    console.error('sendToConverter 過程中發生錯誤:');
     // ... (詳細的 Axios 錯誤記錄) ...
    throw new Error(`與 Converter API 互動失敗: ${error.message}`);
  }
};