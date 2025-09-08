const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');

const app = express();

// ---- 기본 설정
const PORT = process.env.PORT || 10000;
app.use(express.json());

// CORS (프론트가 Vercel에서 오므로 허용)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // 필요시 도메인으로 제한
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---- 데이터 로드/저장 유틸
const dataPath = path.resolve(__dirname, 'ecrf-data.json');

function readData() {
  const raw = fs.readFileSync(dataPath, 'utf8');
  return JSON.parse(raw);
}
function writeData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
}

// ---- health
app.get('/', (_req, res) => {
  res.type('text').send('eCRF API is running on Render!');
});

// ---- 폼 목록
app.get('/api/forms', (_req, res) => {
  try {
    const db = readData();
    const forms = db.forms?.map(f => ({
      id: f.id,
      templateFormId: f.templateFormId,
      code: f.code,
      version: f.version,
      visits: f.visits
    })) ?? [];
    res.json(forms);
  } catch (e) {
    console.error('GET /api/forms error', e);
    res.status(500).json({ error: 'Failed to read forms' });
  }
});

// ---- 특정 스터디 정의
app.get('/api/studies/:studyId/definition', (req, res) => {
  try {
    const { studyId } = req.params;
    const db = readData();
    const def = db.studies?.[studyId];
    if (!def) return res.status(404).json({ error: 'Study definition not found' });
    res.json(def);
  } catch (e) {
    console.error('GET /api/studies/:studyId/definition error', e);
    res.status(500).json({ error: 'Failed to read study definition' });
  }
});

// ---- 폼 복사 (핵심)
app.post('/api/copy', (req, res) => {
  try {
    const { formId, newCode, newVersion } = req.body || {};
    if (!formId) return res.status(400).json({ error: 'formId is required' });

    const db = readData();
    const src = (db.forms || []).find(f => f.id === formId);
    if (!src) return res.status(404).json({ error: 'Source form not found' });

    const copy = {
      ...src,
      id: uuid(),                     // 새 ID
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

// ---- 서버 시작
app.listen(PORT, () => {
  console.log(`서버 실행됨 => http://localhost:${PORT}`);
});
참고
Render 무료 플랜은 디스크가 영구 저장소가 아닐 수 있어, 재시작/재배포 시 복사본이 사라질 수도 있어요. 기능 검증은 문제 없고, 장기 보관은 나중에 Render Disk(Persistent Disk)를 붙이거나 DB로 옮기면 됩니다.

2) 프론트 API 코드 확인 (src/api.js)
이미 잘 설정하셨지만, 혼선 없도록 최종 형태를 다시 적어둘게요. 혼합콘텐츠(HTTP 호출) 에러 방지를 위해 반드시 HTTPS로 호출해야 합니다.

js
코드 복사
// src/api.js
const ENV_BASE = import.meta.env.VITE_API_BASE_URL; // Vercel 환경변수
const FALLBACK = 'https://ecrf-app.onrender.com';   // Render 백엔드 주소(HTTPS)
export const API_BASE =
  (ENV_BASE && ENV_BASE.startsWith('http') ? ENV_BASE : null) || FALLBACK;

export async function fetchForms() {
  const r = await fetch(`${API_BASE}/api/forms`);
  if (!r.ok) throw new Error('forms load failed');
  return r.json();
}

export async function fetchStudyDefinition(studyId) {
  const r = await fetch(`${API_BASE}/api/studies/${encodeURIComponent(studyId)}/definition`);
  if (!r.ok) throw new Error('definition load failed');
  return r.json();
}

export async function copyForm(formId, { code, version } = {}) {
  const r = await fetch(`${API_BASE}/api/copy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formId, newCode: code, newVersion: version }),
  });
  if (!r.ok) {
    const tx = await r.text().catch(() => '');
    throw new Error(`copy failed: ${r.status} ${tx}`);
  }
  return r.json();
}