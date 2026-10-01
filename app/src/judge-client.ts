// 판정 서버 호출. 6초 안에 대답이 없거나 실패하면 "신호가 닿지 않음"(docs/05).
// 웹 플레이 빌드(VITE_JUDGE_MODE=claude)에서는 판정 서버 대신 judge-claude.ts로 묻는다.
import type { JudgeResult } from "./core/state";
import { askJudgeClaude, askOathClaude, askSubmissionClaude, claudeUnavailable } from "./judge-claude";

const JUDGE_URL = import.meta.env.VITE_JUDGE_URL ?? "";
const CLAUDE_MODE = import.meta.env.VITE_JUDGE_MODE === "claude";
export const GAME_TIMEOUT_MS = 6000;

export type JudgeResponse = JudgeResult & { debug?: unknown };

const NO_REACH: JudgeResponse = { light: "no_reach", contamination: 0, selfRelated: false, rule4: false };

// Claude 판정을 쓸 수 없을 때(동의 거절 등) 한 번만 알린다. 그 뒤 질문은 모두 "신호가 닿지 않음"이 된다.
let unavailableShown = false;
function noteClaudeUnavailable() {
  if (!claudeUnavailable || unavailableShown) return;
  unavailableShown = true;
  const el = document.getElementById("message");
  if (el) el.textContent = "Claude 판정을 쓸 수 없습니다(허용하지 않았거나 이 화면에서 지원되지 않음). / The judge (Claude) is unavailable here.";
}

export async function askJudge(sessionId: string, text: string): Promise<JudgeResponse> {
  if (CLAUDE_MODE) {
    const r = await askJudgeClaude(text);
    noteClaudeUnavailable();
    return r;
  }
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
  if (CLAUDE_MODE) return askOathClaude(text, playerName);
  const data = await post("/v1/oath", { sessionId, text, playerName }, 10_000);
  return data ? Boolean(data.valid) : null;
}

// 최종 제출 판정: 인정된 핵심 개수. 실패하면 null
export async function askSubmission(sessionId: string, text: string): Promise<number | null> {
  if (CLAUDE_MODE) return askSubmissionClaude(text);
  const data = await post("/v1/submission", { sessionId, text }, 15_000);
  return data && typeof data.count === "number" ? data.count : null;
}
