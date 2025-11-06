/**
 * IPS.service.js
 * 負責處理 IPS Bundle 的建立流程
 */
const { v4: uuidv4 } = require('uuid');
const { sendToConverter } = require('./converter.service'); // 引入帶輪詢的版本
const { loadRule } = require('../utils/fileLoader');
const { mapRawDataToVC, sendVCToIssuer } = require('./vc.service');
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
  if (!rawDataFromFrontend?.patient) {
      console.error("錯誤：傳入的 rawDataFromFrontend 結構不符預期，缺少 'patient' 物件。");
      throw new Error("Invalid input data: Missing 'patient' object.");
  }
  // 將前端資料賦值給變數，並提供預設空陣列
  const sourcePatient = rawDataFromFrontend.patient;
  const sourceAllergies = rawDataFromFrontend.allergy || [];
  const sourceConditions = rawDataFromFrontend.condition || [];
  const sourceImmunizations = rawDataFromFrontend.immunization || [];
  const sourceVitalsGeneral = rawDataFromFrontend.observationGeneral || [];
  const sourceVitalsBP = rawDataFromFrontend.observationBP || [];
  console.log("--- Log B: 已取得 sourcePatient, sourceAllergies, sourceConditions ---");
    console.log(JSON.stringify(rawDataFromFrontend, null, 2));

  // --- **** 2. 為所有資源預先產生 UUID (修正) **** ---
  const patientId = sourcePatient.id || uuidv4(); // 如果前端傳來 ID 就用，沒有就新產生
  const compositionId = uuidv4();
  const documentDate = new Date().toISOString();

  // 將 UUID 附加到原始資料上
  const allergies = sourceAllergies.map(a => ({ ...a, id: a.id || uuidv4() }));
  const conditions = sourceConditions.map(c => ({ ...c, id: c.id || uuidv4() }));
  const immunizations = sourceImmunizations.map(i => ({ ...i, id: i.id || uuidv4() }));
  const observationsGeneral = sourceVitalsGeneral.map(o => ({ ...o, id: o.id || uuidv4() }));
  const observationsBP = sourceVitalsBP.map(bp => ({ ...bp, id: bp.id || uuidv4() }));
  console.log("--- Log C: 已為所有資源產生 UUID ---");


  // --- **** 3. 準備傳給 Converter 的資料 (dataForConverter) (修正) **** ---
  // 任務：將扁平的資料，組合成 YAML 規則所期望的巢狀結構
  const dataForConverter = {
    "病患清單": [
      {
        "id": patientId,
        "關聯病患": { "reference": `urn:uuid:${patientId}`, "名稱": sourcePatient.姓名 },
        "身分證號": sourcePatient.身分證字號,
        "姓名": sourcePatient.姓名,
        "姓": sourcePatient.姓,
        "名": sourcePatient.名,
        "性別": sourcePatient.性別 === '男' ? 'male' : (sourcePatient.性別 === '女' ? 'female' : 'unknown'),
        "出生日期": sourcePatient.出生日期,
        "聯絡方式": { "系統": "phone", "值": sourcePatient.電話, "用途": "mobile", "排序": 1 },
        "地址": { "國家": "TW", "縣市": sourcePatient.縣市, "鄉鎮區": sourcePatient.區鄉鎮, "詳細": sourcePatient.詳細地址, "郵遞區號": sourcePatient.郵遞區號 },
        "是否有效": sourcePatient.是否有效 !== undefined ? sourcePatient.是否有效 : true,
        "所屬機構": sourcePatient.所屬機構 || { "reference": "Organization/org-placeholder", "名稱": "Placeholder Organization" },
        "醫師": sourcePatient.醫師 || { "reference": "Practitioner/practitioner-placeholder", "名稱": "Placeholder Practitioner" },

        // 轉換臨床資料以匹配 YAML 中的路徑
        "過敏清單": allergies.map(a => ({
            id: a.id,
            臨床狀態: { 代碼: a.clinicalStatus, 名稱: a.clinicalStatus === 'active' ? 'Active' : 'Inactive', 中文名稱: a.clinicalStatus === 'active' ? '作用中' : '非作用中' },
            類型: a.type,
            過敏原: { 代碼: a.code.coding[0].code, 名稱: a.code.coding[0].display, 中文名稱: a.code.text },
            發生時間: a.onsetDateTime,
            過敏反應: { 症狀: { 代碼: a.reaction[0].manifestation[0].coding[0].code, 名稱: a.reaction[0].manifestation[0].coding[0].display, 中文名稱: a.reaction[0].manifestation[0].text }, 嚴重程度: a.reaction[0].severity }
        })),
        "病況清單": conditions.map(c => ({
            id: c.id,
            臨床狀態: { 代碼: c.clinicalStatus.coding[0].code, 名稱: c.clinicalStatus.coding[0].code, 中文名稱: c.clinicalStatus.coding[0].code },
            代碼: c.code.coding[0].code,
            名稱: c.code.coding[0].display,
            中文名稱: c.code.text,
            類別: c.category[0].coding[0].code,
            類別名稱: c.category[0].coding[0].display || 'Problem List Item', // 補上 display
            嚴重程度代碼: c.severity.coding[0].code,
            嚴重程度名稱: c.severity.coding[0].display || 'Mild', // 補上 display
            發病時間: c.onsetDateTime
        })),
        "用藥清單": [],
        "預防接種清單": immunizations.map(i => ({ /* ... 轉換 i ... */ })),
        "生命徵象清單": {
             "一般項目": observationsGeneral.map(o => ({ /* ... 轉換 o ... */ })),
             "血壓": observationsBP.map(bp => ({ /* ... 轉換 bp ... */ }))
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
// --- **** 7. 組合資料 **給** createIPSComposition 使用 (修正) **** ---
   // createIPSComposition 需要的資料，應該是我們剛剛組合好的 dataForConverter 裡面的病患物件
   const completePatientDataForComp = {
       ...dataForConverter.病患清單[0], // <<<< 使用 dataForConverter 中的資料
       文件資訊: { id: compositionId, 文件日期: documentDate }
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
  // return baseBundle;
  const finalBundle = baseBundle; // 使用我們最終修正好的 Bundle
    console.log("Bundle Metadata 已修正。");
    console.log("--- Bundle Before Mapping to VC ---");
   console.log(JSON.stringify(finalBundle, null, 2));

    // --- **** 10. 將 FHIR Bundle 映射為 VC JSON **** ---
let vcJsonPayload;
  try {
    console.log(">>> Calling mapRawDataToVC...");
      // 🚨 使用新的函式
      vcJsonPayload = mapRawDataToVC(rawDataFromFrontend); 
      
      console.log("<<< mapRawDataToVC returned:", JSON.stringify(vcJsonPayload, null, 2));
      
      if (!vcJsonPayload) {
          throw new Error("Failed to map Raw Data to VC JSON.");
      }
  } catch (mappingError) {
      console.error("映射到 VC JSON 時發生錯誤:", mappingError);
      throw new Error("Error during Raw Data to VC mapping.");
  }


    // --- **** 11. 將 VC JSON 發送到發行伺服器 **** ---
    let vcIssuerResponse;
    try {
        vcIssuerResponse = await sendVCToIssuer(vcJsonPayload);
        console.log("成功發送 VC 資料到發行伺服器。");
    } catch (sendVcError) {
        console.error("發送 VC 資料時發生錯誤:", sendVcError);
        // 根據您的需求決定是否要終止流程
        throw new Error("Failed to send VC data to issuer.");
    }

    // --- 12. 回傳結果 ---
    // 您可以選擇回傳原始的 FHIR Bundle，或者 VC 發行伺服器的回應
    console.log("IPS 處理及 VC 發送完成。");
    console.log("--- VC Issuer Response ---");
  //  console.log(JSON.stringify(vcIssuerResponse, null, 2));
   //  console.log(JSON.stringify(finalBundle, null, 2));
    // return finalBundle; // 回傳 FHIR Bundle
    return vcIssuerResponse; // 回傳 VC 發行伺服器的回應 ！！！！！！！todo:只回傳qrcode路徑
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