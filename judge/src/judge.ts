// Claude API로 판정하는 부분. 게임 서버와 테스트 러너가 함께 쓴다.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { OATH_SYSTEM, QUESTION_SYSTEM, SUBMISSION_SYSTEM } from "./prompt.js";
import { OathJudgment, QuestionJudgment, SubmissionJudgment } from "./schema.js";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type JudgeOptions = {
  model?: string;
  effort?: Effort;
  timeoutMs?: number;
  maxRetries?: number;
};

export type Usage = {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
};

export type JudgeCall<T> = {
  result: T;
  usage: Usage;
  latencyMs: number;
  model: string;
};

// 거절(refusal)이나 형식 오류 등 판정을 낼 수 없는 경우. 게임에서는 "신호가 닿지 않음"으로 처리한다.
export class JudgeUnavailable extends Error {}

export const DEFAULT_MODEL = "claude-opus-5-5";
export const DEFAULT_EFFORT: Effort = "low";

export class Judge {
  readonly model: string;
  readonly effort: Effort;
  private client: Anthropic;

  constructor(opts: JudgeOptions = {}) {
    this.model = opts.model ?? process.env.JUDGE_MODEL ?? DEFAULT_MODEL;
    this.effort = opts.effort ?? (process.env.JUDGE_EFFORT as Effort | undefined) ?? DEFAULT_EFFORT;
    this.client = new Anthropic({ timeout: opts.timeoutMs ?? 30_000, maxRetries: opts.maxRetries ?? 2 });
  }

  question(text: string) {
    return this.call(QUESTION_SYSTEM, QuestionJudgment, `<question>${text}</question>`);
  }

  oath(text: string, playerName: string) {
    return this.call(OATH_SYSTEM, OathJudgment, `<player_name>${playerName}</player_name>\n<oath>${text}</oath>`);
  }

  submission(text: string) {
    return this.call(SUBMISSION_SYSTEM, SubmissionJudgment, `<report>${text}</report>`);
  }

  private async call<S extends z.ZodType>(system: string, schema: S, content: string): Promise<JudgeCall<z.infer<S>>> {
    const started = performance.now();
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: this.effort, format: betaZodOutputFormat(schema) },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    });
    const latencyMs = performance.now() - started;

    if (response.stop_reason === "refusal") {
      throw new JudgeUnavailable(`refusal: ${response.stop_details?.category ?? "unknown"}`);
    }
    if (response.parsed_output == null) {
      throw new JudgeUnavailable(`unparsed output (stop_reason: ${response.stop_reason})`);
    }
    const u = response.usage;
    return {
      result: response.parsed_output as z.infer<S>,
      latencyMs,
      model: response.model,
      usage: {
        input: u.input_tokens,
        output: u.output_tokens,
        cacheWrite: u.cache_creation_input_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
      },
    };
  }
}

// 1M 토큰당 달러(입력, 출력, 캐시 읽기). 캐시 쓰기는 입력의 1.25배(5분 TTL).
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
};

export function costUsd(model: string, u: Usage): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return (u.input * p.input + u.cacheWrite * p.input * 1.25 + u.cacheRead * p.cacheRead + u.output * p.output) / 1e6;
}
