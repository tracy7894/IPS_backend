const axios = require('axios');
 // 若你的 Node 版本較新(v18+)，內建 fetch 則不需要這行

// --- 設定區 ---
const CONVERTER_API_URL = 'http://localhost:3000/v1/conversions';
// 你的 FHIR Server 位置，建議寫在 .env 檔案中，這裡作預設值
const MY_FHIR_SERVER_URL = process.env.FHIR_SERVER_URL || 'http://localhost:8080/fhir';

/**
 * 步驟 1: 將資料發送到 Converter 並等待轉換完成
 * @param {object} dataJson - 前端傳來的原始 JSON 資料
 * @param {string} rulesYml - YAML 規則字串
 * @returns {Promise<object>} - 轉換好的 FHIR Bundle
 */
async function convertDataToBundle(dataJson, rulesYml) {
  console.log('🚀 [Converter] 開始請求轉換...');

  // 1. 建立轉換請求
  const apiRequest = {
    source: {
      type: 'raw',
      raw: {
        data: dataJson,
        rulesYml: rulesYml
      }
    },
    options: {
      verbose: false // 生產環境通常不需要太多 log
    }
  };

  try {
    const createResponse = await fetch(CONVERTER_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiRequest)
    });

    if (!createResponse.ok) {
        throw new Error(`Converter API Error: ${createResponse.statusText}`);
    }

    const createResult = await createResponse.json();
    const conversionId = createResult.id;
    console.log(`✅ [Converter] 轉換任務已建立 ID: ${conversionId}`);

    // 2. 輪詢狀態 (Polling)
    let status = 'queued';
    let attempts = 0;
    const maxAttempts = 30; // 最多等待 60 秒

    while (status !== 'completed' && status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 等待 2 秒
      
      const statusResponse = await fetch(`${CONVERTER_API_URL}/${conversionId}`);
      const statusResult = await statusResponse.json();
      status = statusResult.status;
      
      // console.log(`⏳ [Converter] 狀態: ${status} (次數 ${++attempts})`);
      
      if (statusResult.meta && statusResult.meta.error) {
        throw new Error(`Converter Failed: ${JSON.stringify(statusResult.meta.error)}`);
      }
    }

    if (status !== 'completed') {
        throw new Error('Converter Timeout: 轉換時間過長');
    }

    // 3. 下載 Bundle
    console.log('🎉 [Converter] 轉換完成，正在下載 Bundle...');
    const bundleResponse = await fetch(
      `${CONVERTER_API_URL}/${conversionId}/bundle`,
      { headers: { 'Accept': 'application/fhir+json' } }
    );
    
    const bundle = await bundleResponse.json();
    return bundle;

  } catch (error) {
    console.error('💥 [Converter Error]:', error);
    throw error;
  }
}

/**
 * 步驟 2: 將 FHIR Bundle 發送到你的 FHIR 伺服器
 * (這是你提供的程式碼)
 */
async function sendBundleToServer(bundle, fhirServerBaseUrl) {
  if (!bundle || !fhirServerBaseUrl) {
    throw new Error("sendBundleToServer: Missing bundle or fhirServerBaseUrl");
  }

  const url = fhirServerBaseUrl.endsWith('/') ? fhirServerBaseUrl : `${fhirServerBaseUrl}/`;
  console.log(`📤 [FHIR Server] 正在上傳 Transaction Bundle 到: ${url}`);

  try {
    const response = await axios.post(url, bundle, {
      headers: {
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json'
      }
    });

    console.log(`✅ [FHIR Server] 回應狀態: ${response.status}`);
    
    // 檢查回應
    if (response.status === 200 || response.status === 201) {
       if (response.data.type === 'transaction-response') {
           console.log("📊 [FHIR Server] 交易成功摘要:");
           response.data.entry?.forEach((entry, index) => {
               const status = entry.response?.status;
               const location = entry.response?.location || entry.response?.outcome?.issue?.[0]?.diagnostics || 'OK';
               console.log(`   - Entry ${index + 1}: ${status} (${location})`);
           });
       }
       return response.data; 
    } else {
        throw new Error(`FHIR server returned unexpected status ${response.status}`);
    }

  } catch (error) {
    console.error('❌ [FHIR Server Error]: 上傳失敗');
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('   Error:', error.message);
    }
    throw error; // 讓外層知道上傳失敗
  }
}

/**
 * 主流程：整合轉換與上傳
 * @param {object} dataJson - 原始資料
 * @param {string} rulesYml - 規則字串
 * @returns {Promise<object>} - FHIR Server 的回應結果
 */
async function processAndUpload(dataJson, rulesYml) {
    try {
        // 1. 呼叫 Converter 轉出 Bundle
        const bundle = await convertDataToBundle(dataJson, rulesYml);

        // 2. 補強 Bundle (確保是 transaction 且有 request)
        // 雖然 IPS.service.js 已經有處理，但這裡做最後一道防線檢查也不錯
        if (bundle.type !== 'transaction') {
            console.warn('⚠️ 警告: Converter 回傳的不是 Transaction Bundle，嘗試強制轉換...');
            bundle.type = 'transaction';
        }
        
        // 確保每個 entry 都有 request (如果 Converter 沒加的話)
        bundle.entry?.forEach(entry => {
            if (!entry.request && entry.resource) {
                entry.request = {
                    method: "POST",
                    url: entry.resource.resourceType
                };
            }
        });

        // 3. 上傳到自己的 FHIR Server
        const serverResponse = await sendBundleToServer(bundle, MY_FHIR_SERVER_URL);
        
        return {
            success: true,
            bundleId: serverResponse.id,
            details: serverResponse
        };

    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = { 
    processAndUpload, 
    convertDataToBundle, 
    sendBundleToServer 
};