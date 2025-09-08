const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// CORS (필요시 도메인 제한으로 변경)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 데이터 파일 경로
const dataPath = path.resolve(__dirname, 'ecrf-data.json');

// 데이터 유틸
function readData() {
  const raw = fs.readFileSync(dataPath, 'utf8');
  return JSON.parse(raw);
}
function writeData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
}

// 헬스체크
app.get('/', (_req, res) => {
  res.type('text').send('eCRF API is running on Render!');
});

// 폼 목록
app.get('/api/forms', (_req, res) => {
  try {
    const db = readData();
    const forms = (db.forms || []).map(f => ({
      id: f.id,
      templateFormId: f.templateFormId,
      code: f.code,
      version: f.version,
      visits: f.visits,
    }));
    res.json(forms);
  } catch (e) {
    console.error('GET /api/forms error', e);
    res.status(500).json({ error: 'Failed to read forms' });
  }
});

// 스터디 정의
app.get('/api/studies/:studyId/definition', (req, res) => {
  try {
    const { studyId } = req.params;
    const db = readData();
    const def = db.studies && db.studies[studyId];
    if (!def) return res.status(404).json({ error: 'Study definition not found' });
    res.json(def);
  } catch (e) {
    console.error('GET /definition error', e);
    res.status(500).json({ error: 'Failed to read study definition' });
  }
});

// 폼 복사
app.post('/api/copy', (req, res) => {
  try {
    const { formId, newCode, newVersion } = req.body || {};
    if (!formId) return res.status(400).json({ error: 'formId is required' });

    const db = readData();
    const src = (db.forms || []).find(f => f.id === formId);
    if (!src) return res.status(404).json({ error: 'Source form not found' });

    const copy = {
      ...src,
      id: uuid(),
      code: newCode || `${src.code}-COPY`,
      version: newVersion || src.version,
    };

    db.forms = db.forms || [];
    db.forms.push(copy);
    writeData(db);

    console.log('[COPY] Created', copy.id, 'from', formId);
    res.json({ ok: true, form: copy });
  } catch (e) {
    console.error('POST /api/copy error', e);
    res.status(500).json({ error: 'Copy failed' });
  }
});

app.listen(PORT, () => {
  console.log(`서버 실행됨 => http://localhost:${PORT}`);
});