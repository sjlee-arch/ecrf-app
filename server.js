const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

// CORS & JSON
app.use(cors());
app.use(express.json());

// ===== 파일 DB 경로/유틸 =====
const DB_PATH = path.join(process.cwd(), 'ecrf-data.json');

function loadDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[DB] read fail:', e.message);
    // 최소 구조 (DEMO 스터디만 가정)
    return { studies: { DEMO: { studyId: 'DEMO', forms: [], visits: [] } } };
  }
}

// ===== 공통 헬퍼 =====
function ensureStudy(db, studyId) {
  return db?.studies?.[studyId] || null;
}

function mapFormsForUI(forms = []) {
  // 프론트가 표에서 쓸 수 있게 name/title을 채워준다
  return forms.map((f) => {
    const titleFromSchema = f?.schema?.title || f?.schema?.formCode || f?.code || '';
    return {
      // 기본 식별값들
      id: f.id,                              // 내부 id
      templateFormId: f.templateFormId,      // 템플릿 ID
      code: f.code,                          // DM, AE, IC ...
      version: f.version,                    // 1.0.0
      visits: Array.isArray(f.visits) ? f.visits : [],
      // UI 표시용
      name: titleFromSchema,                 // 목록에서 보여줄 이름
      title: titleFromSchema                 // 혹시 프론트가 title 키를 쓸 때 대비
    };
  });
}

// ===== 라우트 =====

// 루트/헬스
app.get('/', (_req, res) => res.type('text/plain').send('eCRF API is running on Render!'));
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// 모든 폼 목록 (DEMO 기준 템플릿 목록)
app.get('/api/forms', (_req, res) => {
  const db = loadDB();
  const demo = ensureStudy(db, 'DEMO'); // 프론트가 DEMO 기준 템플릿을 요구하므로 DEMO 사용
  const list = mapFormsForUI(demo?.forms || []);
  res.json(list);
});

// 선택: 스터디 목록(호환/디버깅용) — 필요 시 사용
app.get('/api/studies', (_req, res) => {
  const db = loadDB();
  const keys = Object.keys(db.studies || {});
  res.json(keys.map(k => ({ studyId: k })));
});

// 특정 스터디의 폼 목록
app.get('/api/studies/:studyId/forms', (req, res) => {
  const db = loadDB();
  const study = ensureStudy(db, req.params.studyId);
  if (!study) return res.status(404).json({ error: 'Study not found' });
  res.json(mapFormsForUI(study.forms || []));
});

// 특정 스터디의 “정의” (프론트가 사용)
app.get('/api/studies/:studyId/definition', (req, res) => {
  const db = loadDB();
  const study = ensureStudy(db, req.params.studyId);
  if (!study) return res.status(404).json({ error: 'Study not found' });

  // 프론트가 바로 쓰기 편하도록 필요한 핵심만 전달하거나
  // 필요 시 전체 study 객체 전달 (여기선 그대로 반환)
  res.json(study);
});

// 특정 폼 스키마 단건(필요 시)
app.get('/api/studies/:studyId/forms/:templateFormId', (req, res) => {
  const db = loadDB();
  const study = ensureStudy(db, req.params.studyId);
  if (!study) return res.status(404).json({ error: 'Study not found' });

  const form = (study.forms || []).find(f => f.templateFormId === req.params.templateFormId);
  if (!form) return res.status(404).json({ error: 'Form not found' });
  res.json(form);
});

// ===== 서버 시작 =====
const PORT = process.env.PORT || 10000; // Render에서 PORT 제공
app.listen(PORT, '0.0.0.0', () => {
  console.log(`서버 실행됨 => http://localhost:${PORT}`);
});