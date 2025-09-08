const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

// Render/Node 런타임에서 작업 디렉터리 기준으로 파일 경로
const DB_PATH = path.join(process.cwd(), "ecrf-data.json");

// DB 읽기 유틸
function readDb() {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("DB 읽기 실패:", e.message);
    // 파일이 없거나 파싱 실패 시 최소 구조 반환
    return { studies: {} };
  }
}

app.get("/", (_req, res) => {
  res.send("eCRF API is running on Render!");
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

/**
 * 템플릿/폼 목록
 * 프론트는 /api/forms 를 호출하므로 이 라우트를 제공합니다.
 * - ecrf-data.json에 forms 배열이 있으면 그대로 반환
 * - 없으면 studies 키를 바탕으로 {code, name, version, id} 목록 생성
 */
function buildFormsList(db) {
  if (Array.isArray(db.forms)) return db.forms;

  const studies = db.studies && typeof db.studies === "object" ? db.studies : {};
  return Object.entries(studies).map(([code, s]) => ({
    code,
    name: s?.name ?? code,
    version: s?.version ?? "1.0",
    id: s?.id ?? code,
  }));
}

app.get("/api/forms", (req, res) => {
  const db = readDb();
  const list = buildFormsList(db);
  return res.json(list);
});

/**
 * 선택 사항: /api/studies 로도 같은 목록을 제공 (호환용/디버깅 용도)
 */
app.get("/api/studies", (req, res) => {
  const db = readDb();
  const list = buildFormsList(db);
  return res.json(list);
});

/**
 * 특정 스터디 정의 반환
 * e.g. /api/studies/DEMO/definition
 * - 데이터 구조에 따라 study.definition 또는 study.forms에 정의가 있을 수 있어
 *   가장 가능성 높은 필드를 순서대로 찾아 반환합니다.
 */
app.get("/api/studies/:code/definition", (req, res) => {
  const { code } = req.params;
  const db = readDb();
  const study = db?.studies?.[code];

  if (!study) {
    return res.status(404).json({ error: "Study not found" });
  }

  // 정의 추출 (데이터 구조 변형에 대비해 안전하게)
  const definition =
    study.definition ??
    study.forms ?? // 혹시 forms가 정의 역할을 한다면
    study.schema ?? // 있을 경우 대비
    study; // 최후의 보루

  return res.json(definition);
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버 실행됨 => http://localhost:${PORT}`);
});