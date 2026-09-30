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
