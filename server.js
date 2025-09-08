const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 데이터 파일 경로
const DB_FILE = path.join(__dirname, "ecrf-data.json");

// 데이터 로드 함수
function loadDB() {
  try {
    const data = fs.readFileSync(DB_FILE, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.log("DB 파일이 없어 새로 시작:", DB_FILE);
    return { studies: {} };
  }
}

// 데이터 저장 함수
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  console.log("DB 저장 완료:", DB_FILE);
}

// API 기본 라우트
app.get("/", (req, res) => {
  res.send("📡 eCRF API is running on Render!");
});

// 스터디 정의 조회
app.get("/api/studies/:studyId/definition", (req, res) => {
  const { studyId } = req.params;
  const db = loadDB();
  const study = db.studies[studyId];
  if (!study) {
    return res.status(404).json({ error: "Study not found" });
  }
  res.json(study.definition);
});

// 레코드 조회
app.get("/api/studies/:studyId/forms/:formId/records", (req, res) => {
  const { studyId, formId } = req.params;
  const db = loadDB();
  const study = db.studies[studyId];
  if (!study) {
    return res.status(404).json({ error: "Study not found" });
  }
  const records = study.records[formId] || [];
  res.json(records);
});

// 레코드 저장
app.post("/api/studies/:studyId/forms/:formId/records", (req, res) => {
  const { studyId, formId } = req.params;
  const newRecord = req.body;

  const db = loadDB();
  if (!db.studies[studyId]) {
    return res.status(404).json({ error: "Study not found" });
  }

  if (!db.studies[studyId].records[formId]) {
    db.studies[studyId].records[formId] = [];
  }

  db.studies[studyId].records[formId].push(newRecord);
  saveDB(db);

  res.status(201).json(newRecord);
});

// =============================
// Render 호환 포트 설정
// =============================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ 서버 실행됨 ➜ http://localhost:${PORT}`);
});