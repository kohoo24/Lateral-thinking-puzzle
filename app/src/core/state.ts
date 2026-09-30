// 게임 상태와 규칙 적용. 화면과 분리된 순수 함수라 자동 테스트로 검증한다.
import { BAD_ENDING_SCORE, KEROSENE_RESERVE, KEROSENE_TOTAL, RULE4_PENALTY, stageFor, type Lang } from "./rules";

export type Light = "yes" | "no" | "irrelevant" | "send_again" | "no_reach";

export type LogEntry = {
  question: string; // 화면에 보이는 문장(끼어든 단어 포함)
  intruded: string[];
  light: Light;
  lie: boolean; // 배 자신 관련(거짓 대답) 여부. 푸른빛 연출에 쓴다
};

export type GameOver = "bad_contamination" | "bad_lamp";

export type GameState = {
  playerName: string;
  lang: Lang;
  kerosene: number;
  score: number;
  stage: number;
  questionsSent: number; // 배에 닿은 신호 수
  log: LogEntry[];
  over: GameOver | null;
};

export type JudgeResult = {
  light: Light;
  contamination: number; // 판정 서버가 계산한 종류 점수 + 수칙 4 위반 점수
  selfRelated: boolean;
  rule4: boolean;
};

export function newGame(playerName: string, lang: Lang): GameState {
  return { playerName, lang, kerosene: KEROSENE_TOTAL, score: 0, stage: 0, questionsSent: 0, log: [], over: null };
}

export type SignalCheck = "ok" | "reserve_locked" | "over";

export function canSignal(s: GameState): SignalCheck {
  if (s.over) return "over";
  return s.kerosene > KEROSENE_RESERVE ? "ok" : "reserve_locked";
}

// 신호를 보내며 등유 1을 쓴다. 마지막 칸에서 억지로 당기면 등불이 꺼진다.
export function spendSignal(s: GameState, force = false): GameState {
  const check = canSignal(s);
  if (check === "over") return s;
  if (check === "reserve_locked") {
    if (!force) return s;
    return { ...s, kerosene: 0, over: "bad_lamp" };
  }
  return { ...s, kerosene: s.kerosene - 1 };
}

export type Applied = { state: GameState; stageChange: { from: number; to: number } | null };

export function applyResult(
  s: GameState,
  question: string,
  intruded: string[],
  r: JudgeResult,
  intrudedShipNameKept = false,
): Applied {
  const entry: LogEntry = { question, intruded, light: r.light, lie: r.light !== "no_reach" && r.selfRelated };
  if (r.light === "no_reach") {
    // 신호가 닿지 않음: 등유를 돌려주고 오염도 없다
    return { state: { ...s, kerosene: s.kerosene + 1, log: [...s.log, entry] }, stageChange: null };
  }
  const penalty = intrudedShipNameKept && !r.rule4 ? RULE4_PENALTY : 0;
  const score = s.score + r.contamination + penalty;
  const stage = stageFor(score);
  const state: GameState = {
    ...s,
    score,
    stage,
    questionsSent: s.questionsSent + 1,
    log: [...s.log, entry],
    over: score >= BAD_ENDING_SCORE ? "bad_contamination" : s.over,
  };
  return { state, stageChange: stage !== s.stage ? { from: s.stage, to: stage } : null };
}
