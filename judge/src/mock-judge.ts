// 개발용 가짜 판정 백엔드. API 키 없이 게임을 만져보기 위한 것으로, 판정 품질과는 무관하다.
// 검증 질문 세트에 있는 문장은 기대 결과대로, 나머지는 단순한 규칙과 해시로 대답한다.
import { judgeTests, type QuestionTest } from "./content.js";
import type { JudgeBackend, JudgeCall } from "./judge.js";
import type { OathJudgment, QuestionJudgment, SubmissionJudgment } from "./schema.js";

const normalize = (s: string) => s.toLowerCase().replace(/[\s?.!,'"’]/g, "");

const known = new Map<string, QuestionTest>();
for (const q of judgeTests.questions) {
  known.set(normalize(q.en), q);
  known.set(normalize(q.ko), q);
}

// 기대 결과를 그대로 내는 판정(테스트 러너의 --mock과 같은 방식)
export function judgmentFromExpected(t: QuestionTest): QuestionJudgment {
  const self = t.expectedSelfRelated ?? false;
  const base = {
    subject: self ? ("ship" as const) : ("past_event" as const),
    self_related: self,
    rule4_violation: t.expectedRule4,
    confidence: "high" as const,
    fact_ids: [] as number[],
  };
  if (t.expectedLight === "send_again") return { ...base, question_type: "open", proposition_truth: "not_in_facts" };
  if (t.expectedLight === "irrelevant") return { ...base, question_type: "yes_no", proposition_truth: "not_in_facts" };
  const truth = (t.expectedLight === "yes") !== self;
  return { ...base, question_type: "yes_no", proposition_truth: truth ? "true" : "false" };
}

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.codePointAt(0)!, 16777619);
  return h >>> 0;
}

function heuristic(text: string): QuestionJudgment {
  const t = text.toLowerCase();
  const open = /^(who|what|why|how|where|when|tell me)\b/.test(t) || /(누가|뭐야|무엇|왜|어떻게|어디|언제|알려줘)/.test(t);
  const self = /\b(you|your|yours)\b/.test(t) || /(너|네가|너희|네 )/.test(t);
  const nameWord = /\b(name|called|named)\b/.test(t) || /(이름|불러)/.test(t);
  const addressedByPerson = /\bare you (hale|crane|tanner|owen|brooks)\b/.test(t) || /너\s*(헤일|크레인|태너|오웬|브룩스)/.test(t);
  const h = hash(normalize(text)) % 10;
  return {
    question_type: open ? "open" : "yes_no",
    subject: self ? "ship" : "past_event",
    self_related: self,
    proposition_truth: open ? "not_in_facts" : h < 5 ? "true" : h < 8 ? "false" : "not_in_facts",
    rule4_violation: (self && nameWord) || addressedByPerson,
    confidence: "high",
    fact_ids: [],
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockJudge implements JudgeBackend {
  readonly model = "mock";
  readonly effort = "-";

  private async wrap<T>(result: T): Promise<JudgeCall<T>> {
    const latencyMs = 600 + Math.random() * 1800;
    await sleep(latencyMs);
    return { result, latencyMs, model: this.model, usage: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 } };
  }

  question(text: string) {
    const hit = known.get(normalize(text));
    return this.wrap(hit ? judgmentFromExpected(hit) : heuristic(text));
  }

  oath(text: string, playerName: string) {
    const names = playerName.split(/[\s()]+/).filter(Boolean);
    const hasName = names.some((n) => text.includes(n));
    const intent = /(swear|keeper|keep|pledge|서약|등대지기|지키)/i.test(text);
    const result: OathJudgment = { has_own_name: hasName, has_oath_intent: intent, names_someone_else: false, valid: hasName && intent };
    return this.wrap(result);
  }

  submission(text: string) {
    const t = text.toLowerCase();
    const g = (accepted: boolean) => ({ accepted, reason: "mock" });
    const result: SubmissionJudgment = {
      core1: g(/(rayne|레인|1951)/.test(t)),
      core2: g(/(rule 2|2번).*(fake|가짜)/.test(t)),
      core3: g(/(stop|멈)/.test(t) && /(signal|answer|교신|대답|신호)/.test(t)),
    };
    return this.wrap(result);
  }
}
