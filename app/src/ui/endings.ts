// 엔딩 4종과 결과 화면(docs/06).
import { ENDING_TEXT, STAGE_NAMES, TEASER } from "../content/texts";
import type { Ending } from "../core/endings";
import { toPulses } from "../core/morse";
import type { Lang } from "../core/rules";
import type { Strings } from "../i18n";
import { el, escapeHtml, sleep } from "./dom";

export type EndingSummary = {
  ending: Ending;
  lang: Lang;
  playerName: string;
  cores: number; // 인정된 핵심 개수
  signals: number;
  stage: number;
  oathUsed: boolean;
  storeroomOpened: boolean;
  playMs: number;
  badQuestions: string[]; // 배드 엔딩에서 새 등대지기가 보내오는 질문
};

function screen(cls: string) {
  const s = el("div", `ending ${cls}`);
  document.body.append(s);
  return s;
}

async function lines(target: HTMLElement, texts: readonly string[], gap = 2200) {
  for (const text of texts) {
    target.append(el("p", "ending-line", escapeHtml(text)));
    await sleep(gap);
  }
}

function registerLine(name: string, date: string, extra = "") {
  return `<div class="register-line"><span class="hand-player ${extra}">${escapeHtml(name)}</span><span class="hand-player date">${escapeHtml(date)}</span></div>`;
}

export async function playEnding(s: EndingSummary, t: Strings) {
  const L = s.lang;
  if (s.ending === "bad") return playBad(s, t);
  const text = ENDING_TEXT[s.ending];
  const view = screen(`ending-${s.ending}`);
  view.append(el("h2", "ending-title", text.title));
  const body = el("div", "ending-body");
  view.append(body);
  await sleep(800);
  await lines(body, text[L]);
  if (s.ending === "partial") {
    const blur = s.cores >= 2 ? "blur-tail" : "blur-half";
    const ink = s.cores >= 2 ? "" : "wet";
    body.append(el("div", "", registerLine(s.playerName, "November 15, 1984", blur).replace('class="hand-player date"', `class="hand-player date ${ink}"`)));
  } else {
    body.append(el("div", "", registerLine(s.playerName, "November 15, 1984")));
  }
  if (s.ending === "hidden") body.append(el("p", "hand-player memo", "Do not answer. Do not ask. Keep the lamp."));
  await sleep(2500);
  // 진 엔딩 마지막 장면: 수평선 끝에서 아주 희미한 불빛이 한 번 깜빡인다
  if (s.ending === "true") {
    view.classList.add("last-light");
    await sleep(2500);
  }
  view.remove();
  showResult(s, t);
}

// 배드 엔딩: 역할이 뒤집힌다. 1년 뒤 새 등대지기의 질문에 불빛으로만 대답한다.
async function playBad(s: EndingSummary, t: Strings) {
  const L = s.lang;
  const view = screen("ending-bad");
  view.append(el("div", "deck-light"));
  const caption = el("p", "deck-date", ENDING_TEXT.bad[L][0]);
  const incoming = el("p", "deck-incoming");
  const buttons = el("div", "deck-buttons");
  view.append(caption, incoming, buttons);
  await sleep(2500);
  for (const q of s.badQuestions) {
    incoming.textContent = "";
    // 등대에서 모스 신호가 오고, 해독된 문장이 한 글자씩 나타난다
    const pulses = toPulses(q, 2500, 3500);
    const per = pulses.reduce((a, p) => a + p.ms, 0) / Math.max(1, q.length);
    for (const ch of q) {
      incoming.textContent += ch;
      await sleep(per);
    }
    // 무엇을 누르든 배의 불빛이 그대로 나간다. 대답은 기록하지도 판정하지도 않는다.
    await new Promise<void>((resolve) => {
      buttons.replaceChildren(
        ...[t.flashOnce, t.flashTwice].map((label) => {
          const b = el("button", "", label);
          b.type = "button";
          b.addEventListener("click", () => {
            buttons.replaceChildren();
            view.classList.add("flash");
            setTimeout(() => view.classList.remove("flash"), 500);
            resolve();
          });
          return b;
        }),
      );
    });
    await sleep(1500);
  }
  incoming.textContent = "";
  view.append(el("div", "deck-register", registerLine(s.playerName, "November 14, 1984") + registerLine("…", "")));
  await sleep(3500);
  view.append(el("p", "ending-line final", ENDING_TEXT.bad[L][1]));
  await sleep(3500);
  view.remove();
  showResult(s, t);
}

const TITLES: Record<Ending, string> = {
  true: ENDING_TEXT.true.title,
  hidden: ENDING_TEXT.hidden.title,
  partial: ENDING_TEXT.partial.title,
  bad: ENDING_TEXT.bad.title,
};

// 결과 화면: 무엇을 놓쳤는지는 알려주지 않는다. 어긴 수칙도 표시하지 않는다(가짜 수칙의 정답이 드러나므로).
function showResult(s: EndingSummary, t: Strings) {
  const view = screen("result");
  const mm = Math.floor(s.playMs / 60000);
  const ss = Math.floor((s.playMs % 60000) / 1000);
  const icons = [0, 1, 2].map((i) => `<span class="beacon ${i < s.cores ? "lit" : ""}"></span>`).join("");
  const rows: [string, string][] = [
    [t.r_ending, TITLES[s.ending]],
    [t.r_truth, icons],
    [t.r_signals, `${s.signals} / 24`],
    [t.r_contamination, `${STAGE_NAMES.en[Math.min(s.stage, 4)]} / ${STAGE_NAMES.ko[Math.min(s.stage, 4)]}`],
    [t.r_oath, s.oathUsed ? t.used : t.unused],
    [t.r_storeroom, s.storeroomOpened ? t.opened : t.notOpened],
    [t.r_time, `${mm}:${String(ss).padStart(2, "0")}`],
  ];
  view.innerHTML = `<h2>Answer in Light</h2><table>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")}</table>`;
  if (s.ending === "true") view.append(el("p", "teaser", escapeHtml(TEASER[s.lang])));
  const row = el("div", "modal-buttons");
  const again = el("button", "primary", t.restart);
  again.type = "button";
  again.addEventListener("click", () => location.reload());
  row.append(again);
  view.append(row);
}
