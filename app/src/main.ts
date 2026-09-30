// M1: 등실 한 장면. 질문 입력 → 모스 신호 → 기다림 → 배의 불빛 대답, 등유, 오염 0~2단계, 끼어드는 단어.
import "./style.css";
import { insertionIndex, pickWord, shouldIntrude, SHIP_NAME } from "./core/intrusion";
import { toPulses } from "./core/morse";
import { inputLimit, KEROSENE_RESERVE, KEROSENE_TOTAL, stageFor, type Lang } from "./core/rules";
import { applyResult, canSignal, newGame, spendSignal, type GameState, type LogEntry } from "./core/state";
import { LIGHT_MARK, RULE_CARD, strings, type Strings } from "./i18n";
import { askJudge } from "./judge-client";
import { NoteInput } from "./note";
import { LampRoomScene } from "./scene";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DEBUG = new URLSearchParams(location.search).has("debug");
const FORCE_HOLD_MS = 2000;

// 기다림: 최소 1.5초, 2단계부터 뜸이 길어진다(최대 4초)
const MIN_WAIT_MS = [1500, 1500, 3000, 3500, 4000];

const scene = new LampRoomScene();
let lang: Lang = "en";
let t: Strings = strings(lang);
let game: GameState = newGame("", lang);
let sessionId = crypto.randomUUID();
let busy = false;
let intrudedThisQuestion = false;
let lastJudgment: unknown = null;

const note = new NoteInput($<HTMLDivElement>("note"), $("counter"), {
  limit: () => inputLimit(game.stage, game.lang),
  showCounter: () => game.stage >= 1,
  onSubmit: () => void signal(false),
  onIdle: maybeIntrude,
});

// ---------- 화면 갱신 ----------
function renderStatic() {
  t = strings(lang);
  $("card").innerHTML = RULE_CARD.en.map((l, i) => `<div>${l}</div><div class="ko">${lang === "ko" ? RULE_CARD.ko[i] : ""}</div>`).join("");
  $("gauge-label").textContent = t.kerosene;
  $("log-title").textContent = t.log;
  $("lever-label").textContent = t.lever;
  $("note").dataset.placeholder = t.placeholder;
  $("start-sub").textContent = t.subtitle;
  $("register-label").textContent = t.register;
  $<HTMLInputElement>("name").placeholder = t.namePlaceholder;
  $("start-btn").textContent = t.start;
  $("restart").textContent = t.restart;
  document.documentElement.lang = lang;
  document.querySelectorAll<HTMLButtonElement>("[data-lang]").forEach((b) => b.classList.toggle("on", b.dataset.lang === lang));
}

function renderGauge() {
  const cells = $("cells");
  if (cells.children.length !== KEROSENE_TOTAL) {
    cells.replaceChildren(
      ...Array.from({ length: KEROSENE_TOTAL }, (_, i) => {
        const c = document.createElement("div");
        c.className = "cell" + (i < KEROSENE_RESERVE ? " reserve" : "");
        return c;
      }),
    );
  }
  [...cells.children].forEach((c, i) => c.classList.toggle("full", i < game.kerosene));
  $("lever").classList.toggle("locked", canSignal(game) === "reserve_locked");
}

function slosh() {
  const cells = $("cells");
  cells.classList.remove("slosh");
  void cells.offsetWidth;
  cells.classList.add("slosh");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function logQuestionHtml(e: LogEntry) {
  let html = escapeHtml(e.question);
  for (const w of new Set(e.intruded)) html = html.split(escapeHtml(w)).join(`<span class="intruded">${escapeHtml(w)}</span>`);
  return html;
}

function appendLog(html: string, mark: string, cls = "") {
  const li = document.createElement("li");
  li.className = cls;
  li.innerHTML = `<span class="q">${html}</span><span class="a">${mark}</span>`;
  $("log").append(li);
  $("log-panel").scrollTop = $("log-panel").scrollHeight;
  return li;
}

function message(text: string) {
  $("message").textContent = text;
}

function renderDebug() {
  if (!DEBUG) return;
  const d = $("debug");
  d.hidden = false;
  d.textContent = [
    `score ${game.score}  stage ${game.stage}  kerosene ${game.kerosene}  sent ${game.questionsSent}`,
    `last judgment: ${JSON.stringify(lastJudgment)}`,
    `keys: F8 +8 score`,
  ].join("\n");
}

function renderNoteStage() {
  const n = $("note");
  n.classList.remove("stage-1", "stage-2");
  if (game.stage >= 1) n.classList.add(`stage-${Math.min(game.stage, 2)}`);
  note.updateCounter();
}

// ---------- 끼어드는 단어 ----------
function maybeIntrude() {
  if (busy || intrudedThisQuestion || !note.plainText().trim()) return;
  if (!shouldIntrude(game.stage, game.questionsSent)) return;
  const word = pickWord(game.lang);
  if (note.intrude(word, insertionIndex(note.plainText()))) intrudedThisQuestion = true;
}

// ---------- 신호 한 번 ----------
async function signal(force: boolean) {
  if (busy || game.over) return;
  const content = note.content();
  if (!content.judgeText) {
    message(t.empty);
    return;
  }
  const check = canSignal(game);
  if (check === "reserve_locked" && !force) {
    message(t.reserve);
    return;
  }

  busy = true;
  message("");
  note.setEnabled(false);
  game = spendSignal(game, force);
  renderGauge();
  renderDebug();
  slosh();

  if (game.over === "bad_lamp") {
    await scene.sendSignal(toPulses(content.displayText));
    scene.lampOut();
    await sleep(1500);
    return showEnding();
  }

  const judging = askJudge(sessionId, content.judgeText);
  await scene.sendSignal(toPulses(content.displayText));
  const [result] = await Promise.all([judging, sleep(MIN_WAIT_MS[Math.min(game.stage, 4)])]);
  lastJudgment = result.debug ?? null;

  const hale = content.intruded.includes(SHIP_NAME[game.lang]);
  const { state, stageChange } = applyResult(game, content.displayText, content.intruded, result, hale);
  const lie = state.log[state.log.length - 1].lie;
  await scene.answer(result.light, lie);
  game = state;

  const entry = game.log[game.log.length - 1];
  appendLog(logQuestionHtml(entry), LIGHT_MARK[entry.light]);
  if (result.light === "no_reach") slosh();
  renderGauge();
  renderDebug();

  note.clear();
  intrudedThisQuestion = false;

  if (game.over) return showEnding();
  if (stageChange) await stageTransition(stageChange.from, stageChange.to);

  busy = false;
  note.setEnabled(true);
}

// ---------- 오염 단계 전환(docs/05) ----------
async function stageTransition(from: number, to: number) {
  scene.setStage(to);
  renderNoteStage();
  if (from < 1 && to >= 1) await scene.sway();
  if (from < 2 && to >= 2) {
    // 묻지도 않았는데 배가 모스 부호를 보낸다. 완성되면 플레이어의 이름이다
    const letters = [...game.playerName].filter((c) => c.trim());
    const li = appendLog(escapeHtml(t.nameSignal) + " <b class=\"decoded\"></b>", "", "system");
    const target = li.querySelector(".decoded")!;
    await scene.shipMorse(toPulses(game.playerName, 3000, 4500), (i) => {
      target.textContent = letters.slice(0, i + 1).join("");
    });
    target.textContent = letters.join("");
  }
}

// ---------- 엔딩(M1은 자리만) ----------
function showEnding() {
  $("ending-text").textContent = game.over === "bad_lamp" ? t.badLamp : t.badContamination;
  $("ending").hidden = false;
}

// ---------- 레버: 마지막 칸에서는 길게 눌러야 당겨진다 ----------
function setupLever() {
  const lever = $<HTMLButtonElement>("lever");
  const hold = lever.querySelector<HTMLElement>(".hold")!;
  let timer: number | undefined;
  let startedAt = 0;
  const reset = () => {
    window.clearInterval(timer);
    timer = undefined;
    hold.style.width = "0";
  };
  lever.addEventListener("pointerdown", () => {
    if (busy || canSignal(game) !== "reserve_locked") return;
    message(t.reserve);
    startedAt = performance.now();
    timer = window.setInterval(() => {
      const p = (performance.now() - startedAt) / FORCE_HOLD_MS;
      hold.style.width = `${Math.min(100, p * 100)}%`;
      if (p >= 1) {
        reset();
        void signal(true);
      }
    }, 30);
  });
  lever.addEventListener("pointerup", reset);
  lever.addEventListener("pointerleave", reset);
  lever.addEventListener("click", () => {
    if (canSignal(game) === "ok") void signal(false);
  });
}

// ---------- 시작 ----------
async function start() {
  const name = $<HTMLInputElement>("name").value.trim();
  if (!name) {
    $("name").focus();
    return;
  }
  game = newGame(name, lang);
  sessionId = crypto.randomUUID();
  $("start").hidden = true;
  $("log").replaceChildren();
  scene.setStage(0);
  renderGauge();
  renderNoteStage();
  renderDebug();

  // 배의 첫 신호: 세 번 깜빡임과 다른 불규칙한 짧은 모스(docs/05). 대답은 자유다.
  busy = true;
  note.setEnabled(false);
  await sleep(1200);
  message(t.firstSignal);
  await scene.shipMorse([
    { on: true, ms: 220 }, { on: false, ms: 300 }, { on: true, ms: 650 }, { on: false, ms: 260 },
    { on: true, ms: 200 }, { on: false, ms: 520 }, { on: true, ms: 640 }, { on: false, ms: 240 }, { on: true, ms: 220 },
  ]);
  busy = false;
  note.setEnabled(true);
}

async function main() {
  await scene.init($("scene"));
  renderStatic();
  renderGauge();
  setupLever();
  document.querySelectorAll<HTMLButtonElement>("[data-lang]").forEach((b) =>
    b.addEventListener("click", () => {
      lang = b.dataset.lang as Lang;
      renderStatic();
    }),
  );
  $("start-btn").addEventListener("click", () => void start());
  $("name").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) void start();
  });
  $("restart").addEventListener("click", () => location.reload());
  if (DEBUG) {
    window.addEventListener("keydown", async (e) => {
      if (e.key !== "F8" || busy) return;
      const from = game.stage;
      const score = game.score + 8;
      game = { ...game, score, stage: stageFor(score) };
      renderDebug();
      if (game.stage !== from) {
        busy = true;
        await stageTransition(from, game.stage);
        busy = false;
      }
    });
  }
  $("name").focus();
}

void main();
