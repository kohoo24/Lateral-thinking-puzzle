// 질문을 모스 부호 깜빡임으로 바꾼다. 실제 길이와 상관없이 정해진 시간 안에 압축한다(docs/05).
const CODE: Record<string, string> = {
  a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---",
  k: "-.-", l: ".-..", m: "--", n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-",
  u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....",
  "6": "-....", "7": "--...", "8": "---..", "9": "----.",
};

// 라틴 문자가 아닌 글자(한글 등)는 글자 코드로 정해지는 모양으로 보낸다. 연출용이다.
function codeFor(ch: string): string {
  const known = CODE[ch.toLowerCase()];
  if (known) return known;
  const n = ch.codePointAt(0)!;
  return [0, 1, 2].map((i) => ((n >> (i * 3)) & 1 ? "-" : ".")).join("");
}

export function toMorse(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .map((w) => [...w].filter((c) => /[\p{L}\p{N}]/u.test(c)).map(codeFor).join(" "))
    .filter(Boolean)
    .join(" / ");
}

export type Pulse = { on: boolean; ms: number };

export function toPulses(text: string, minMs = 2000, maxMs = 3000): Pulse[] {
  const units: Pulse[] = [];
  const words = toMorse(text).split(" / ");
  words.forEach((word, wi) => {
    const letters = word.split(" ");
    letters.forEach((letter, li) => {
      [...letter].forEach((sym, si) => {
        units.push({ on: true, ms: sym === "-" ? 3 : 1 });
        if (si < letter.length - 1) units.push({ on: false, ms: 1 });
      });
      if (li < letters.length - 1) units.push({ on: false, ms: 3 });
    });
    if (wi < words.length - 1) units.push({ on: false, ms: 7 });
  });
  const total = units.reduce((a, u) => a + u.ms, 0);
  if (total === 0) return [];
  const target = Math.min(maxMs, Math.max(minMs, total * 60));
  const unit = target / total;
  return units.map((u) => ({ on: u.on, ms: u.ms * unit }));
}
