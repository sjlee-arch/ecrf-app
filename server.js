// server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 데이터 파일 경로
const DB_PATH = path.join(__dirname, 'ecrf-data.json');

// DB 로드 함수
function loadDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[DB] Failed to read ecrf-data.json:', e.message);
    return { studies: {}, records: {} };
  }
}

// 헬스 체크들
app.get('/', (_req, res) => {
  res.type('text/plain').send('eCRF API is running on Render!');
});
app.get('/health', (_req, res) => res.json({ ok: true }));

// ---------- 유틸: 스터디 폼/정의 ----------
function getAllForms(db) {
  const all = [];
  const studies = db.studies || {};
  for (const s of Object.values(studies)) {
    if (Array.isArray(s.forms)) all.push(...s.forms);
  }
  return all;
}

function getStudy(db, studyId) {
  return (db.studies && db.studies[studyId]) || null;
}

// ---------- API 라우트 ----------

// 1) 모든 스터디의 폼 목록 (프론트가 /api/forms 로 요청할 때)
app.get('/api/forms', (_req, res) => {
  const db = loadDB();
  const forms = getAllForms(db);
  res.json(forms);
});

// 2) 기본 스터디(DEMO)의 정의
app.get('/api/definition', (_req, res) => {
  const db = loadDB();
  const study = getStudy(db, 'DEMO');
  if (!study) return res.status(404).json({ error: 'Study DEMO not found' });
  res.json(study);
});

// 3) 특정 스터디의 폼/정의
app.get('/api/studies/:studyId/forms', (req, res) => {
  const db = loadDB();
  const study = getStudy(db, req.params.studyId);
  if (!study) return res.status(404).json({ error: 'Study not found' });
  res.json(study.forms || []);
});

app.get('/api/studies/:studyId/definition', (req, res) => {
  const db = loadDB();
  const study = getStudy(db, req.params.studyId);
  if (!study) return res.status(404).json({ error: 'Study not found' });
  res.json(study);
});

// 포트 바인딩 (Render가 제공하는 PORT 사용)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`서버 실행됨 => http://localhost:${PORT}`);
});