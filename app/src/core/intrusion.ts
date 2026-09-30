// 오염 2단계부터 입력 문장에 끼어드는 배의 말(docs/05).
import type { Lang } from "./rules";

export const SHIP_NAME: Record<Lang, string> = { en: "Thomas Hale", ko: "토머스 헤일" };

// "answer"가 가장 자주 끼어들도록 두 번 넣는다
export const INTRUDING_WORDS: Record<Lang, string[]> = {
  en: ["answer", "answer", "aboard", "come", "tide", "drowned", SHIP_NAME.en],
  ko: ["대답", "대답", "승선", "와라", "밀물", "물에 잠긴", SHIP_NAME.ko],
};

// 2단계는 질문 세 번에 한 번, 3단계부터는 매번
export function shouldIntrude(stage: number, questionIndex: number): boolean {
  if (stage >= 3) return true;
  if (stage === 2) return questionIndex % 3 === 2;
  return false;
}

export function pickWord(lang: Lang, rand: () => number = Math.random): string {
  const words = INTRUDING_WORDS[lang];
  return words[Math.floor(rand() * words.length)];
}

// 문장 가운데와 가장 가까운 띄어쓰기 위치. 띄어쓰기가 없으면 문장 끝.
export function insertionIndex(text: string): number {
  const mid = text.length / 2;
  let best = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === " " && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  return best < 0 ? text.length : best;
}
