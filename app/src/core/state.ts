// 게임 상태와 규칙 적용. 화면과 분리된 순수 함수라 자동 테스트로 검증한다.
import {
  BAD_ENDING_SCORE,
  KEROSENE_RESERVE,
  KEROSENE_TOTAL,
  RULE4_PENALTY,
  STAGE_THRESHOLDS,
  stageFor,
  type Lang,
} from "./rules";

export type Light = "yes" | "no" | "irrelevant" | "send_again" | "no_reach";

export type LogEntry = {
  question: string; // 화면에 보이는 문장(끼어든 단어 포함)
  intruded: string[];
  light: Light;
  lie: boolean; // 배 자신 관련(거짓 대답) 여부. 푸른빛 연출에 쓴다
  altered?: boolean; // 2→3 전환으로 바뀐 문장
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
  rulesBroken: number[];
  storeroomOpened: boolean;
  oathUsed: boolean;
  doorOpened: boolean;
};

export type JudgeResult = {
  light: Light;
  contamination: number; // 판정 서버가 계산한 종류 점수 + 수칙 4 위반 점수
  selfRelated: boolean;
  rule4: boolean;
};

export const RULE3_PENALTY = 5; // 세 번 깜빡임에 대답
export const RULE6_PENALTY = 8; // 전임자에게 문을 열어줌
export const STOREROOM_COST = 2; // 계단을 내려가 문을 여는 동안 쓰는 등유

export function newGame(playerName: string, lang: Lang): GameState {
  return {
    playerName,
    lang,
    kerosene: KEROSENE_TOTAL,
    score: 0,
    stage: 0,
    questionsSent: 0,
    log: [],
    over: null,
    rulesBroken: [],
    storeroomOpened: false,
    oathUsed: false,
    doorOpened: false,
  };
}

export type SignalCheck = "ok" | "reserve_locked" | "over";

export function canSignal(s: GameState): SignalCheck {
  if (s.over) return "over";
  return s.kerosene > KEROSENE_RESERVE ? "ok" : "reserve_locked";
}

// 신호를 보내며 등유 1을 쓴다. 마지막 칸에서 억지로 당기면 등불이 꺼진다(수칙 1).
export function spendSignal(s: GameState, force = false): GameState {
  const check = canSignal(s);
  if (check === "over") return s;
  if (check === "reserve_locked") {
    if (!force) return s;
    return { ...s, kerosene: 0, over: "bad_lamp", rulesBroken: addRule(s.rulesBroken, 1) };
  }
  return { ...s, kerosene: s.kerosene - 1 };
}

export type Applied = { state: GameState; stageChange: { from: number; to: number } | null };

function addRule(rules: number[], n: number) {
  return rules.includes(n) ? rules : [...rules, n].sort();
}

function withScore(s: GameState, score: number): Applied {
  const stage = stageFor(score);
  const state: GameState = { ...s, score, stage, over: score >= BAD_ENDING_SCORE ? "bad_contamination" : s.over };
  return { state, stageChange: stage !== s.stage ? { from: s.stage, to: stage } : null };
}

export function applyResult(
  s: GameState,
  question: string,
  intruded: string[],
  r: JudgeResult,
  opts: { shipNameKept?: boolean; answeredThreeFlashes?: boolean } = {},
): Applied {
  const entry: LogEntry = { question, intruded, light: r.light, lie: r.light !== "no_reach" && r.selfRelated };
  if (r.light === "no_reach") {
    // 신호가 닿지 않음: 등유를 돌려주고 오염도 없다
    return { state: { ...s, kerosene: s.kerosene + 1, log: [...s.log, entry] }, stageChange: null };
  }
  let rules = s.rulesBroken;
  let penalty = 0;
  if (r.rule4 || opts.shipNameKept) rules = addRule(rules, 4);
  if (opts.shipNameKept && !r.rule4) penalty += RULE4_PENALTY;
  if (opts.answeredThreeFlashes) {
    penalty += RULE3_PENALTY;
    rules = addRule(rules, 3);
  }
  const next: GameState = { ...s, questionsSent: s.questionsSent + 1, log: [...s.log, entry], rulesBroken: rules };
  return withScore(next, s.score + r.contamination + penalty);
}

// 수칙 5: 창고 문을 연다. 등유 2를 쓰되 마지막 칸 아래로는 내리지 않는다.
export function openStoreroom(s: GameState): GameState {
  if (s.storeroomOpened) return s;
  return {
    ...s,
    storeroomOpened: true,
    kerosene: Math.max(KEROSENE_RESERVE, s.kerosene - STOREROOM_COST),
    rulesBroken: addRule(s.rulesBroken, 5),
  };
}

// 수칙 6: 전임자에게 문을 열어준다.
export function openDoor(s: GameState): Applied {
  if (s.doorOpened) return { state: s, stageChange: null };
  return withScore({ ...s, doorOpened: true, rulesBroken: addRule(s.rulesBroken, 6) }, s.score + RULE6_PENALTY);
}

export type OathCheck = "ok" | "used" | "nothing_to_recover" | "too_late";

// 서약서는 게임 전체에서 1회, 오염 1~2단계에서만 쓸 수 있다(docs/01).
export function canUseOath(s: GameState): OathCheck {
  if (s.oathUsed) return "used";
  if (s.stage === 0) return "nothing_to_recover";
  if (s.stage >= 3) return "too_late";
  return "ok";
}

// 오염을 한 단계 되돌린다. 누적 점수는 이전 단계의 시작 점수로 돌아간다.
export function recoverWithOath(s: GameState): Applied {
  if (canUseOath(s) !== "ok") return { state: s, stageChange: null };
  return withScore({ ...s, oathUsed: true }, STAGE_THRESHOLDS[s.stage - 1]);
}

// 2→3 전환: 교신 기록의 초반 질문 하나가 플레이어가 쓰지 않은 문장으로 바뀐다(docs/05).
export const ALTERED_QUESTION: Record<Lang, string> = { en: "Should I come aboard?", ko: "배에 올라야 해?" };

export function alterEarlyQuestion(s: GameState): GameState {
  const i = s.log.findIndex((e) => e.light !== "no_reach" && !e.altered);
  if (i < 0) return s;
  const log = s.log.map((e, j) => (j === i ? { ...e, question: ALTERED_QUESTION[s.lang], intruded: [], altered: true } : e));
  return { ...s, log };
}

// 배드 엔딩에서 새 등대지기가 보내오는 질문: 교신 기록에 남은 처음 세 질문(docs/06)
export const SPARE_QUESTIONS: Record<Lang, string[]> = {
  en: ["Is anyone out there?", "Are you in trouble?", "Should I answer you?"],
  ko: ["거기 누구 있어?", "조난당했어?", "대답해야 해?"],
};

export function firstQuestions(s: GameState): string[] {
  const sent = s.log.filter((e) => e.light !== "no_reach").map((e) => {
    let q = e.question;
    for (const w of e.intruded) q = q.replace(w, "");
    return q.replace(/\s+/g, " ").trim();
  });
  return [...sent, ...SPARE_QUESTIONS[s.lang]].slice(0, 3);
}
