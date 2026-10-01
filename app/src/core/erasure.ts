// 오염 3단계부터 자신을 가리키는 말이 지워진다(docs/05). 목록과 정확히 일치하는 단어만 지운다.
import type { Lang } from "./rules";

export const ERASED_WORDS: Record<Lang, string[]> = {
  en: ["i", "me", "my", "mine", "myself", "home"],
  ko: ["나", "나는", "나를", "나도", "나의", "내", "내가", "저는", "저를", "저도", "제", "제가", "우리", "우리는", "우리가", "우리를", "집"],
};

const KO_PARTICLES = ["", "은", "는", "이", "가", "을", "를", "의", "도", "야", "아"];

// 지울 단어의 [시작, 끝) 위치 목록
export function erasableRanges(text: string, lang: Lang, playerName: string): [number, number][] {
  const out: [number, number][] = [];
  const name = playerName.trim().toLowerCase();
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const token = m[0];
    // 영어는 앞뒤 문장부호를 떼고 비교한다(I'm은 목록에 없으므로 그대로 둔다)
    const lead = token.match(/^[^\p{L}\p{N}]*/u)![0].length;
    const trail = token.match(/[^\p{L}\p{N}]*$/u)![0].length;
    const core = token.slice(lead, token.length - trail);
    if (!core) continue;
    const lower = core.toLowerCase();
    const start = m.index + lead;
    const isName =
      name &&
      (lang === "ko" ? KO_PARTICLES.some((p) => lower === name + p) : lower === name || lower === `${name}'s`);
    if (ERASED_WORDS[lang].includes(lower) || isName) out.push([start, start + core.length]);
  }
  return out;
}
