// TypeSafe Jev(System One) 판정 백엔드. 이 게임의 기본 판정 AI다.
// Jev는 글을 생성하지 않고, 이름 붙은 질문마다 확률이 붙은 타입 결과(예/아니오, 선택지, 점수)를 돌려준다.
// 판정 결과를 확률 그대로 쓰지 않고 구간(THRESHOLDS)으로 끊어 같은 뜻의 질문에 같은 불빛이 나오게 한다(docs/01).
import { choice, noul, TypeSafeClient, type Fetch, type NoulResponse } from "@typesafe-ai/sdk";
import type { JudgeBackend, JudgeCall } from "./judge.js";
import { FACT_LINES, RULES } from "./prompt.js";
import type { OathJudgment, QuestionJudgment, SubmissionJudgment } from "./schema.js";

export const DEFAULT_JEV_MODEL = "jev-latest";

// 확률을 판정으로 바꾸는 구간. 판정 테스트 결과를 보고 조정한다.
export const THRESHOLDS = {
  // 명제 판정에서 가장 높은 선택지의 확률이 이보다 낮으면 "신호가 닿지 않음"(등유 반환)
  minTruthConfidence: 0.5,
  selfRelated: 0.5,
  // 수칙 4 오탐은 0건이 목표라 위반은 더 확실할 때만 인정한다.
  // 2026-10-01 판정 테스트 3회(jev-1.13.0, "이름을 묻는 행위에 대한 질문은 비위반" 규칙 추가 후):
  // 비위반 최고 0.63(H9 ko), 실제 위반 최저 0.82(H3 ko) → 사이에서 오탐 쪽으로 여유를 둔 0.75
  rule4: 0.75,
  oathValid: 0.5,
  coreAccepted: 0.5,
};

const GAME = `${RULES.context}\n${RULES.factsNote}`;

const questionQuestions = {
  question_type: choice("What kind of question did the player send?", {
    yes_no: "It can be answered yes or no.",
    open: "It cannot be answered yes or no.",
    lie_condition: "It asks about the lie rule itself: whether the ship lies or reverses answers about itself, or whether its answers about itself can be trusted.",
  }),
  subject: choice(`Who is the question about, after restoring an omitted subject?\n${RULES.omittedSubject}`, {
    ship: "The ship at sea tonight (you, your ship, that ship, the crew as a whole).",
    person: "A specific named person (Crane, Owen, Tanner, Brooks, Hale, the keeper in 1951) as the subject. Not \"Are you <person>?\" addressed to the ship.",
    player: "The player (I, me, we).",
    past_event: "A past event, place, rule, document, or the weather.",
    other: "Anything else.",
  }),
  self_related: noul(`Is the question about the ship itself tonight?\n${RULES.selfRelated}\n${RULES.omittedSubject}`, {
    true: "It asks about the ship tonight: its identity, name, crew as a whole, intentions, its own actions (what it does or did to people, even in the past, as in \"Did you <do something to> <person>?\"), or its own rules (how the ship behaves; the numbered keeper's rules are lighthouse documents, not the ship's rules). This includes asking the ship whether it is a person (\"Are you <person>?\").",
    false: "Its subject is a specific person (even with \"you\" elsewhere in the question, as in \"Does <person> sail with you?\"), a past event not done by the ship, the player's survival or actions, or anything else.",
  }),
  proposition_truth: choice(
    `According to the facts only, is the proposition in the player's question true? Judge the literal proposition before any reversal.\n${RULES.truth}`,
    {
      true: "The facts make the proposition true.",
      false: "The facts make the proposition false.",
      not_in_facts: "The facts do not decide it, or the question is not a yes/no question.",
    },
  ),
  rule4_violation: noul(`Does the question break the rule "Never ask the ship its name"?\n${RULES.rule4}`, {
    true: "Its answer would be the ship's current name, or would confirm one specific name offered for the ship (with a naming word, or by addressing the ship by a person's name).",
    false: "It does not request or confirm the ship's name. This includes questions about the rule or about the act of asking the name (why it is forbidden, what happens, whether it is risky).",
  }),
};

const isYes = (r: NoulResponse, threshold: number) => r.noul >= threshold;

export class JevJudge implements JudgeBackend {
  readonly model: string;
  readonly effort = "-";
  private client: TypeSafeClient;

  constructor(opts: { model?: string; timeoutMs?: number; maxRetries?: number; apiKey?: string; fetch?: Fetch } = {}) {
    this.model = opts.model ?? process.env.TYPESAFE_DEFAULT_MODEL ?? DEFAULT_JEV_MODEL;
    this.client = new TypeSafeClient({
      apiKey: opts.apiKey,
      fetch: opts.fetch,
      defaultModel: this.model,
      timeout: opts.timeoutMs ?? 10_000,
      retry: { maxRetries: opts.maxRetries ?? 2 },
    });
  }

  async question(text: string): Promise<JudgeCall<QuestionJudgment>> {
    const started = performance.now();
    const res = await this.client.systemOne({
      state: { game: GAME, facts: FACT_LINES, player_question: text },
      questions: questionQuestions,
    });
    const a = res.answers;
    const truthConfidence = Math.max(...Object.values(a.proposition_truth.probabilities));
    const result: QuestionJudgment & { probabilities: unknown } = {
      question_type: a.question_type.choice,
      subject: a.subject.choice,
      self_related: isYes(a.self_related, THRESHOLDS.selfRelated),
      proposition_truth: a.proposition_truth.choice,
      rule4_violation: isYes(a.rule4_violation, THRESHOLDS.rule4),
      confidence: truthConfidence < THRESHOLDS.minTruthConfidence ? "low" : truthConfidence < 0.75 ? "medium" : "high",
      fact_ids: [],
      // 구간을 조정할 수 있도록 원래 확률도 남긴다
      probabilities: {
        question_type: a.question_type.probabilities,
        subject: a.subject.probabilities,
        self_related: a.self_related.noul,
        proposition_truth: a.proposition_truth.probabilities,
        rule4_violation: a.rule4_violation.noul,
      },
    };
    return this.wrap(result, res.model, res.usage, started);
  }

  async oath(text: string, playerName: string): Promise<JudgeCall<OathJudgment>> {
    const started = performance.now();
    const res = await this.client.systemOne({
      state: { game: "A lighthouse keeper rewrites the keeper's oath in their own words to reclaim their name.", player_name: playerName, oath: text },
      questions: {
        has_own_name: noul("Does the oath contain the player's own name (player_name), in any script or spelling close to it?"),
        has_oath_intent: noul("Does the oath express an intent to swear, pledge, or declare themselves the keeper, or to keep the light?"),
        names_someone_else: noul("Does the oath name someone other than the player as the keeper?"),
      },
    });
    const a = res.answers;
    const has_own_name = isYes(a.has_own_name, THRESHOLDS.oathValid);
    const has_oath_intent = isYes(a.has_oath_intent, THRESHOLDS.oathValid);
    const names_someone_else = isYes(a.names_someone_else, THRESHOLDS.oathValid);
    const result: OathJudgment = { has_own_name, has_oath_intent, names_someone_else, valid: has_own_name && has_oath_intent && !names_someone_else };
    return this.wrap(result, res.model, res.usage, started);
  }

  async submission(text: string): Promise<JudgeCall<SubmissionJudgment>> {
    const started = performance.now();
    const core = (n: 1 | 2 | 3) =>
      noul(`Following the grading rules, is core ${n} accepted in the report?\n${RULES.submission}`, {
        true: `The report states core ${n} as one clear claim (hedging allowed).`,
        false: `Core ${n} is missing, listed among alternatives, mixed with a wrong claim, or contradicted.`,
      });
    const res = await this.client.systemOne({
      state: { game: "A player writes their final report of what happened tonight.", report: text },
      questions: { core1: core(1), core2: core(2), core3: core(3) },
    });
    const a = res.answers;
    const grade = (r: NoulResponse) => ({ accepted: isYes(r, THRESHOLDS.coreAccepted), reason: `p=${r.noul.toFixed(2)}` });
    const result: SubmissionJudgment = { core1: grade(a.core1), core2: grade(a.core2), core3: grade(a.core3) };
    return this.wrap(result, res.model, res.usage, started);
  }

  private wrap<T>(result: T, model: string, usage: { input_tokens: number; output_tokens: number }, started: number): JudgeCall<T> {
    return {
      result,
      model,
      latencyMs: performance.now() - started,
      usage: { input: usage.input_tokens, output: usage.output_tokens, cacheWrite: 0, cacheRead: 0 },
    };
  }
}
