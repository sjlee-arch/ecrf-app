const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver"); // ← ZIP 내보내기

const app = express();
app.use(cors());
app.use(express.json());

// -------------------- 파일 DB 세팅 --------------------
const DB_FILE = path.join(__dirname, "ecrf-data.json");
let studies = {}; // { [studyId]: { studyId, forms: [...] } }
let records = {}; // { [studyFormId]: [ { id, data, createdAt, updatedAt? } ] }

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, "utf-8");
      const obj = JSON.parse(raw || "{}");
      studies = obj.studies || {};
      records = obj.records || {};
      console.log("DB 로드 완료:", DB_FILE);
    } else {
      console.log("DB 파일이 없어 새로 시작:", DB_FILE);
    }
  } catch (e) {
    console.error("DB 로드 실패:", e.message);
  }
}

let saveTimer = null;
function saveDB() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const data = JSON.stringify({ studies, records }, null, 2);
    fs.writeFile(DB_FILE, data, (err) => {
      if (err) console.error("DB 저장 실패:", err.message);
      else console.log("DB 저장 완료:", DB_FILE);
    });
  }, 200);
}

loadDB();

// -------------------- 템플릿 메타 --------------------
const forms = [
  { id: "b54af585-1e4d-4eb7-bec9-df875cdf7414", code: "AE", name: "Adverse Event",   version: "1.0.0" },
  { id: "bb250b24-b410-4e54-b10a-0c7d4290000c", code: "DA", name: "Drug Administration", version: "1.0.0" },
  { id: "50663a1c-2b01-4683-b405-f45c37a5af0f", code: "DM", name: "Demographics",    version: "1.0.0" },
  { id: "d96aa63c-c053-4ea9-8f36-b1a868d57553", code: "IC", name: "Informed Consent", version: "1.0.0" },
  { id: "bd10a1e1-7a47-4c95-8a2f-ee632a01be39", code: "VS", name: "Vital Signs",      version: "1.0.0" },
];

// -------------------- 템플릿 스키마 --------------------
const formSchemas = {
  // Demographics
  "50663a1c-2b01-4683-b405-f45c37a5af0f": {
    formCode: "DM",
    title: "Demographics",
    sections: [
      {
        code: "BASIC",
        title: "기본",
        fields: [
          { path: "DOB",     label: "생년월일",  type: "date",   required: true },
          { path: "AGE",     label: "연령",      type: "number", readOnly: true },
          { path: "SEX",     label: "성별",      type: "select", required: true, options: [["M","남"],["F","여"]] },
          { path: "CONSENT", label: "동의여부",  type: "radio",  required: true, options: [["Y","예"],["N","아니오"]] },
        ],
      },
    ],
  },

  // Adverse Event
  "b54af585-1e4d-4eb7-bec9-df875cdf7414": {
    formCode: "AE",
    title: "Adverse Event",
    sections: [
      {
        code: "AE",
        title: "이상반응",
        fields: [
          { path: "TERM",     label: "용어",     type: "text",  required: true },
          { path: "START",    label: "발생일",   type: "date",  required: true },
          { path: "END",      label: "종료일",   type: "date" },
          { path: "SEVERITY", label: "중증도",   type: "select", options: [["1","경증"],["2","중등도"],["3","중증"]] },
        ],
      },
    ],
  },

  // Drug Administration
  "bb250b24-b410-4e54-b10a-0c7d4290000c": {
    formCode: "DA",
    title: "Drug Administration",
    sections: [
      {
        code: "DA",
        title: "투여",
        fields: [
          { path: "DRUG", label: "의약품명", type: "text",   required: true },
          { path: "DOSE", label: "용량(mg)", type: "number", required: true, min: 0 },
          { path: "DATE", label: "투여일",   type: "date",   required: true },
        ],
      },
    ],
  },

  // Informed Consent
  "d96aa63c-c053-4ea9-8f36-b1a868d57553": {
    formCode: "IC",
    title: "Informed Consent",
    sections: [
      {
        code: "IC",
        title: "동의",
        fields: [
          { path: "SIGNED", label: "동의서 서명", type: "radio", required: true, options: [["Y","예"],["N","아니오"]] },
          { path: "DATE",   label: "서명일",     type: "date",  required: true },
        ],
      },
    ],
  },

  // Vital Signs
  "bd10a1e1-7a47-4c95-8a2f-ee632a01be39": {
    formCode: "VS",
    title: "Vital Signs",
    sections: [
      {
        code: "VS",
        title: "활력징후",
        fields: [
          { path: "HEIGHT", label: "신장(cm)",     type: "number", min: 50,  max: 250 },
          { path: "WEIGHT", label: "체중(kg)",     type: "number", min: 2,   max: 400 },
          { path: "SBP",    label: "수축기혈압",   type: "number" },
          { path: "DBP",    label: "이완기혈압",   type: "number" },
          { path: "HR",     label: "심박수",       type: "number" },
        ],
      },
    ],
  },
};

// -------------------- 템플릿 API --------------------
app.get("/api/forms", (_, res) => res.json(forms));
app.get("/api/forms/:id", (req, res) => {
  const f = forms.find((x) => x.id === req.params.id);
  if (!f) return res.status(404).json({ error: "Form not found" });
  res.json(f);
});
app.get("/api/forms/:id/schema", (req, res) => {
  const s = formSchemas[req.params.id];
  if (!s) return res.status(404).json({ error: "Schema not found" });
  res.json(s);
});

// -------------------- 스터디 API --------------------
app.post("/api/studies/:studyId/forms", (req, res) => {
  const { studyId } = req.params;
  const { sourceFormId, targetCode, targetVersion, visits = [] } = req.body || {};
  const template = forms.find((x) => x.id === sourceFormId);
  if (!template) return res.status(400).json({ error: "Invalid sourceFormId" });

  if (!studies[studyId]) studies[studyId] = { studyId, forms: [] };

  const studyFormId = uuidv4();
  const sf = {
    id: studyFormId,
    templateFormId: sourceFormId,
    code: targetCode || template.code,
    version: targetVersion || template.version,
    visits,
  };
  studies[studyId].forms.push(sf);

  saveDB();
  res.status(201).json({ studyFormId, studyId, ...sf });
});

app.get("/api/studies/:studyId/definition", (req, res) => {
  const { studyId } = req.params;
  const st = studies[studyId] || { studyId, forms: [] };
  const studyForms = st.forms.map((f) => ({
    ...f,
    schema: formSchemas[f.templateFormId] || null,
  }));
  res.json({ studyId, visits: ["V1", "V2", "V3"], forms: studyForms });
});

// -------------------- 공통: 스키마 기반 검증 --------------------
function flatFields(schema) { return (schema.sections || []).flatMap((sec) => sec.fields || []); }
function isEmpty(v) { return v === null || v === undefined || v === ""; }
function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value); return !isNaN(d.getTime());
}
function validateAgainstSchema(schema, data) {
  const errors = [];
  const fields = flatFields(schema);
  for (const f of fields) {
    const val = data[f.path];
    if (f.required && isEmpty(val) && !f.readOnly) { errors.push({ path: f.path, message: `${f.label}은(는) 필수입니다.` }); continue; }
    if (isEmpty(val)) continue;
    if (f.type === "number") {
      const n = Number(val);
      if (Number.isNaN(n)) errors.push({ path: f.path, message: `${f.label}은(는) 숫자여야 합니다.` });
      else {
        if (typeof f.min === "number" && n < f.min) errors.push({ path: f.path, message: `${f.label}은(는) ${f.min} 이상이어야 합니다.` });
        if (typeof f.max === "number" && n > f.max) errors.push({ path: f.path, message: `${f.label}은(는) ${f.max} 이하여야 합니다.` });
      }
    } else if (f.type === "date") {
      if (!isValidDate(val)) errors.push({ path: f.path, message: `${f.label} 형식이 올바르지 않습니다(YYYY-MM-DD).` });
    }
  }
  const code = schema.formCode;
  if (code === "AE") {
    const s = data.START, e = data.END;
    if (!isEmpty(e) && isValidDate(s) && isValidDate(e)) {
      if (new Date(e) < new Date(s)) errors.push({ path: "END", message: "종료일은 발생일 이후여야 합니다." });
    }
  } else if (code === "IC") {
    if (data.SIGNED === "Y" && isEmpty(data.DATE)) errors.push({ path: "DATE", message: "동의서 서명='예'인 경우 서명일이 필요합니다." });
  }
  return errors;
}

// -------------------- 레코드 API (파일 영구 저장 + 검증) --------------------
// 목록
app.get("/api/studies/:studyId/forms/:studyFormId/records", (req, res) => {
  const { studyFormId } = req.params;
  res.json(records[studyFormId] || []);
});

// 생성
app.post("/api/studies/:studyId/forms/:studyFormId/records", (req, res) => {
  const { studyFormId } = req.params;
  const st = Object.values(studies).find((s) => (s.forms || []).some((f) => f.id === studyFormId));
  const sf = st?.forms?.find((f) => f.id === studyFormId);
  const schema = sf ? formSchemas[sf.templateFormId] : null;
  if (!schema) return res.status(400).json({ error: "Schema not found for this form." });

  const data = req.body || {};
  const errors = validateAgainstSchema(schema, data);
  if (errors.length) return res.status(400).json({ message: "Validation failed", errors });

  const rec = { id: uuidv4(), data, createdAt: new Date().toISOString() };
  if (!records[studyFormId]) records[studyFormId] = [];
  records[studyFormId].push(rec);
  saveDB();
  res.status(201).json(rec);
});

// 단건 조회
app.get("/api/studies/:studyId/forms/:studyFormId/records/:recordId", (req, res) => {
  const { studyFormId, recordId } = req.params;
  const list = records[studyFormId] || [];
  const rec = list.find((r) => r.id === recordId);
  if (!rec) return res.status(404).json({ error: "not found" });
  res.json(rec);
});

// 수정
app.put("/api/studies/:studyId/forms/:studyFormId/records/:recordId", (req, res) => {
  const { studyFormId, recordId } = req.params;
  const st = Object.values(studies).find((s) => (s.forms || []).some((f) => f.id === studyFormId));
  const sf = st?.forms?.find((f) => f.id === studyFormId);
  const schema = sf ? formSchemas[sf.templateFormId] : null;
  if (!schema) return res.status(400).json({ error: "Schema not found for this form." });

  const data = req.body || {};
  const errors = validateAgainstSchema(schema, data);
  if (errors.length) return res.status(400).json({ message: "Validation failed", errors });

  const list = records[studyFormId] || [];
  const idx = list.findIndex((r) => r.id === recordId);
  if (idx === -1) return res.status(404).json({ error: "not found" });

  const updated = { ...list[idx], data, updatedAt: new Date().toISOString() };
  list[idx] = updated;
  records[studyFormId] = list;
  saveDB();
  res.json(updated);
});

// 삭제
app.delete("/api/studies/:studyId/forms/:studyFormId/records/:recordId", (req, res) => {
  const { studyFormId, recordId } = req.params;
  const list = records[studyFormId] || [];
  const next = list.filter((r) => r.id !== recordId);
  records[studyFormId] = next;
  saveDB();
  res.json({ ok: true, deletedId: recordId });
});

// -------------------- 스터디 전체 Export (ZIP) --------------------
// 레코드 배열 -> CSV 문자열(BOM 포함, 엑셀 한글 안깨짐)
function recordsToCSV(rows) {
  const bom = "\uFEFF";
  const keySet = new Set();
  rows.forEach(r => Object.keys(r.data || {}).forEach(k => keySet.add(k)));
  const keys = Array.from(keySet);
  const headers = ["RecordID", "UpdatedAt", ...keys];
  const lines = [headers];

  for (const r of rows) {
    const d = r.data || {};
    const line = [
      r.id,
      new Date(r.updatedAt || r.createdAt || Date.now()).toISOString(),
      ...keys.map(k => d[k] ?? "")
    ].map(v => {
      const s = String(v);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });
    lines.push(line);
  }
  return bom + lines.map(a => a.join(",")).join("\r\n");
}

// GET /api/studies/:studyId/export
// 현재 스터디의 모든 폼 기록을 CSV 파일들로 만들고 ZIP으로 묶어 내려줌
app.get("/api/studies/:studyId/export", async (req, res) => {
  try {
    const { studyId } = req.params;
    const study = studies?.[studyId];
    if (!study) return res.status(404).json({ message: "Study not found" });

    const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,"");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename=${studyId}_export_${stamp}.zip`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      console.error("[export] archiver error", err);
      try { res.status(500).end(); } catch {}
    });
    archive.pipe(res);

    // 스터디 메타 JSON 포함
    const studyMeta = {
      studyId,
      visits: study.visits || [],
      forms: (study.forms || []).map(f => ({
        id: f.id, code: f.code, version: f.version, visits: f.visits || []
      }))
    };
    archive.append(JSON.stringify(studyMeta, null, 2), { name: "_study_definition.json" });

    // 각 폼별 CSV 추가 (records는 studyFormId로 1단 키)
    for (const f of study.forms || []) {
      const list = records[f.id] || [];
      const csv = recordsToCSV(list);
      const safeVer = String(f.version || "1.0.0").replace(/[^\w.-]/g, "_");
      const filename = `${f.code || "FORM"}_v${safeVer}.csv`;
      archive.append(csv, { name: filename });
    }

    archive.finalize();
  } catch (e) {
    console.error("[export] failed", e);
    res.status(500).json({ message: "Export failed" });
  }
});

// -------------------- 헬스체크 & 서버 시작 --------------------
app.get("/", (_, res) => res.send("eCRF API running"));
app.listen(5000, () => console.log("서버 실행됨 → http://localhost:5000"));