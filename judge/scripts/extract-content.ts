// 기획 문서(docs/02, docs/03)의 표를 판정용 JSON(content/)으로 옮긴다.
// 문서가 원본이다. 문서를 고친 뒤 `npm run extract`로 다시 생성한다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const docs = path.join(root, "docs");
const out = path.join(root, "content");

function tableRows(md: string): string[][] {
  return md
    .split("\n")
    .filter((l) => l.startsWith("| ") && !l.startsWith("| ---"))
    .map((l) => l.slice(1, -1).split(" | ").map((c) => c.trim()));
}

// ---------- 사실 목록 ----------
const truth = fs.readFileSync(path.join(docs, "02_진상_문서.md"), "utf8");
const [koPart, enPart] = truth.split("### 영문 사실 목록");

const koFacts = tableRows(koPart.slice(koPart.indexOf("| 번호 | 사실 |")))
  .filter((r) => /^\d+/.test(r[0]))
  .map((r) => {
    const m = r[0].match(/^(\d+)(?: ★(\d))?$/)!;
    return { id: Number(m[1]), core: m[2] ? Number(m[2]) : null, ko: r[1], selfRelated: r[2] === "예" };
  });
const enFacts = new Map(
  tableRows(enPart)
    .filter((r) => /^\d+$/.test(r[0]))
    .map((r) => [Number(r[0]), { en: r[1], selfRelated: r[2] === "Yes" }]),
);

const facts = koFacts.map((f) => {
  const en = enFacts.get(f.id);
  if (!en) throw new Error(`영문 사실 ${f.id} 없음`);
  if (en.selfRelated !== f.selfRelated) throw new Error(`사실 ${f.id}의 배 자신 관련 여부가 한/영 목록에서 다름`);
  return { id: f.id, core: f.core, selfRelated: f.selfRelated, en: en.en, ko: f.ko };
});

// ---------- 검증 질문 세트 ----------
const tests = fs.readFileSync(path.join(docs, "03_검증_질문_세트.md"), "utf8");
const LIGHT: Record<string, string> = {
  "예": "yes",
  "아니오": "no",
  "상관없음": "irrelevant",
  "다시 보내라": "send_again",
};

type QuestionTest = {
  id: string;
  section: string;
  group: string | null;
  en: string;
  ko: string;
  expectedLight: string;
  expectedRule4: boolean;
  expectedSelfRelated: boolean | null;
  note: string;
};

const questions: QuestionTest[] = [];
const oaths: { id: string; text: string; expectedValid: boolean; note: string }[] = [];
const submissions: { id: string; text: string; expectedCount: number; note: string }[] = [];

for (const r of tableRows(tests)) {
  const id = r[0];
  const sec = id.match(/^([A-J])\d/)?.[1];
  if (!sec) continue;
  if (sec === "I") {
    oaths.push({ id, text: r[1], expectedValid: r[2] === "유효", note: r[3] });
    continue;
  }
  if (sec === "J") {
    submissions.push({ id, text: r[1], expectedCount: Number(r[2]), note: r[3] });
    continue;
  }
  const isH = sec === "H";
  const light = LIGHT[isH ? r[4] : r[3]];
  if (!light) throw new Error(`${id}: 알 수 없는 기대 결과 ${r[3]}`);
  const note = isH ? r[5] : r[4];
  // 배 자신 관련 기대값: 반전 근거가 있으면 관련, 열린·메타 질문은 채점하지 않음
  let self: boolean | null;
  if (sec === "G" || light === "send_again") self = null;
  else if (note.includes("반전") || note.includes("배 자신 관련이지만")) self = true;
  else self = false;
  questions.push({
    id,
    section: sec,
    group: sec === "B" ? id.split("-")[0] : null,
    en: r[1],
    ko: r[2],
    expectedLight: light,
    expectedRule4: isH ? r[3] === "위반" : false,
    expectedSelfRelated: self,
    note,
  });
}

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "facts.json"), JSON.stringify(facts, null, 2) + "\n");
fs.writeFileSync(
  path.join(out, "judge-tests.json"),
  JSON.stringify({ questions, oaths, submissions }, null, 2) + "\n",
);
console.log(`facts ${facts.length}, questions ${questions.length}, oaths ${oaths.length}, submissions ${submissions.length}`);
