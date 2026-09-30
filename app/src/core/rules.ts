// 게임 규칙 수치. 출처: docs/01(등유, 오염 단계), docs/05(입력 비율).
export type Lang = "en" | "ko";

export const KEROSENE_TOTAL = 25;
export const KEROSENE_RESERVE = 1; // 마지막 한 칸은 등불 몫
export const STAGE_THRESHOLDS = [0, 8, 16, 26, 36] as const;
export const BAD_ENDING_SCORE = 44;
export const RULE4_PENALTY = 5; // 끼어든 배의 이름을 지우지 않고 보냄

// 오염 단계별 입력 가능 분량(처음 대비 비율). 4단계는 "몇 단어".
export const INPUT_RATIO = [1, 0.75, 0.5, 0.25, 0.1] as const;
export const BASE_INPUT_LIMIT: Record<Lang, number> = { en: 120, ko: 60 };

export function stageFor(score: number): number {
  let stage = 0;
  STAGE_THRESHOLDS.forEach((t, i) => {
    if (score >= t) stage = i;
  });
  return stage;
}

export function inputLimit(stage: number, lang: Lang): number {
  return Math.max(8, Math.round(BASE_INPUT_LIMIT[lang] * INPUT_RATIO[Math.min(stage, 4)]));
}
