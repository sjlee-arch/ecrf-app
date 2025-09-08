// server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

// CORS + JSON
app.use(cors());
app.use(express.json());

// 파일 DB 경로 (로컬/클라우드 공통)
const DATA_FILE = path.join(process.cwd(), 'ecrf-data.json');

// ===== DB 유틸 =====
function ensureDB() {
  if (!fs.existsSync(DATA_FILE)) {
    const demo = {
      studies: {
        DEMO: {
          studyId: 'DEMO',
          visits: ['V1', 'V2', 'V3'],
          forms: [
            {
              id: 'DM',
              templateFormId: 'DM-1.0.0',
              code: 'DM',
              version: '1.0.0',
              schema: {
                formCode: 'DM',
                title: 'Demographics',
                sections: [
                  {
                    code: 'BASIC',
                    title: '기본',
                    fields: [
                      { path: 'DOB', label: '생년월일', type: 'date',   required: true },
                      { path: 'AGE', label: '연령',     type: 'number', readOnly: true },
                      {
                        path: 'SEX', label: '성별', type: 'select', required: true,
                        options: [{ v: 'M', l: '남' }, { v: 'F', l: '여' }]
                      },
                      {
                        path: 'CONSENT', label: '동의여부', type: 'radio', required: true,
                        options: [{ v: 'Y', l: '예' }, { v: 'N', l: '아니오' }]
                      }
                    ]
                  }
                ]
              }
            },
            {
              id: 'IC',
              templateFormId: 'IC-1.0.0',
              code: 'IC',
              version: '1.0.0',
              schema: {
                formCode: 'IC',
                title: 'Informed Consent',
                sections: [
                  {
                    code: 'CONSENT',
                    title: '동의',
                    fields: [
                      {
                        path: 'SIGNED', label: '동의서 서명', type: 'radio', required: true,
                        options: [{ v: 'Y', l: '예' }, { v: 'N', l: '아니오' }]
                      },
                      { path: 'DATE', label: '서명일', type: 'date', required: true }
                    ]
                  }
                ]
              }
            }
          ],
          // 폼별 저장 레코드
          records: {
            'DM-1.0.0': [],
            'IC-1.0.0': []
          }
        }
      }
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(demo, null, 2));
    console.log('DB 파일이 없어 새로 생성:', DATA_FILE);
  } else {
    console.log('DB 로드 완료:', DATA_FILE);
  }
}
function readDB() {
  ensureDB();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function writeDB(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

// ===== 헬스체크 =====
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ===== 스터디 정의 =====
app.get('/api/studies/:id/definition', (req, res) => {
  const db = readDB();
  const study = db.studies?.[req.params.id];
  if (!study) return res.status(404).json({ error: 'study not found' });

  res.json({
    studyId: study.studyId,
    visits: study.visits,
    forms: (study.forms || []).map(f => ({
      id: f.id,
      templateFormId: f.templateFormId,
      code: f.code,
      version: f.version,
      schema: f.schema
    }))
  });
});

// ===== 폼 스키마 단건 =====
app.get('/api/studies/:id/forms/:templateFormId', (req, res) => {
  const db = readDB();
  const study = db.studies?.[req.params.id];
  if (!study) return res.status(404).json({ error: 'study not found' });

  const form = (study.forms || []).find(f => f.templateFormId === req.params.templateFormId);
  if (!form) return res.status(404).json({ error: 'form not found' });

  res.json(form);
});

// ===== 레코드 목록 =====
app.get('/api/studies/:id/forms/:templateFormId/records', (req, res) => {
  const db = readDB();
  const study = db.studies?.[req.params.id];
  if (!study) return res.status(404).json({ error: 'study not found' });

  const list = study.records?.[req.params.templateFormId] || [];
  res.json(list);
});

// ===== 레코드 저장 =====
app.post('/api/studies/:id/forms/:templateFormId/records', (req, res) => {
  const db = readDB();
  const study = db.studies?.[req.params.id];
  if (!study) return res.status(404).json({ error: 'study not found' });

  const tfid = req.params.templateFormId;
  study.records ||= {};
  study.records[tfid] ||= [];

  const payload = req.body || {};
  payload._id = Date.now().toString(36);
  payload._savedAt = new Date().toISOString();

  study.records[tfid].push(payload);
  writeDB(db);
  res.status(201).json({ ok: true, id: payload._id });
});

// ===== 템플릿 목록 (프론트 호환) =====
// DEMO 스터디의 forms를 템플릿 목록처럼 반환
function listTemplatesFromDemo(db) {
  const demo = db.studies?.DEMO;
  if (!demo) return [];
  return (demo.forms || []).map(f => ({
    templateFormId: f.templateFormId,          // 예: DM-1.0.0
    code: f.code,                               // 예: DM
    name: f.schema?.title || f.code,            // 예: Demographics
    version: f.version                          // 예: 1.0.0
  }));
}

// 프론트가 /api/templates 를 호출할 때
app.get('/api/templates', (req, res) => {
  const db = readDB();
  res.json(listTemplatesFromDemo(db));
});

// 혹시 /templates 로 부르면(오타/별칭)
app.get('/templates', (req, res) => {
  const db = readDB();
  res.json(listTemplatesFromDemo(db));
});

// ===== 루트(확인용) =====
app.get('/', (_, res) => {
  res.send('eCRF API is running on Render!');
});

// ===== 포트 바인딩(Render는 process.env.PORT 사용 필수) =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`서버 실행됨 => http://localhost:${PORT}`);
});