// 판정 백엔드 선택. 기본은 Jev(이 게임의 판정 AI)다.
//   jev    TypeSafe Jev (TYPESAFE_API_KEY 필요)
//   claude Claude API (비교용, ANTHROPIC_API_KEY 필요)
//   mock   개발용 가짜 판정 (키 불필요)
import { ClaudeJudge, type Effort, type JudgeBackend } from "./judge.js";
import { JevJudge } from "./jev-judge.js";
import { MockJudge } from "./mock-judge.js";

export type BackendName = "jev" | "claude" | "mock";

export function createJudge(
  name: string = process.env.JUDGE_BACKEND ?? "jev",
  opts: { model?: string; effort?: Effort; timeoutMs?: number; maxRetries?: number } = {},
): JudgeBackend {
  switch (name) {
    case "jev":
      return new JevJudge(opts);
    case "claude":
      return new ClaudeJudge(opts);
    case "mock":
      return new MockJudge();
    default:
      throw new Error(`알 수 없는 판정 백엔드: ${name} (jev, claude, mock 중 하나)`);
  }
}
