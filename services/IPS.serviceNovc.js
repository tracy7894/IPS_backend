/**
 * IPS.service.js
 * 負責處理 IPS Bundle 的建立流程
 */
const { v4: uuidv4 } = require('uuid');
const { sendToConverter } = require('./converter.service'); // 引入帶輪詢的版本
const { loadRule } = require('../utils/fileLoader');

// --- 輔助函式：建立 Composition Section 的 Entry 列表 ---
const createEntries = (list) => {
  if (!list || list.length === 0) {
    return undefined;
  }
  return list
    .map(item => {
      // 確保 item 和 item.id 存在且 id 是字串
      if (item && typeof item.id === 'string') {
        // 確保 reference 格式正確 (使用 urn:uuid: 前綴)
        return { reference: item.id.startsWith('urn:uuid:') ? item.id : `urn:uuid:${item.id}` };
      } else {
        console.warn('Composition entry skipped due to missing/invalid id:', item);
        return null;
      }
    })
    .filter(entry => entry !== null);
};

// --- 輔助函式：手動建立 Composition ---
function createIPSComposition(patientData) {
  // (函式內容保持不變，它會從傳入的 patientData 中讀取 ID)
  const compositionId = patientData.文件資訊?.id || uuidv4();
  const patientRef = patientData.關聯病患?.reference || (patientData.id ? `urn:uuid:${patientData.id}` : undefined);
  // ... (其他 Composition 欄位設定) ...
  const composition = { /* ... 完整的 Composition 定義 ... */ };
  // ... (清理 section 等邏輯) ...
  console.log("--- Manually Created Composition ---");
  console.log(JSON.stringify(composition, null, 2));
  return composition;
}


/**
 * 主流程函式：接收前端原始資料，轉換為 IPS FHIR Bundle
 * @param {object} rawDataFromFrontend - 包含 patient, allergy, condition 等的原始資料物件
 * @returns {Promise<object>} - 成功轉換後的 FHIR Bundle JSON 物件
 */
exports.convertIPS = async (rawDataFromFrontend) => {
  console.log("--- Log A: 進入 convertIPS ---");
  // --- 1. 驗證輸入 ---
  if (!rawDataFromFrontend?.病患清單?.[0]) {
      throw new Error("Invalid input data structure: Missing 病患清單[0]");
  }
  const sourcePatientData = rawDataFromFrontend.病患清單[0];
  console.log("--- Log B: 已取得 sourcePatientData ---");

  // --- **** 2. 為所有資源預先產生 UUID **** ---
  const patientId = uuidv4();
  const compositionId = uuidv4();
  const documentDate = new Date().toISOString();

  // 將 UUID 附加到原始資料上 (或建立新的帶 ID 的列表)
  const allergies = (sourcePatientData.過敏清單 || []).map(a => ({ ...a, id: uuidv4() }));
  const conditions = (sourcePatientData.病況清單 || []).map(c => ({ ...c, id: uuidv4() }));
  const immunizations = (sourcePatientData.預防接種清單 || []).map(i => ({ ...i, id: uuidv4() }));
  const observationsGeneral = (sourcePatientData.生命徵象清單?.一般項目 || []).map(o => ({ ...o, id: uuidv4() }));
  const observationsBP = (sourcePatientData.生命徵象清單?.血壓 || []).map(bp => ({ ...bp, id: uuidv4() }));
  console.log("--- Log C: 已為所有資源產生 UUID ---");


  // --- 3. 準備傳給 Converter 的資料 (使用新產生的 ID) ---
  const dataForConverter = {
    "病患清單": [
      {
        "id": patientId, // <<<< 使用新產生的 Patient ID
        "關聯病患": { "reference": `urn:uuid:${patientId}`, "名稱": sourcePatientData.姓名 }, // Converter 內部可能需要
        "身分證號": sourcePatientData.身分證號,
        "姓名": sourcePatientData.姓名,
        "姓": sourcePatientData.姓,
        "名": sourcePatientData.名,
        "性別": sourcePatientData.性別 === '男' ? 'male' : (sourcePatientData.性別 === '女' ? 'female' : 'unknown'),
        "出生日期": sourcePatientData.出生日期,
        "聯絡方式": sourcePatientData.聯絡方式,
        "地址": sourcePatientData.地址,
        "是否有效": sourcePatientData.是否有效,
        "所屬機構": sourcePatientData.所屬機構,
        "醫師": sourcePatientData.醫師,
        // **** 傳遞已附加 ID 的版本 ****
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

  // --- 4. 載入 **不含** Composition 規則的 YAML ---
  const rulesYml = loadRule('IPS_rules.yml');
  console.log("--- Log D: 已載入 YAML (無 Composition) ---");

  // --- 5. 呼叫 Converter ---
  let baseBundle;
  try {
    console.log("--- Log E: 即將呼叫 sendToConverter ---");
    baseBundle = await sendToConverter(dataForConverter, rulesYml);
    console.log("--- Log F: sendToConverter 返回:", baseBundle ? `Bundle with ${baseBundle.entry?.length} entries` : baseBundle);
  } catch (error) {
     console.error("Converter Service 呼叫失敗:", error);
     throw new Error("Conversion failed.");
  }

  // --- 6. 檢查 Converter 返回結果 ---
   if (!baseBundle || typeof baseBundle !== 'object' || !Array.isArray(baseBundle.entry)) {
      console.error("Converter 未返回有效的 Bundle 結構。接收到:", baseBundle);
      throw new Error("Converter did not return a valid bundle.");
   }
   console.log("--- Log G: baseBundle 結構有效 ---");


  // --- 7. 組合資料 **給** createIPSComposition 使用 (包含所有 UUID) ---
   const completePatientDataForComp = {
       ...sourcePatientData, // 複製原始資料
       id: patientId,         // 使用一致的 Patient ID
       文件資訊: { id: compositionId, 文件日期: documentDate },
       關聯病患: { reference: `urn:uuid:${patientId}`, 名稱: sourcePatientData.姓名 },
       醫師: sourcePatientData.醫師,
       // **** 傳遞已附加 ID 的版本 ****
       過敏清單: allergies,
       病況清單: conditions,
       用藥清單: [],
       預防接種清單: immunizations,
       生命徵象清單: { 一般項目: observationsGeneral, 血壓: observationsBP }
   };
   console.log("--- Log J: 即將呼叫 createIPSComposition ---");
   const compositionResource = createIPSComposition(completePatientDataForComp);
   console.log("--- Log K: createIPSComposition 已返回 ---");

  // --- 8. 插入 Composition ---
   baseBundle.entry.unshift({
       fullUrl: `urn:uuid:${compositionResource.id}`,
       resource: compositionResource
   });
   console.log("Composition 已插入 Bundle。");

  // --- 9. 修正 Bundle Metadata ---
   baseBundle.type = "document";
   const systemUuid = "urn:uuid:0f9ea8c1-0a96-4f4f-85f0-b109ee8c7011"; // 您的系統 UUID
   baseBundle.identifier = {
      system: systemUuid,
      value: baseBundle.id || uuidv4()
   };
   baseBundle.meta = {
       profile: [ "http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips" ]
   };
   console.log("Bundle Metadata 已修正。");

  // --- 10. 回傳結果 ---
  console.log("IPS Bundle 轉換成功！");
  return baseBundle;
};

// --- **** 請確保 createIPSComposition 函式也包含在同一個檔案或被正確引入 **** ---
// function createIPSComposition(patientData) { ... }
// --- 輔助函式：手動建立 Composition ---
function createIPSComposition(patientData) {
  const compositionId = patientData.文件資訊?.id || uuidv4();
  const patientRef = patientData.關聯病患?.reference || (patientData.id ? `urn:uuid:${patientData.id}` : undefined);
  const patientDisplay = patientData.關聯病患?.名稱 || patientData.姓名;
  const authorRef = patientData.醫師?.reference;
  const authorDisplay = patientData.醫師?.名稱;
  const documentDate = patientData.文件資訊?.文件日期 || new Date().toISOString();

  // 輔助函式：建立 section.entry
  const createEntries = (list) => {
    // **** 修正：即使列表為空，也返回空陣列 ****
    if (!list) return [];
    const entries = list
      .map(item => {
        if (item && typeof item.id === 'string') {
          return { reference: item.id.startsWith('urn:uuid:') ? item.id : `urn:uuid:${item.id}` };
        }
        console.warn('Composition entry skipped due to missing/invalid id:', item);
        return null;
      })
      .filter(entry => entry !== null);
    // **** 返回 entries 陣列 (可能是空的 []) ****
    return entries;
  };

  const composition = {
    resourceType: "Composition",
    id: compositionId,
    // --- **** 確保 Composition 內部有 meta.profile **** ---
    meta: {
      profile: ["http://hl7.org/fhir/uv/ips/StructureDefinition/Composition-uv-ips"]
    },
    // --- **** 確保結束 **** ---
    status: "final",
    type: { coding: [{ system: "http://loinc.org", code: "60591-5", display: "Patient summary document" }] },
    subject: patientRef ? { reference: patientRef, display: patientDisplay } : undefined,
    date: documentDate,
    author: authorRef ? [{ reference: authorRef, display: authorDisplay }] : [],
    title: "International Patient Summary",
    section: [
      // Section: Allergies (Mandatory)
      {
        title: "Allergies and Intolerances",
        code: { coding: [{ system: "http://loinc.org", code: "48765-2" }] },
        text: { status: "generated", div: "<div xmlns=\"http://www.w3.org/1999/xhtml\">Summary of known allergies and intolerances.</div>" },
        entry: createEntries(patientData.過敏清單) // 可能返回 []
      },
      // Section: Problems (Mandatory)
      {
        title: "Problem List",
        code: { coding: [{ system: "http://loinc.org", code: "11450-4" }] },
        text: { status: "generated", div: "<div xmlns=\"http://www.w3.org/1999/xhtml\">Summary of active problems.</div>" },
        entry: createEntries(patientData.病況清單) // 可能返回 []
      },
      // Section: Medications (Mandatory)
      {
        title: "Medication Summary",
        code: { coding: [{ system: "http://loinc.org", code: "10160-0" }] },
        text: { status: "generated", div: "<div xmlns=\"http://www.w3.org/1999/xhtml\">No known medications to summarize.</div>" },
        // --- **** 修正：確保 entry 永遠存在 (至少是 []) **** ---
        entry: createEntries(patientData.用藥清單) // createEntries 現在會返回 []
      },
      // Section: Immunizations (Recommended)
      {
        title: "Immunizations",
        code: { coding: [{ system: "http://loinc.org", code: "11369-6" }] },
        text: { status: "generated", div: "<div xmlns=\"http://www.w3.org/1999/xhtml\">Summary of immunizations received.</div>" },
        entry: createEntries(patientData.預防接種清單) // 可能返回 []
      },
      // Section: Vital Signs (Optional)
      {
        title: "Vital Signs",
        code: { coding: [{ system: "http://loinc.org", code: "8716-3" }] },
        text: { status: "generated", div: "<div xmlns=\"http://www.w3.org/1999/xhtml\">Summary of recent vital signs.</div>" },
        entry: (createEntries(patientData.生命徵象清單?.一般項目) || []).concat(createEntries(patientData.生命徵象清單?.血壓) || []) // 可能返回 []
      }
      // 過濾條件可以移除或調整，因為現在 entry 總是存在 (可能是 [])
    ] //.filter(...)
  };

  // --- **** 移除清理空 entry 的 forEach 迴圈 **** ---
  // (因為現在 entry 可能是必要的空陣列 [])
  // composition.section.forEach(sec => {
  //   if (sec.entry && sec.entry.length === 0) {
  //     delete sec.entry; // <<<< 移除這段邏輯
  //   }
  //   // ... (保留確保 text 存在的邏輯) ...
  // });
  
   if (!composition.subject) { delete composition.subject; }

  console.log("--- Manually Created Composition (Revised) ---");
  console.log(JSON.stringify(composition, null, 2));
  return composition;
}