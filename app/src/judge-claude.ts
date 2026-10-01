// 웹 플레이 빌드(VITE_JUDGE_MODE=claude)의 판정. 판정 서버 대신 claude.ai 아티팩트의 `sample` 기능으로
// 보는 사람의 Claude 계정에 묻는다. 규칙 문장(judge/src/prompt.ts)과 불빛·오염 규칙(judge/src/light.ts)은
// 판정 서버와 같은 것을 쓴다. 판정 AI만 Jev 대신 Claude라서 결과가 조금 다를 수 있다.
import { contaminationFor, countCores, decideLight } from "../../judge/src/light";
import { OATH_SYSTEM, QUESTION_SYSTEM, SUBMISSION_SYSTEM } from "../../judge/src/prompt";
import type { QuestionJudgment, SubmissionJudgment } from "../../judge/src/schema";
import type { JudgeResponse } from "./judge-client";

type Sample = {
  json<T = unknown>(input: string, options?: { modelTier?: "quick" | "default" | "complex"; cache?: boolean }): Promise<T>;
};
type ClaudeRuntime = { use(name: "sample"): Promise<Sample | null> };

let samplePromise: Promise<Sample | null> | null = null;
function getSample(): Promise<Sample | null> {
  const runtime = (window as unknown as { claude?: ClaudeRuntime }).claude;
  samplePromise ??= runtime ? runtime.use("sample").catch(() => null) : Promise.resolve(null);
  return samplePromise;
}

// 판정 요청이 막혔는지(동의 거절, 기능 없음). 게임 화면에 한 번 알린다.
export let claudeUnavailable: string | null = null;

async function ask<T>(prompt: string, tier: "quick" | "default"): Promise<T | null> {
  const sample = await getSample();
  if (!sample) {
    claudeUnavailable = "unavailable";
    return null;
  }
  try {
    // 같은 질문을 다시 보내도 새로 판정하도록 캐시는 끈다(게임에서는 같은 질문도 등유를 쓴다)
    return await sample.json<T>(prompt, { modelTier: tier, cache: false });
  } catch (e) {
    const code = (e as { code?: string })?.code ?? "upstream_error";
    if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(code)) {
      claudeUnavailable = code;
    }
    return null;
  }
}

const QUESTION_FORMAT = `Reply with only one JSON object with exactly these fields, for example:
{"question_type":"yes_no","subject":"ship","self_related":true,"proposition_truth":"true","rule4_violation":false,"confidence":"high","fact_ids":[13]}`;

const ENUMS = {
  question_type: ["yes_no", "open", "lie_condition"],
  subject: ["ship", "person", "player", "past_event", "other"],
  proposition_truth: ["true", "false", "not_in_facts"],
  confidence: ["high", "medium", "low"],
} as const;

function asQuestionJudgment(v: unknown): QuestionJudgment | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  for (const [k, allowed] of Object.entries(ENUMS)) {
    if (!(allowed as readonly unknown[]).includes(o[k])) return null;
  }
  if (typeof o.self_related !== "boolean" || typeof o.rule4_violation !== "boolean") return null;
  return {
    question_type: o.question_type as QuestionJudgment["question_type"],
    subject: o.subject as QuestionJudgment["subject"],
    self_related: o.self_related,
    proposition_truth: o.proposition_truth as QuestionJudgment["proposition_truth"],
    rule4_violation: o.rule4_violation,
    confidence: o.confidence as QuestionJudgment["confidence"],
    fact_ids: Array.isArray(o.fact_ids) ? o.fact_ids.filter((n): n is number => Number.isInteger(n)) : [],
  };
}

const NO_REACH: JudgeResponse = { light: "no_reach", contamination: 0, selfRelated: false, rule4: false };

export async function askJudgeClaude(text: string): Promise<JudgeResponse> {
  // 판정은 짧은 분류라 빠른 모델로 묻는다(게임은 기다리는 동안에도 폭풍 시계가 간다)
  const raw = await ask<unknown>(`${QUESTION_SYSTEM}\n\n<question>${text}</question>\n\n${QUESTION_FORMAT}`, "quick");
  const judgment = asQuestionJudgment(raw);
  if (!judgment) return NO_REACH;
  const light = decideLight(judgment);
  return {
    light,
    contamination: contaminationFor(judgment, light),
    selfRelated: judgment.self_related,
    rule4: judgment.rule4_violation,
    debug: judgment,
  };
}

export async function askOathClaude(text: string, playerName: string): Promise<boolean | null> {
  const raw = await ask<{ valid?: unknown }>(
    `${OATH_SYSTEM}\n\n<player_name>${playerName}</player_name>\n<oath>${text}</oath>\n\nReply with only one JSON object: {"has_own_name":true,"has_oath_intent":true,"names_someone_else":false,"valid":true}`,
    "quick",
  );
  return raw && typeof raw.valid === "boolean" ? raw.valid : null;
}

export async function askSubmissionClaude(text: string): Promise<number | null> {
  // 최종 제출은 한 번뿐이고 채점이 섬세해서 기본 모델로 묻는다
  const raw = await ask<SubmissionJudgment>(
    `${SUBMISSION_SYSTEM}\n\n<report>${text}</report>\n\nReply with only one JSON object: {"core1":{"accepted":true,"reason":"..."},"core2":{"accepted":false,"reason":"..."},"core3":{"accepted":false,"reason":"..."}}`,
    "default",
  );
  if (!raw || ![raw.core1, raw.core2, raw.core3].every((c) => c && typeof c.accepted === "boolean")) return null;
  return countCores(raw);
}
