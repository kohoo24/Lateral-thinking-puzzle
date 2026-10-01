// 판정 서버 호출. 6초 안에 대답이 없거나 실패하면 "신호가 닿지 않음"(docs/05).
import type { JudgeResult } from "./core/state";

const JUDGE_URL = import.meta.env.VITE_JUDGE_URL ?? "";
export const GAME_TIMEOUT_MS = 6000;

export type JudgeResponse = JudgeResult & { debug?: unknown };

const NO_REACH: JudgeResponse = { light: "no_reach", contamination: 0, selfRelated: false, rule4: false };

export async function askJudge(sessionId: string, text: string): Promise<JudgeResponse> {
  try {
    const res = await fetch(`${JUDGE_URL}/v1/question`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, text }),
      signal: AbortSignal.timeout(GAME_TIMEOUT_MS),
    });
    if (!res.ok) return NO_REACH;
    const data = await res.json();
    return {
      light: data.light,
      contamination: data.contamination ?? 0,
      selfRelated: Boolean(data.judgment?.self_related),
      rule4: Boolean(data.judgment?.rule4_violation),
      debug: data.judgment,
    };
  } catch {
    return NO_REACH;
  }
}

async function post(path: string, body: unknown, timeoutMs: number): Promise<any | null> {
  try {
    const res = await fetch(`${JUDGE_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// 서약 판정. 실패하면 null(서약서는 쓰이지 않고 남는다)
export async function askOath(sessionId: string, text: string, playerName: string): Promise<boolean | null> {
  const data = await post("/v1/oath", { sessionId, text, playerName }, 10_000);
  return data ? Boolean(data.valid) : null;
}

// 최종 제출 판정: 인정된 핵심 개수. 실패하면 null
export async function askSubmission(sessionId: string, text: string): Promise<number | null> {
  const data = await post("/v1/submission", { sessionId, text }, 15_000);
  return data && typeof data.count === "number" ? data.count : null;
}
