const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ---- DB 로드/세이브 도우미 ----
const DB_PATH = path.join(__dirname, 'ecrf-data.json');

function loadDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[DB] load error:', e.message);
    return {};
  }
}

function saveDB(db) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('[DB] save error:', e.message);
  }
}

// ---- 기본 헬스체크 ----
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ---- DEMO 스터디 정의 ----
app.get('/api/studies/:studyId/definition', (req, res) => {
  const db = loadDB();
  const study = db.studies?.[req.params.studyId];
  if (!study || !study.definition) {
    return res.status(404).json({ error: 'Study definition not found' });
  }
  res.json(study.definition);
});

// ---- DEMO 스터디 폼 목록 ----
// 프런트에서 /api/forms 로 직접 호출하기도 하므로 별도 라우트 제공
app.get('/api/forms', (req, res) => {
  const db = loadDB();
  const forms = db.studies?.DEMO?.forms || [];
  res.json(forms);
});

// 선택: 특정 스터디의 폼 목록이 필요한 경우
app.get('/api/studies/:studyId/forms', (req, res) => {
  const db = loadDB();
  const forms = db.studies?.[req.params.studyId]?.forms || [];
  res.json(forms);
});

// ---- 폼 + 스키마 묶어서 조회 ----
// :id는 templateFormId 또는 form id 둘 다 허용
app.get('/api/forms/:id', (req, res) => {
  const db = loadDB();

  // DEMO 스터디에서 매칭되는 form을 찾음
  const allForms = db.studies?.DEMO?.forms || [];
  const form =
    allForms.find(f => f.templateFormId === req.params.id) ||
    allForms.find(f => f.id === req.params.id);

  if (!form) return res.status(404).json({ error: 'Form not found' });

  const schema = db.templateForms?.[form.templateFormId];
  if (!schema) return res.status(404).json({ error: 'Schema not found' });

  res.json({ ...form, schema });
});

// ---- 스키마 전용 조회 (definition / schema) ----
app.get('/api/forms/:id/definition', (req, res) => {
  const db = loadDB();
  const schema = db.templateForms?.[req.params.id];
  if (!schema) return res.status(404).json({ error: 'Schema not found' });
  res.json(schema);
});

app.get('/api/forms/:id/schema', (req, res) => {
  const db = loadDB();
  const schema = db.templateForms?.[req.params.id];
  if (!schema) return res.status(404).json({ error: 'Schema not found' });
  res.json(schema);
});

// ---- 폼 복사 (더미 처리) ----
// 실제 저장 로직 없이 성공 응답만 돌려줌
app.post('/api/forms/:id/copy', (req, res) => {
  const newId = `${req.params.id}-copy-${Date.now()}`;
  res.status(201).json({ copied: true, id: newId });
});

// ---- 서버 시작 ----
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`서버 실행됨 => http://localhost:${PORT}`);
});