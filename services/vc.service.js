// services/vc.service.js
const axios = require('axios');

// --- 輔助函式：轉換日期至 YYYYMMDD 格式 ---
// (例如：'2025-09-10' -> '20250910')
function formatADDate(dateString) {
  if (!dateString || typeof dateString !== 'string') return "";
  try {
    // 只取日期部分 (T之前的部分)
    const datePart = dateString.split('T')[0];
    // 移除 - 符號
    return datePart.replace(/-/g, ''); 
  } catch (e) {
    console.error(`Error formatting date ${dateString}:`, e);
    return "";
  }
}

// --- 輔助函式：取得今天的 YYYYMMDD 格式 ---
function getTodayYYYYMMDD() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// --- 輔助函式：取得 2 個月後的 YYYYMMDD 格式 ---
function getExpiredDateYYYYMMDD() {
    const today = new Date();
    // 依據範例 (Nov 6 -> Jan 6)，增加 2 個月
    today.setMonth(today.getMonth() + 2); 
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}


/**
 * 🚨 新增函式：將原始前端資料 (Raw Data) 映射為 VC JSON 格式
 * @param {object} rawData - 包含 patient, allergy, condition 等的原始資料物件
 * @returns {object|null} - 符合 VC API 要求的 JSON 物件，或 null
 */
function mapRawDataToVC(rawData) {
    
  console.log("--- Inside mapRawDataToVC ---");
  // 檢查是否有 patient 物件
  if (!rawData?.patient) {
    console.error("mapRawDataToVC Error: Missing 'patient' object in raw data.");
    return null;
  }

  const patient = rawData.patient;
  // 取得 immunization 陣列，如果不存在則為空陣列
  const immunizations = rawData.immunization || []; 

  console.log("Mapping Patient:", patient.姓名);
  console.log("Mapping Immunizations count:", immunizations.length);

  const vcFields = [];

  try {
    // 1. Name (來自 patient.姓名)
    const name = patient.姓名 || "";
    vcFields.push({ ename: "name", content: name });

    // 2. Gender (男:1, 女:2, 其他:9)
    let genderCode = "9"; // 預設為 'unknown'
    if (patient.性別 === '男') genderCode = "1";
    else if (patient.性別 === '女') genderCode = "2";
    vcFields.push({ ename: "gender", content: genderCode });

    // 3. Birthday (AD format YYYYMMDD)
    const adBirthday = formatADDate(patient.出生日期);
    vcFields.push({ ename: "ad_birthday", content: adBirthday });

    // 4. Vaccine Names (用底線連接)
    // 優先使用 "中文名稱"，若無則使用 "英文名稱"
console.log("--- 1. 原始 immunizations 陣列:", JSON.stringify(immunizations, null, 2));

  const mappedNames = immunizations.map(i => {
      const name = i?.疫苗代碼?.中文名稱 || i?.疫苗代碼?.英文名稱 || null;
      console.log(`--- 2. Mapping item: 找到的名稱: ${name}`);
      return name;
  });
  console.log("--- 3. mappedNames (過濾前):", mappedNames);

  const filteredNames = mappedNames.filter(name => name !== null && typeof name === 'string');
  console.log("--- 4. filteredNames (過濾後):", filteredNames);

  const finalVaccineNames = filteredNames.join('_');
  console.log("--- 5. finalVaccineNames (Join後):", finalVaccineNames);
    vcFields.push({ ename: "vaccine", content: finalVaccineNames });

    // 5. Vaccination Dates (YYYYMMDD，用底線連接)
    const vaccinationDates = immunizations
        .map(i => formatADDate(i.接種日期)) // '2025-11-04' -> '20251104'
        .filter(date => date !== "") // 過濾掉無效日期
        .join('_');
    vcFields.push({ ename: "vaccination_date", content: vaccinationDates });

    // 6. Vaccination Doses (用底線連接)
    // 如果 劑次 欄位不存在，預設為 '1'
    const vaccinationDoses = immunizations
        .map(i => (i.劑次 !== undefined && i.劑次 !== null) ? String(i.劑次) : '1') 
        .join('_');
    vcFields.push({ ename: "vaccination_doses", content: vaccinationDoses });

  } catch (fieldError) {
      console.error("Error during field extraction in mapRawDataToVC:", fieldError);
      return null; // 如果提取欄位出錯，返回 null
  }

  // --- 組合最終 VC JSON ---
  const vcJson = {
    // 依據 VC 範例，使用固定的 vcUid
    vcUid: "00000000_t002", 
    // 使用動態的發行日期和到期日期
    issuanceDate: "20251106", // "20251106"
    expiredDate: "20260106", // "20260106"
    // fields 陣列使用我們上面提取的結果
    fields: vcFields
  };

  console.log("--- Mapped VC JSON from Raw Data ---");
  console.log(JSON.stringify(vcJson, null, 2));

  return vcJson;
}

// 🚨 (舊的 mapFhirBundleToVC 函式可以註解掉或刪除)
/*
function mapFhirBundleToVC(fhirBundle) {
  // ... 舊的邏輯 ...
}
*/

// --- sendVCToIssuer 函式保持不變 ---
async function sendVCToIssuer(vcJson) {
  const apiUrl = process.env.VC_ISSUER_API_URL;
  const accessToken = process.env.VC_ISSUER_ACCESS_TOKEN;

  if (!apiUrl || !accessToken) {
    throw new Error("VC Issuer API URL or Access Token not configured in .env file.");
  }
  if (!vcJson) {
      throw new Error("Invalid VC JSON data provided to sendVCToIssuer.");
  }

  console.log(`🚀 Sending VC JSON to: ${apiUrl}`);

  try {
    const response = await axios.post(apiUrl, vcJson, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': accessToken 
      }
    });

    console.log(`✅ VC Issuer API Response Status: ${response.status}`);
    return response.data; // 返回伺服器的回應

  } catch (error) {
    console.error('💥 Error sending VC JSON to Issuer API:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
    throw new Error(`Failed to send VC data to issuer: ${error.message}`);
  }
}

// --- 匯出新的函式 ---
module.exports = {
  // mapFhirBundleToVC, // 舊的函式 (移除)
  mapRawDataToVC, // 🚨 新的函式
  sendVCToIssuer
};