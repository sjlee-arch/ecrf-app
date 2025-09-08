const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

// (문제 원인 찾기 위해) 일단 CORS 전체 허용
app.use(cors());
app.use(express.json());

// Render 환경에서 쓸 데이터 파일 경로
// 로컬/클라우드 모두에서 쓸 수 있도록 프로젝트 루트 기준으로 둡니다.
const DATA_FILE = path.join(process.cwd(), 'ecrf-data.json');

// 최초 기동 시 데이터 파일이 없으면 기본 DEMO 데이터로 생성
function ensureDB() {
  if (!fs.existsSync(DATA_FILE)) {
    const demo = {
      studies: {
        DEMO: {
          studyId: 'DEMO',
          visits: ['V1', 'V2', 'V3'],
          forms: [
            // 템플릿(폼) 정의 예시 2개
            {
              id: 'DM',                    // Code
              templateFormId: 'DM-1.0.0',  // 템플릿ID
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
                      { path: 'DOB',   label: '생년월일', type: 'date',   required: true },
                      { path: 'AGE',   label: '연령',     type: 'number', readOnly: true },
                      { path: 'SEX',   label: '성별',     type: 'select',  required: true,
                        options: [{v:'M',l:'남'},{v:'F',l:'여'}] },
                      { path: 'CONSENT', label: '동의여부', type: 'radio', required: true,
                        options: [{v:'Y',l:'예'},{v:'N',l:'아니오'}] }
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
                      { path: 'SIGNED', label: '동의서 서명', type: 'radio', required: true,
                        options: [{v:'Y',l:'예'},{v:'N',l:'아니오'}] },
                      { path: 'DATE',   label: '서명일', type: 'date', required: true }
                    ]
                  }
                ]
              }
            }
          ],
          // 각 폼ID별 저장 레코드
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

// 헬스체크
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// 스터디 정의: /api/studies/:id/definition
app.get('/api/studies/:id/definition', (req, res) => {
  const db = readDB();
  const study = db.studies[req.params.id];
  if (!study) return res.status(404).json({ error: 'study not found' });

  // 프론트가 쓰기 좋은 형태로 리턴
  res.json({
    studyId: study.studyId,
    visits: study.visits,
    forms: study.forms.map(f => ({
      id: f.id,
      templateFormId: f.templateFormId,
      code: f.code,
      version: f.version,
      schema: f.schema
    }))
  });
});

// 폼 스키마 단건 조회: /api/studies/:id/forms/:templateFormId
app.get('/api/studies/:id/forms/:templateFormId', (req, res) => {
  const db = readDB();
  const study = db.studies[req.params.id];
  if (!study) return res.status(404).json({ error: 'study not found' });

  const form = study.forms.find(f => f.templateFormId === req.params.templateFormId);
  if (!form) return res.status(404).json({ error: 'form not found' });

  res.json(form);
});

// 레코드 목록: /api/studies/:id/forms/:templateFormId/records
app.get('/api/studies/:id/forms/:templateFormId/records', (req, res) => {
  const db = readDB();
  const study = db.studies[req.params.id];
  if (!study) return res.status(404).json({ error: 'study not found' });

  const list = study.records[req.params.templateFormId] || [];
  res.json(list);
});

// 레코드 저장(추가): /api/studies/:id/forms/:templateFormId/records
app.post('/api/studies/:id/forms/:templateFormId/records', (req, res) => {
  const db = readDB();
  const study = db.studies[req.params.id];
  if (!study) return res.status(404).json({ error: 'study not found' });

  const tfid = req.params.templateFormId;
  study.records[tfid] ??= [];
  const payload = req.body || {};
  payload._id = Date.now().toString(36); // 간단한 ID
  payload._savedAt = new Date().toISOString();

  study.records[tfid].push(payload);
  writeDB(db);
  res.status(201).json({ ok: true, id: payload._id });
});

// 루트 페이지(동작 확인용)
app.get('/', (_, res) => {
  res.send('eCRF API is running on Render!');
});

// 포트/바인딩
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`서버 실행됨 => http://localhost:${PORT}`);
});