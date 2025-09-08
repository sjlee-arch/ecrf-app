// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// CORS는 프론트에서 프록시(Vercel rewrites)로 우회하므로 굳이 열 필요 없지만,
// 직접 호출 테스트를 위해 허용해 둠.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ecrf-data.json을 안전하게 읽기
const DB_PATH = path.resolve(__dirname, 'ecrf-data.json');
function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    return { studies: [] };
  }
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  try { return JSON.parse(raw); } catch (e) { return { studies: [] }; }
}

// 템플릿 목록
app.get('/api/forms', (req, res) => {
  try {
    const db = loadDB();
    // 목록은 최소한 이 필드들로 가정
    const list = (db.studies || []).map(s => ({
      code: s.code,
      name: s.name,
      version: s.version,
      id: s.id || s.code
    }));
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'forms-failed' });
  }
});

// 특정 스터디 정의
app.get('/api/studies/:code/definition', (req, res) => {
  try {
    const db = loadDB();
    const found = (db.studies || []).find(s => s.code === req.params.code);
    if (!found) return res.status(404).json({ error: 'Study not found' });
    res.json(found.definition || {});
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'definition-failed' });
  }
});

const PORT = process.env.PORT || 10000; // Render는 임의 포트 제공 → 반드시 이 값 사용
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API running on :${PORT}`);
});