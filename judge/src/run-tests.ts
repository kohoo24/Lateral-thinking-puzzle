// 검증 질문 세트(docs/03)를 실제 판정에 돌리고 합격 기준 대비 보고서를 만든다.
//   npm run judge:test                      전체(영어+한국어)
//   npm run judge:test -- --lang en --only A,C,H
//   npm run judge:test -- --mock            API 없이 채점 로직만 확인
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { judgeTests, contentDir, type QuestionTest } from "./content.js";
import { createJudge } from "./backends.js";
import { costUsd, JudgeUnavailable, type Effort, type Usage } from "./judge.js";
import { countCores, decideLight, type ShipLight } from "./light.js";
import { judgmentFromExpected } from "./mock-judge.js";
import type { OathJudgment, QuestionJudgment, SubmissionJudgment } from "./schema.js";

const { values: args } = parseArgs({
  options: {
    lang: { type: "string", default: "both" },
    only: { type: "string" },
    concurrency: { type: "string", default: "4" },
    backend: { type: "string", default: "jev" },
    model: { type: "string" },
    effort: { type: "string" },
    mock: { type: "boolean", default: false },
    out: { type: "string", default: path.resolve(contentDir, "../judge/reports") },
  },
});

const GAME_TIMEOUT_MS = 6000; // docs/05: 6초 안에 판정이 오지 않으면 "신호가 닿지 않음"
const CALLS_PER_PLAYER = { question: 30, oath: 1, submission: 1 };
const langs = args.lang === "both" ? (["en", "ko"] as const) : ([args.lang] as ("en" | "ko")[]);
const sections = args.only?.split(",").map((s) => s.trim().toUpperCase());
const want = (sec: string) => !sections || sections.includes(sec);

type CallInfo = { latencyMs: number; usage: Usage; model: string } | null;
type QuestionRow = {
  id: string;
  section: string;
  group: string | null;
  lang: "en" | "ko";
  text: string;
  expected: QuestionTest;
  light: ShipLight;
  judgment: QuestionJudgment | null;
  error: string | null;
  call: CallInfo;
};

let judge: ReturnType<typeof createJudge> | null = null;
if (!args.mock) {
  try {
    judge = createJudge(args.backend, { model: args.model, effort: args.effort as Effort | undefined });
  } catch (e) {
    console.error(`판정 백엔드(${args.backend})를 만들 수 없습니다: ${e instanceof Error ? e.message : e}`);
    console.error("Jev는 TYPESAFE_API_KEY, Claude는 ANTHROPIC_API_KEY 환경 변수가 필요합니다. API 없이 채점 로직만 보려면 --mock");
    process.exit(1);
  }
}
const modelLabel = judge ? `${args.backend}: ${judge.model}${judge.effort !== "-" ? ` / effort ${judge.effort}` : ""}` : "mock(기대 결과)";

async function timed<T>(fn: () => Promise<{ result: T; latencyMs: number; usage: Usage; model: string }>) {
  try {
    const r = await fn();
    return { result: r.result, call: { latencyMs: r.latencyMs, usage: r.usage, model: r.model } as CallInfo, error: null };
  } catch (e) {
    const msg = e instanceof JudgeUnavailable ? e.message : e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return { result: null, call: null, error: msg };
  }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
        done++;
        if (done % 20 === 0 || done === items.length) process.stderr.write(`  ${done}/${items.length}\n`);
      }
    }),
  );
  return out;
}

const concurrency = Number(args.concurrency);

// ---------- 실행 ----------
const qJobs = judgeTests.questions.filter((q) => want(q.section)).flatMap((q) => langs.map((lang) => ({ q, lang })));
console.error(`[${modelLabel}] 질문 판정 ${qJobs.length}회`);
const questionRows: QuestionRow[] = await pool(qJobs, concurrency, async ({ q, lang }) => {
  const text = q[lang];
  const r = judge
    ? await timed(() => judge.question(text))
    : { result: judgmentFromExpected(q), call: null as CallInfo, error: null };
  const light: ShipLight = r.result ? decideLight(r.result) : "no_reach";
  return { id: q.id, section: q.section, group: q.group, lang, text, expected: q, light, judgment: r.result, error: r.error, call: r.call };
});

const oathJobs = want("I") ? judgeTests.oaths : [];
console.error(`서약 판정 ${oathJobs.length}회`);
const oathRows = await pool(oathJobs, concurrency, async (t) => {
  const r = judge
    ? await timed(() => judge.oath(t.text, "Jin (진)"))
    : { result: { has_own_name: t.expectedValid, has_oath_intent: t.expectedValid, names_someone_else: false, valid: t.expectedValid } as OathJudgment, call: null as CallInfo, error: null };
  return { t, result: r.result, error: r.error, call: r.call, ok: r.result?.valid === t.expectedValid };
});

const subJobs = want("J") ? judgeTests.submissions : [];
console.error(`제출 판정 ${subJobs.length}회`);
const subRows = await pool(subJobs, concurrency, async (t) => {
  const mock: SubmissionJudgment = {
    core1: { accepted: t.expectedCount >= 1, reason: "mock" },
    core2: { accepted: t.expectedCount >= 2, reason: "mock" },
    core3: { accepted: t.expectedCount >= 3, reason: "mock" },
  };
  const r = judge ? await timed(() => judge.submission(t.text)) : { result: mock, call: null as CallInfo, error: null };
  const count = r.result ? countCores(r.result) : null;
  return { t, result: r.result, count, error: r.error, call: r.call, ok: count === t.expectedCount };
});

// ---------- 채점 (docs/03 합격 기준) ----------
const pct = (a: number, b: number) => (b === 0 ? null : (a / b) * 100);
const fmt = (v: number | null, digits = 1) => (v == null ? "-" : v.toFixed(digits));
const lightOk = (r: QuestionRow) => r.light === r.expected.expectedLight;

const lightAll = pct(questionRows.filter(lightOk).length, questionRows.length);
const byLang = Object.fromEntries(
  langs.map((l) => {
    const rows = questionRows.filter((r) => r.lang === l);
    return [l, pct(rows.filter(lightOk).length, rows.length)];
  }),
) as Record<string, number | null>;
const langGap = langs.length === 2 && byLang.en != null && byLang.ko != null ? Math.abs(byLang.en - byLang.ko) : null;

const groups = [...new Set(questionRows.filter((r) => r.group).map((r) => `${r.group}/${r.lang}`))];
const groupResults = groups.map((g) => {
  const [group, lang] = g.split("/");
  const rows = questionRows.filter((r) => r.group === group && r.lang === lang);
  return { group, lang, ok: rows.every(lightOk), failed: rows.filter((r) => !lightOk(r)).map((r) => r.id) };
});

const selfRows = questionRows.filter((r) => r.expected.expectedSelfRelated !== null && r.judgment);
const selfAcc = pct(selfRows.filter((r) => r.judgment!.self_related === r.expected.expectedSelfRelated).length, selfRows.length);

const rule4FalsePos = questionRows.filter((r) => !r.expected.expectedRule4 && r.judgment?.rule4_violation);
const rule4Miss = questionRows.filter((r) => r.expected.expectedRule4 && r.judgment && !r.judgment.rule4_violation);

const answerable = questionRows.filter((r) => r.expected.expectedLight !== "send_again");
const retryRate = pct(answerable.filter((r) => r.light === "send_again" || r.light === "no_reach").length, answerable.length);

const oathAcc = pct(oathRows.filter((r) => r.ok).length, oathRows.length);
const subAcc = pct(subRows.filter((r) => r.ok).length, subRows.length);

const calls = [...questionRows.map((r) => r.call), ...oathRows.map((r) => r.call), ...subRows.map((r) => r.call)].filter(
  (c): c is NonNullable<CallInfo> => c != null,
);
const qCalls = questionRows.map((r) => r.call).filter((c): c is NonNullable<CallInfo> => c != null);
const lat = qCalls.map((c) => c.latencyMs).sort((a, b) => a - b);
const q = (p: number) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] / 1000 : null);
const overTimeout = pct(lat.filter((l) => l > GAME_TIMEOUT_MS).length, lat.length);
const avgCost = (cs: NonNullable<CallInfo>[]) => {
  const costs = cs.map((c) => costUsd(c.model, c.usage)).filter((v): v is number => v != null);
  return costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null;
};
const avgQ = avgCost(qCalls);
const avgO = avgCost(oathRows.map((r) => r.call).filter((c): c is NonNullable<CallInfo> => c != null));
const avgS = avgCost(subRows.map((r) => r.call).filter((c): c is NonNullable<CallInfo> => c != null));
const perPlayer =
  avgQ == null ? null : avgQ * CALLS_PER_PLAYER.question + (avgO ?? 0) * CALLS_PER_PLAYER.oath + (avgS ?? 0) * CALLS_PER_PLAYER.submission;
const avgTokens = (cs: NonNullable<CallInfo>[]) => (cs.length ? cs.reduce((a, c) => a + c.usage.input + c.usage.cacheRead + c.usage.cacheWrite + c.usage.output, 0) / cs.length : null);
const tokensPerPlayer = avgTokens(qCalls) == null ? null : avgTokens(qCalls)! * CALLS_PER_PLAYER.question;
const cacheReadShare = pct(
  calls.reduce((a, c) => a + c.usage.cacheRead, 0),
  calls.reduce((a, c) => a + c.usage.cacheRead + c.usage.cacheWrite + c.usage.input, 0),
);
const errors = [...questionRows, ...oathRows.map((r) => ({ id: r.t.id, error: r.error })), ...subRows.map((r) => ({ id: r.t.id, error: r.error }))].filter(
  (r) => r.error,
);

// ---------- 보고서 ----------
const pass = (ok: boolean | null) => (ok == null ? "해당 없음" : ok ? "통과" : "**미달**");
const criteria = [
  ["최종 불빛 일치율(전체)", "90% 이상", `${fmt(lightAll)}%`, pass(lightAll == null ? null : lightAll >= 90)],
  ["같은 뜻 묶음 안의 일관성", "묶음마다 전부 같은 결과", `${groupResults.filter((g) => g.ok).length}/${groupResults.length} 묶음`, pass(groupResults.length ? groupResults.every((g) => g.ok) : null)],
  ["배 자신 관련 분류 정확도", "95% 이상", `${fmt(selfAcc)}%`, pass(selfAcc == null ? null : selfAcc >= 95)],
  ["수칙 4 오탐", "0건", `${rule4FalsePos.length}건`, pass(rule4FalsePos.length === 0)],
  ["영어와 한국어 일치율 차이", "5%p 이내", langGap == null ? "-" : `${fmt(langGap)}%p (EN ${fmt(byLang.en)}%, KO ${fmt(byLang.ko)}%)`, pass(langGap == null ? null : langGap <= 5)],
  ["\"다시 보내라\"·\"신호가 닿지 않음\" 발생률", "10% 이하", `${fmt(retryRate)}%`, pass(retryRate == null ? null : retryRate <= 10)],
];

const sectionRows = [...new Set(questionRows.map((r) => r.section))].map((sec) => {
  const rows = questionRows.filter((r) => r.section === sec);
  return `| ${sec} | ${rows.filter(lightOk).length}/${rows.length} | ${fmt(pct(rows.filter(lightOk).length, rows.length))}% |`;
});
if (oathRows.length) sectionRows.push(`| I(서약) | ${oathRows.filter((r) => r.ok).length}/${oathRows.length} | ${fmt(oathAcc)}% |`);
if (subRows.length) sectionRows.push(`| J(제출) | ${subRows.filter((r) => r.ok).length}/${subRows.length} | ${fmt(subAcc)}% |`);

const LIGHT_KO: Record<string, string> = { yes: "예", no: "아니오", irrelevant: "상관없음", send_again: "다시 보내라", no_reach: "신호가 닿지 않음" };
const failures = [
  ...questionRows
    .filter((r) => !lightOk(r) || (r.judgment && r.judgment.rule4_violation !== r.expected.expectedRule4) || (r.judgment && r.expected.expectedSelfRelated !== null && r.judgment.self_related !== r.expected.expectedSelfRelated))
    .map((r) => {
      const j = r.judgment;
      const got = j ? `${LIGHT_KO[r.light]} (자신 관련 ${j.self_related ? "O" : "X"}, 주어 ${j.subject}, 명제 ${j.proposition_truth}, 수칙4 ${j.rule4_violation ? "위반" : "-"}, 확신 ${j.confidence})` : `${LIGHT_KO[r.light]} (${r.error})`;
      const exp = `${LIGHT_KO[r.expected.expectedLight]}${r.expected.expectedSelfRelated === null ? "" : `, 자신 관련 ${r.expected.expectedSelfRelated ? "O" : "X"}`}${r.expected.expectedRule4 ? ", 수칙4 위반" : ""}`;
      return `| ${r.id} | ${r.lang} | ${r.text} | ${exp} | ${got} |`;
    }),
];
const otherFailures = [
  ...oathRows.filter((r) => !r.ok).map((r) => `| ${r.t.id} | ${r.t.text} | ${r.t.expectedValid ? "유효" : "무효"} | ${r.result ? (r.result.valid ? "유효" : "무효") : r.error} |`),
  ...subRows.filter((r) => !r.ok).map((r) => `| ${r.t.id} | ${r.t.text} | ${r.t.expectedCount} | ${r.count ?? r.error} ${r.result ? `(1:${r.result.core1.accepted ? "O" : "X"} 2:${r.result.core2.accepted ? "O" : "X"} 3:${r.result.core3.accepted ? "O" : "X"})` : ""} |`),
];

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const totalCalls = questionRows.length + oathRows.length + subRows.length;
const allFailed = !args.mock && totalCalls > 0 && errors.length === totalCalls;
const warning = allFailed
  ? "> **모든 판정이 실패했습니다.** API 키(ANTHROPIC_API_KEY)나 네트워크를 확인하세요. 아래 점수는 의미가 없습니다.\n\n"
  : "";
const report = `# 판정 테스트 결과

${warning}- 실행: ${stamp}
- 판정 모델: ${modelLabel}
- 판정 횟수: 질문 ${questionRows.length}, 서약 ${oathRows.length}, 제출 ${subRows.length}
- 언어: ${langs.join(", ")}${sections ? `, 구간 ${sections.join(",")}` : ""}

## 합격 기준(docs/03)

| 항목 | 목표 | 결과 | 판정 |
| --- | --- | --- | --- |
${criteria.map((c) => `| ${c.join(" | ")} |`).join("\n")}

## 구간별 일치율

| 구간 | 맞음 | 일치율 |
| --- | --- | --- |
${sectionRows.join("\n")}

## 속도와 비용

| 항목 | 값 |
| --- | --- |
| 질문 판정 지연 p50 / p95 / 최대 | ${fmt(q(0.5), 2)}초 / ${fmt(q(0.95), 2)}초 / ${fmt(lat.length ? lat[lat.length - 1] / 1000 : null, 2)}초 |
| 6초 초과 비율(게임에서 "신호가 닿지 않음") | ${fmt(overTimeout)}% |
| 캐시 읽기 비중(입력 토큰 중) | ${fmt(cacheReadShare)}% |
| 플레이어 1명 예상 토큰(질문 ${CALLS_PER_PLAYER.question}회) | ${tokensPerPlayer == null ? "-" : Math.round(tokensPerPlayer).toLocaleString()} |
| 질문 판정 1회 평균 비용 | ${avgQ == null ? "-" : `$${avgQ.toFixed(5)}`} |
| 플레이어 1명 예상 비용(질문 ${CALLS_PER_PLAYER.question} + 서약 1 + 제출 1) | ${perPlayer == null ? "-" : `$${perPlayer.toFixed(3)}`} |

## 어긋난 항목

${failures.length ? `| ID | 언어 | 질문 | 기대 | 실제 |\n| --- | --- | --- | --- | --- |\n${failures.join("\n")}` : "없음"}

${otherFailures.length ? `### 서약·제출\n\n| ID | 입력 | 기대 | 실제 |\n| --- | --- | --- | --- |\n${otherFailures.join("\n")}` : ""}

${rule4Miss.length ? `### 수칙 4 위반을 놓친 항목\n\n${rule4Miss.map((r) => `- ${r.id} (${r.lang}) ${r.text}`).join("\n")}` : ""}

${errors.length ? `### 판정 오류\n\n${errors.map((e) => `- ${e.id}: ${e.error}`).join("\n")}` : ""}
`;

fs.mkdirSync(args.out!, { recursive: true });
const base = path.join(args.out!, `${stamp}-${args.mock ? "mock" : `${args.backend}-${judge!.model}${judge!.effort !== "-" ? `-${judge!.effort}` : ""}`}`);
fs.writeFileSync(`${base}.md`, report);
fs.writeFileSync(`${base}.json`, JSON.stringify({ questionRows, oathRows, subRows }, null, 2));
console.log(report);
console.error(`보고서: ${base}.md`);
