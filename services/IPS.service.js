/**
 * IPS.service.js
 * 負責處理 IPS 資料準備，並呼叫整合服務進行轉換與上傳
 */
const { v4: uuidv4 } = require('uuid');
const { loadRule } = require('../utils/fileLoader');
// 引入剛剛寫好的整合服務
const { processAndUpload } = require('./fhir.service'); 

/**
 * 主流程函式：接收前端原始資料 -> 準備資料 -> 轉換 -> 上傳
 * @param {object} rawDataFromFrontend - 包含 patient, allergy, condition 等的原始資料物件
 * @returns {Promise<object>} - FHIR Server 回傳的 Transaction Response
 */
exports.convertIPS = async (rawDataFromFrontend) => {
  console.log("--- Log A: 進入 convertIPS (Auto Upload Mode) ---");

  // --- 1. 驗證輸入 ---
  if (!rawDataFromFrontend?.病患清單?.[0]) {
      throw new Error("Invalid input data structure: Missing 病患清單[0]");
  }
  const sourcePatientData = rawDataFromFrontend.病患清單[0];
  console.log("--- Log B: 已取得 sourcePatientData ---");

  // --- **** 2. 為所有資源預先產生 UUID (保留此關鍵邏輯) **** ---
  const patientId = uuidv4();
  
  // 建立一個標準的病患參照物件，讓所有子資源共用，解決 HAPI-0541 錯誤
  const patientReferenceObj = { 
      reference: `urn:uuid:${patientId}`, 
      名稱: sourcePatientData.姓名 
  };

  // 強制覆寫 "關聯病患" 欄位，確保參照一致
  const allergies = (sourcePatientData.過敏清單 || []).map(a => ({ 
      ...a, 
      id: uuidv4(),
      關聯病患: patientReferenceObj 
  }));
  
  const conditions = (sourcePatientData.病況清單 || []).map(c => ({ 
      ...c, 
      id: uuidv4(),
      關聯病患: patientReferenceObj 
  }));
  
  const immunizations = (sourcePatientData.預防接種清單 || []).map(i => ({ 
      ...i, 
      id: uuidv4(),
      關聯病患: patientReferenceObj 
  }));
  
  const observationsGeneral = (sourcePatientData.生命徵象清單?.一般項目 || []).map(o => ({ 
      ...o, 
      id: uuidv4(),
      關聯病患: patientReferenceObj 
  }));
  
  const observationsBP = (sourcePatientData.生命徵象清單?.血壓 || []).map(bp => ({ 
      ...bp, 
      id: uuidv4(),
      關聯病患: patientReferenceObj 
  }));
  
  console.log("--- Log C: 已產生 UUID 並統一更新病患參照 ---");

  // --- 3. 準備傳給 Converter 的資料 ---
  let genderValue = 'unknown';
  if (sourcePatientData.性別) {
      const g = sourcePatientData.性別.toLowerCase(); // 轉小寫以防萬一
      if (g === '男' || g === 'male') genderValue = 'male';
      else if (g === '女' || g === 'female') genderValue = 'female';
      else genderValue = 'unknown';
  }

  const dataForConverter = {
    "病患清單": [
      {
        "id": patientId,
        "關聯病患": patientReferenceObj, 
        "身分證號": sourcePatientData.身分證號,
        "姓名": sourcePatientData.姓名,
        "姓": sourcePatientData.姓,
        "名": sourcePatientData.名,
        
        // ✅ 修正後的性別變數
        "性別": genderValue, 
        
        // ✅ 確保出生日期有值，如果沒有則給空字串 (避免 Converter 報錯)
        "出生日期": sourcePatientData.出生日期 || "", 
        
        "聯絡方式": sourcePatientData.聯絡方式,
        "地址": sourcePatientData.地址,
        "是否有效": sourcePatientData.是否有效,
        "所屬機構": sourcePatientData.所屬機構,
        "醫師": sourcePatientData.醫師,
        
        "過敏清單": allergies,
        "病況清單": conditions,
        "用藥清單": [],
        "預防接種清單": immunizations,
        "生命徵象清單": {
             "一般項目": observationsGeneral,
             "血壓": observationsBP
         }
      }
    ]
  };

  // --- 4. 載入規則 YAML ---
  const rulesYml = loadRule('IPS_rules.yml');
  console.log("--- Log D: 已載入 YAML ---");

  // --- 5. 執行 轉換 + 上傳 (取代原本的手動處理邏輯) ---
  console.log("--- Log E: 呼叫 processAndUpload ---");
  
  // 這裡會自動處理：轉換 -> 修正 Transaction 格式 -> 加 Request 欄位 -> 上傳 FHIR Server
  const result = await processAndUpload(dataForConverter, rulesYml);

  // --- 6. 處理結果 ---
  if (result.success) {
      console.log("--- Log F: 流程成功，資料已寫入 FHIR Server ---");
      // 回傳 FHIR Server 的回應 (通常是 Transaction Response Bundle)
      // 這會包含每個資源建立後的 Server ID 和狀態 (如 "201 Created")
      return result.details; 
  } else {
      console.error("--- Log F: 流程失敗 ---", result.error);
      throw new Error(`IPS 處理流程失敗: ${result.error}`);
  }
};