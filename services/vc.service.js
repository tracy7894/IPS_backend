// services/vc.service.js
const axios = require('axios');

// --- 輔助函式：轉換日期 (保持不變) ---
function convertToROCDate(fhirDateTime) {
  if (!fhirDateTime || typeof fhirDateTime !== 'string') return "";
  try {
    // 只取日期部分 (T之前的部分)
    const fhirDate = fhirDateTime.split('T')[0];
    const parts = fhirDate.split('-');
    if (parts.length !== 3) return "";

    const year = parseInt(parts[0], 10);
    const month = parts[1];
    const day = parts[2];

    // 檢查年月日是否有效數字
    if (isNaN(year) || isNaN(parseInt(month, 10)) || isNaN(parseInt(day, 10))) {
        return "";
    }

    const rocYear = year - 1911;
    // 民國年格式化為 3 位數，不足補零
    const rocYearStr = rocYear.toString().padStart(3, '0');

    // 確保月份和日期是兩位數
    const monthStr = month.padStart(2, '0');
    const dayStr = day.padStart(2, '0');

    return `${rocYearStr}${monthStr}${dayStr}`;
  } catch (e) {
    console.error(`Error converting date ${fhirDateTime} to ROC format:`, e);
    return "";
  }
}
function formatEmergencyContact(contacts) {
    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
        // 如果沒有 contact 陣列，直接返回空字串，而不是 "未知..."
        return "";
    }

    // 優先尋找 relationship code 為 'C' (Emergency Contact) 的聯絡人
    let emergencyContact = contacts.find(c =>
        c.relationship?.some(r => r.coding?.some(co => co.code === 'C'))
    );

    // 如果找不到 'C'，再尋找 'N' (Next of Kin)
    if (!emergencyContact) {
        emergencyContact = contacts.find(c =>
            c.relationship?.some(r => r.coding?.some(co => co.code === 'N'))
        );
    }

    // 如果還是找不到，就取第一個聯絡人作為備案
    if (!emergencyContact) {
        emergencyContact = contacts[0];
    }

    // 提取資訊
    const name = emergencyContact.name?.text || `${emergencyContact.name?.family || ''}${emergencyContact.name?.given?.join('') || ''}` || "";
    let relationshipText = '未知關係'; // 預設值
    if (emergencyContact.relationship && emergencyContact.relationship.length > 0) {
       const rel = emergencyContact.relationship[0]; // 取第一個 relationship
       const coding = rel.coding?.[0];
       if (coding?.code === 'C') relationshipText = '緊急聯絡人';
       else if (coding?.code === 'N') relationshipText = '最近親屬';
       else if (coding?.code === 'MTH') relationshipText = '母親';
       // 可以根據 http://terminology.hl7.org/CodeSystem/v2-0131 添加更多 code 映射
       else if (rel.text) relationshipText = rel.text; // 優先使用提供的 text
       else if (coding?.display) relationshipText = coding.display; // 其次使用 coding 的 display
    }
    const phone = emergencyContact.telecom?.find(t => t.system === 'phone')?.value || "";

    // 如果所有資訊都為空，則返回空字串
    if (!name && relationshipText === '未知關係' && !phone) {
        return "";
    }

    // 組合成字串
    return `${phone || '未知'}`;
}


/**
 * 將 FHIR Bundle 映射為 VC JSON 格式
 * @param {object} fhirBundle - 完整的 FHIR Bundle 物件
 * @returns {object|null} - 符合 VC API 要求的 JSON 物件，或 null
 */
// vc.service.js

function mapFhirBundleToVC(fhirBundle) {
    
  console.log("--- Inside mapFhirBundleToVC ---");
  if (!fhirBundle?.entry || !Array.isArray(fhirBundle.entry)) {
    console.error("mapFhirBundleToVC Error: Invalid or missing bundle entry array.");
    return null; // 返回 null 而不是 {}
  }

  // --- **** Log 1: 檢查 Entry 內容 **** ---
  console.log("Bundle Entries Count:", fhirBundle.entry.length);
  // console.log("First few entries:", JSON.stringify(fhirBundle.entry.slice(0, 2), null, 2)); // 印出前兩個 entry 看看結構

  // --- **** Log 2: 查找 Patient **** ---
  const patientEntry = fhirBundle.entry.find(e => e.resource?.resourceType === 'Patient');
  console.log("Found Patient Entry:", !!patientEntry);

  if (!patientEntry?.resource) {
    console.error("mapFhirBundleToVC Error: Patient resource not found in bundle.");
    return null; // 返回 null
  }
  const patient = patientEntry.resource;
  console.log("Extracted Patient Resource:", !!patient);
  // --- **** Log 3: 打印 Patient 結構 **** ---
  console.log("Patient Resource Content:", JSON.stringify(patient, null, 2));


  // --- **** Log 4: 查找 Immunizations **** ---
  const immunizations = fhirBundle.entry
    .filter(e => e.resource?.resourceType === 'Immunization')
    .map(e => e.resource);
  console.log("Found Immunizations count:", immunizations.length);


  // --- **** Log 5: 逐一檢查欄位提取 **** ---
  const vcFields = [];
  try {
      const name = patient.name?.[0]?.text || `${patient.name?.[0]?.family || ''}${patient.name?.[0]?.given?.[0] || ''}` || "";
      console.log("Extracted Name:", name);
      vcFields.push({ ename: "name", content: name });

      let genderCode = "9";
      if (patient.gender === 'male') genderCode = "1"; else if (patient.gender === 'female') genderCode = "2";
      console.log("Extracted Gender Code:", genderCode, "(Original:", patient.gender, ")");
      vcFields.push({ ename: "gender", content: genderCode });

      const rocBirthday = convertToROCDate(patient.birthDate);
      console.log("Converted ROC Birthday:", rocBirthday, "(Original:", patient.birthDate, ")");
      vcFields.push({ ename: "roc_birthday", content: rocBirthday });

      console.log("Patient Contact:", JSON.stringify(patient.contact, null, 2)); // 打印 contact 結構
      const motherContact = patient.contact?.find(c => c.relationship?.[0]?.coding?.[0]?.code === 'MTH' || c.relationship?.[0]?.text === '母親');
      const motherName = motherContact?.name?.text || "黃大姐";
      console.log("Extracted Mother's Name:", motherName);
      vcFields.push({ ename: "Mothers_name", content: motherName });

      const emergencyContactStr = formatEmergencyContact(patient.contact);
      console.log("Formatted Emergency Contact:", emergencyContactStr);
      vcFields.push({ ename: "emergency_contact_phone", content: emergencyContactStr });

let vaccineNames = "";
      try {
          vaccineNames = immunizations
              .map(imm => imm?.vaccineCode?.text || imm?.vaccineCode?.coding?.[0]?.display || null)
              .filter(name => name !== null && typeof name === 'string') // 確保是字串
              .join('_');
      } catch (vacNameError) {
          console.error("Error generating vaccineNames:", vacNameError);
      }
      console.log("Combined Vaccine Names:", vaccineNames);
      vcFields.push({ ename: "vaccine", content: vaccineNames });
const vaccinationDates = immunizations
      .map(imm => {
          // 檢查 occurrenceDateTime 是否存在且為字串
          if (imm.occurrenceDateTime && typeof imm.occurrenceDateTime === 'string') {
              return imm.occurrenceDateTime.split('T')[0]; // 只取 YYYY-MM-DD
          }
          return null; // 如果不存在或不是字串，返回 null
      })
      .filter(date => date !== null)
      .join('_'); // 用底線連接
  console.log("Combined Vaccination Dates:", vaccinationDates); // 確認結果
  vcFields.push({ ename: "Vaccination_date", content: vaccinationDates });
  } catch (fieldError) {
      console.error("Error during field extraction in mapFhirBundleToVC:", fieldError);
      return null; // 如果提取欄位出錯，返回 null
  }


  // --- 組合 vcJson (保持不變) ---
  //const vcJson = { /* ... */ fields: vcFields }; // 確保 fields 被賦值

  console.log("--- Exiting mapFhirBundleToVC with VC JSON ---");
  const vcJson = {
    // 使用您指定的固定值
    vcUid: "00000000_t001",
    issuanceDate: "20251023",
    expiredDate: "20251223",
    // fields 陣列使用我們上面提取的結果
    fields: vcFields
  };
  // --- **** 修改結束 **** ---

  console.log("--- Mapped VC JSON (Fixed Header) ---");
  console.log(JSON.stringify(vcJson, null, 2));
  console.log("--- Exiting mapFhirBundleToVC with VC JSON ---");

  return vcJson; // 確保返回的是 vcJson
}

// --- formatEmergencyContact 和其他函式保持不變 ---
// function formatEmergencyContact(contacts) { /* ... */ }
// function convertToROCDate(fhirDate) { /* ... */ }
// async function sendVCToIssuer(vcJson) { /* ... */ }

// module.exports = { ... };

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
        'Access-Token': accessToken // 從環境變數讀取 Token
      }
    });

    console.log(`✅ VC Issuer API Response Status: ${response.status}`);
    // console.log("VC Issuer Response Data:", JSON.stringify(response.data, null, 2)); // 除錯用
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
module.exports = {
  mapFhirBundleToVC,
  sendVCToIssuer
};