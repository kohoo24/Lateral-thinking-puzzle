// M2: 전체 흐름. 등실의 신호와 대답(M1)에 공간 이동, 단서 문서, 폭풍 시계, 수칙 이벤트,
// 서약서, 최종 제출, 엔딩 4종을 더한다. 아트는 임시다.
import "./style.css";
import { artUrl, PAPER, preloadArt, TITLE_ART } from "./content/art";
import { HALE_LINES, OATH_FORM, type DocId } from "./content/texts";
import { dawnProgress, gameClock, nextThreeFlashAt, shouldStartRule6, StormClock, TIMELINE, weatherPhase } from "./core/clock";
import { endingFor, type Ending } from "./core/endings";
import { erasableRanges } from "./core/erasure";
import { insertionIndex, pickWord, shouldIntrude, SHIP_NAME } from "./core/intrusion";
import { toPulses } from "./core/morse";
import { INPUT_RATIO, inputLimit, KEROSENE_RESERVE, KEROSENE_TOTAL, stageFor, type Lang } from "./core/rules";
import {
  alterEarlyQuestion,
  applyResult,
  canSignal,
  canUseOath,
  firstQuestions,
  newGame,
  openDoor,
  openStoreroom,
  recoverWithOath,
  spendSignal,
  type Applied,
  type GameState,
  type LogEntry,
} from "./core/state";
import { LIGHT_MARK, RULE_CARD, strings, type Strings, INTRO } from "./i18n";
import { askJudge, askOath, askSubmission } from "./judge-client";
import { NoteInput } from "./note";
import { LampRoomScene } from "./scene";
import { DocViewer } from "./ui/docs";
import { $, choose, el, escapeHtml, sleep } from "./ui/dom";
import { playEnding } from "./ui/endings";
import { Rooms, type Hotspot, type RoomId } from "./ui/rooms";

const params = new URLSearchParams(location.search);
const DEBUG = params.has("debug");
const FORCE_HOLD_MS = 2000;
const MIN_WAIT_MS = [1500, 1500, 3000, 3500, 4000]; // 기다림: 최소 1.5초, 2단계부터 뜸이 길어진다
const RECORD_BASE: Record<Lang, number> = { en: 300, ko: 150 }; // 최종 제출 입력 분량(단계 비율 적용 전)
const THREE_FLASH_MS = 2300; // 세 번 깜빡임 자체의 길이

const scene = new LampRoomScene();
const clock = new StormClock(Number(params.get("speed") ?? 1));
let lang: Lang = "en";
let t: Strings = strings(lang);
let game: GameState = newGame("", lang);
let sessionId = crypto.randomUUID();
let started = false;
let busy = false;
let intrudedThisQuestion = false;
let lastJudgment: unknown = null;
const systemNotes: { after: number; html: string }[] = [];
const found = new Set<DocId>();

// 시계 이벤트 상태
let lastThreeFlash: number | null = null;
let nextThreeFlash = nextThreeFlashAt(null, false);
let threeFlashWindowUntil = -1;
let rule6Done = false;
let rule6Until = -1;
let finalWarningShown = false;
let nextLightning: number = TIMELINE.lightningFrom;
let shipShown = false;
let record: "none" | "self" | "forced" | "submitting" | "done" = "none";
let pausedBy: string | null = null;

const note = new NoteInput($<HTMLDivElement>("note"), $("counter"), {
  limit: () => inputLimit(game.stage, game.lang),
  showCounter: () => game.stage >= 1,
  onSubmit: () => void signal(false),
  onIdle: maybeIntrude,
  erase: (text) => (game.stage >= 3 ? erasableRanges(text, game.lang, game.playerName) : []),
});

const docs = new DocViewer(
  () => ({ lang: game.lang, stage: game.stage, playerName: game.playerName }),
  () => t,
  () => [...found],
);

const rooms = new Rooms(() => t, {
  canEnter: enterRoom,
  onEnter: (room) => {
    if (room === "entrance") found.add("register");
    setInputEnabled();
  },
  onHotspot: (h) => void onHotspot(h),
  hotspotVisible: (h) => (h === "frontDoor" ? rule6Active() : h === "record" ? record === "none" : true),
});

// ---------- 화면 갱신 ----------
function renderStatic() {
  t = strings(lang);
  $("card").innerHTML = RULE_CARD.en.map((l, i) => `<div>${l}</div><div class="ko">${lang === "ko" ? RULE_CARD.ko[i] : ""}</div>`).join("");
  $("gauge-label").textContent = t.kerosene;
  $("gauge-note").textContent = t.keroseneNote;
  $("log-title").textContent = t.log;
  $("lever-label").textContent = t.lever;
  $("note").dataset.placeholder = t.placeholder;
  $("start-sub").textContent = t.subtitle;
  $("register-label").textContent = t.register;
  $<HTMLInputElement>("name").placeholder = t.namePlaceholder;
  $("start-btn").textContent = t.start;
  $("help-btn").textContent = t.help;
  $("help-btn").setAttribute("aria-label", t.helpLabel);
  document.documentElement.lang = lang;
  document.querySelectorAll<HTMLButtonElement>("[data-lang]").forEach((b) => b.classList.toggle("on", b.dataset.lang === lang));
  rooms.render();
}

function renderGauge() {
  const cells = $("cells");
  if (cells.children.length !== KEROSENE_TOTAL) {
    cells.replaceChildren(
      ...Array.from({ length: KEROSENE_TOTAL }, (_, i) => el("div", "cell" + (i < KEROSENE_RESERVE ? " reserve" : ""))),
    );
  }
  [...cells.children].forEach((c, i) => c.classList.toggle("full", i < game.kerosene));
  $("gauge-count").textContent = `${game.kerosene} / ${KEROSENE_TOTAL}`;
  $("gauge").setAttribute("aria-label", `${t.kerosene} ${game.kerosene} / ${KEROSENE_TOTAL}. ${t.keroseneNote}`);
  $("lever").classList.toggle("locked", canSignal(game) === "reserve_locked");
}

function slosh() {
  const cells = $("cells");
  cells.classList.remove("slosh");
  void cells.offsetWidth;
  cells.classList.add("slosh");
}

function logQuestionHtml(e: LogEntry) {
  let html = escapeHtml(e.question);
  for (const w of new Set(e.intruded)) html = html.split(escapeHtml(w)).join(`<span class="intruded">${escapeHtml(w)}</span>`);
  return html;
}

function renderLog() {
  const items: HTMLElement[] = [];
  const notesAt = (i: number) =>
    systemNotes.filter((n) => n.after === i).forEach((n) => items.push(el("li", "system", `<span class="q">${n.html}</span>`)));
  notesAt(0);
  game.log.forEach((e, i) => {
    items.push(el("li", e.altered ? "altered" : "", `<span class="q">${logQuestionHtml(e)}</span><span class="a">${LIGHT_MARK[e.light]}</span>`));
    notesAt(i + 1);
  });
  $("log").replaceChildren(...items);
  $("log-panel").scrollTop = $("log-panel").scrollHeight;
}

function message(text: string) {
  $("message").textContent = text;
}

function renderDebug() {
  if (!DEBUG) return;
  const d = $("debug");
  d.hidden = false;
  d.textContent = [
    `time ${(clock.elapsed / 60000).toFixed(1)}m (${gameClock(clock.elapsed)})  next 3-flash ${(nextThreeFlash / 60000).toFixed(1)}m`,
    `score ${game.score}  stage ${game.stage}  kerosene ${game.kerosene}  sent ${game.questionsSent}  rules ${game.rulesBroken.join(",")}`,
    `last judgment: ${JSON.stringify(lastJudgment)}`,
    `keys: F8 +8 score, F9 +5 min`,
  ].join("\n");
}

function renderNoteStage() {
  const n = $("note");
  n.classList.remove("stage-1", "stage-2", "stage-3", "stage-4");
  if (game.stage >= 1) n.classList.add(`stage-${Math.min(game.stage, 4)}`);
  note.updateCounter();
}

function signalsAllowed() {
  return started && record === "none" && clock.elapsed < TIMELINE.stormArrives && !game.over;
}

function setInputEnabled() {
  note.setEnabled(!busy && signalsAllowed() && rooms.current === "lamp" && !pausedBy);
  $<HTMLButtonElement>("lever").disabled = busy || !signalsAllowed();
}

// ---------- 끼어드는 단어 ----------
function maybeIntrude() {
  if (busy || intrudedThisQuestion || !note.plainText().trim()) return;
  if (!shouldIntrude(game.stage, game.questionsSent)) return;
  if (note.intrude(pickWord(game.lang), insertionIndex(note.plainText()))) intrudedThisQuestion = true;
}

// ---------- 신호 한 번 ----------
async function signal(force: boolean) {
  if (busy || !signalsAllowed()) return;
  if (rooms.current !== "lamp") return message(t.onlyLampRoom);
  const content = note.content();
  if (!content.judgeText) return message(t.empty);
  if (canSignal(game) === "reserve_locked" && !force) return message(t.reserve);

  busy = true;
  message("");
  setInputEnabled();
  // 세 번 깜빡임 뒤 배의 불빛이 남아 있는 동안 보낸 신호는 그 부름에 대한 대답이다(수칙 3)
  const answeredThreeFlashes = clock.elapsed <= threeFlashWindowUntil;
  game = spendSignal(game, force);
  renderGauge();
  renderDebug();
  slosh();

  if (game.over === "bad_lamp") {
    await scene.sendSignal(toPulses(content.displayText));
    scene.lampOut();
    await sleep(2000);
    return finish("bad", 0);
  }

  const judging = askJudge(sessionId, content.judgeText);
  await scene.sendSignal(toPulses(content.displayText));
  const [result] = await Promise.all([judging, sleep(MIN_WAIT_MS[Math.min(game.stage, 4)])]);
  lastJudgment = result.debug ?? null;

  const reached = result.light !== "no_reach";
  const applied = applyResult(game, content.displayText, content.intruded, result, {
    shipNameKept: content.intruded.includes(SHIP_NAME[game.lang]),
    answeredThreeFlashes: answeredThreeFlashes && reached,
  });
  await scene.answer(result.light, applied.state.log[applied.state.log.length - 1].lie);
  if (answeredThreeFlashes && reached) {
    threeFlashWindowUntil = -1;
    await scene.longGlow();
  }
  if (!reached) slosh();
  note.clear();
  intrudedThisQuestion = false;
  await afterApplied(applied);
  busy = false;
  setInputEnabled();
}

async function afterApplied({ state, stageChange }: Applied) {
  game = state;
  renderLog();
  renderGauge();
  renderDebug();
  if (game.over) return finish("bad", 0);
  if (stageChange) await stageTransition(stageChange.from, stageChange.to);
}

// ---------- 오염 단계 전환(docs/05) ----------
async function stageTransition(from: number, to: number) {
  scene.setStage(to);
  renderNoteStage();
  if (to < from) return; // 서약으로 회복할 때는 역순 연출을 쓰지 않는다
  if (from < 1 && to >= 1) await scene.sway();
  if (from < 2 && to >= 2) {
    // 묻지도 않았는데 배가 모스 부호를 보낸다. 완성되면 플레이어의 이름이다
    const letters = [...game.playerName].filter((c) => c.trim());
    const n = { after: game.log.length, html: `${escapeHtml(t.nameSignal)} <b class="decoded"></b>` };
    systemNotes.push(n);
    renderLog();
    await scene.shipMorse(toPulses(game.playerName, 3000, 4500), (i) => {
      n.html = `${escapeHtml(t.nameSignal)} <b class="decoded">${escapeHtml(letters.slice(0, i + 1).join(""))}</b>`;
      renderLog();
    });
  }
  if (from < 3 && to >= 3) {
    // 교신 기록의 초반 질문 하나가 플레이어가 쓰지 않은 문장으로 바뀌어 있다
    game = alterEarlyQuestion(game);
    renderLog();
  }
}

// ---------- 공간과 단서 ----------
async function enterRoom(room: RoomId): Promise<boolean> {
  if (busy || record === "submitting" || record === "done") return false;
  if (room !== "storeroom" || game.storeroomOpened) return true;
  if ((await choose(t.door13Rule, [t.openIt, t.leaveIt])) !== 0) return false;
  game = openStoreroom(game);
  if (lastThreeFlash != null) nextThreeFlash = Math.max(clock.elapsed + 30_000, nextThreeFlashAt(lastThreeFlash, true));
  found.add("letter");
  found.add("oaths");
  renderGauge();
  slosh();
  message(t.storeroomOpened);
  return true;
}

async function onHotspot(h: Hotspot) {
  message("");
  switch (h) {
    case "journal":
    case "journalBack":
      found.add("rules");
      found.add("memo");
      return docs.show(h === "journal" ? "rules" : "memo");
    case "frame":
      found.add("newspaper");
      message(t.frameFound);
      return docs.show("newspaper");
    case "clock":
      return message(t.clockReads.replace("{time}", gameClock(clock.elapsed)));
    case "record":
      if ((await choose(t.recordConfirm, [t.write, t.notYet])) === 0) startRecord("self");
      return;
    case "door13":
      return rooms.go("storeroom");
    case "oathBox":
      return docs.show("oaths");
    case "letter":
      return docs.show("letter");
    case "blankOath":
      return writeOath();
    case "register":
      found.add("register");
      return docs.show("register");
    case "frontDoor": {
      if ((await choose(t.door6Rule, [t.openIt, t.leaveIt])) !== 0) return;
      rule6Until = -1;
      message(t.doorOpened);
      document.body.classList.add("footsteps");
      await afterApplied(openDoor(game));
      rooms.render();
      return;
    }
  }
}

// ---------- 서약서(docs/01, 04) ----------
function writeOath() {
  const check = canUseOath(game);
  if (check !== "ok") return message(check === "used" ? t.oathUsed : check === "too_late" ? t.oathTooLate : t.oathNothing);
  const back = el("div", "modal");
  const box = el("div", "modal-box oath-box");
  box.append(el("h3", "print", "OATH OF THE KEEPER"), el("p", "print small", escapeHtml(OATH_FORM[game.lang])), el("p", "", escapeHtml(t.oathPrompt)));
  const input = el("textarea", "oath-input");
  input.maxLength = 160;
  const row = el("div", "modal-buttons");
  const signBtn = el("button", "primary", t.sign);
  const cancel = el("button", "", t.close);
  row.append(signBtn, cancel);
  box.append(input, row);
  back.append(box);
  document.body.append(back);
  input.focus();
  cancel.addEventListener("click", () => back.remove());
  signBtn.addEventListener("click", async () => {
    if (!input.value.trim()) return;
    signBtn.disabled = true;
    const valid = await askOath(sessionId, input.value.trim(), game.playerName);
    back.remove();
    if (valid === null) return message(t.judgeUnavailable);
    if (!valid) return message(t.oathInvalid); // 무효면 서약서는 쓰이지 않고 남는다
    message(t.oathValid);
    void scene.warmPulse();
    await afterApplied(recoverWithOath(game));
  });
}

// ---------- 시계와 이벤트 ----------
function rule6Active() {
  return clock.elapsed < rule6Until && !game.doorOpened;
}

let lastTick = performance.now();
function tick() {
  const now = performance.now();
  const dt = now - lastTick;
  lastTick = now;
  if (!started || record === "done") return;
  clock.tick(dt);
  const ms = clock.elapsed;
  renderHint();
  scene.setWeather(weatherPhase(ms));
  scene.setDawn(dawnProgress(ms));
  renderDebug();

  // 30분 이후 번개. 첫 번개에서 딱 한 번 배의 실루엣이 드러난다
  if (ms >= nextLightning) {
    nextLightning = ms + (20_000 + Math.random() * 25_000);
    void scene.lightning(!shipShown);
    shipShown = true;
  }

  if (record === "none") {
    // 수칙 3: 세 번 깜빡임. 신호를 주고받는 중이면 끝난 뒤로 미룬다
    if (ms >= nextThreeFlash && !busy && ms < TIMELINE.stormArrives) {
      lastThreeFlash = ms;
      nextThreeFlash = nextThreeFlashAt(ms, game.storeroomOpened);
      threeFlashWindowUntil = ms + THREE_FLASH_MS * clock.speed + TIMELINE.threeFlashWindow;
      void scene.threeFlashes(TIMELINE.threeFlashWindow / clock.speed);
    }
    // 수칙 6: 문밖의 전임자
    if (shouldStartRule6(ms, game.stage, rule6Done)) {
      rule6Done = true;
      rule6Until = ms + TIMELINE.rule6Duration;
      void haleAtTheDoor();
    }
    if (ms >= TIMELINE.finalWarning && !finalWarningShown) {
      finalWarningShown = true;
      message(t.finalWarning);
      void scene.bigSway();
    }
    if (ms >= TIMELINE.stormArrives && !busy) {
      message(t.stormArrived);
      startRecord("forced");
    }
  }
  if ((record === "self" || record === "forced") && ms >= TIMELINE.hardLimit) void submitRecord();
}

async function haleAtTheDoor() {
  rooms.render();
  message(t.knock);
  const lines = HALE_LINES.filter((l) => game.stage >= l.minStage);
  const gap = TIMELINE.rule6Duration / clock.speed / (lines.length + 1);
  for (const l of lines) {
    await sleep(gap);
    if (!rule6Active()) return rooms.render();
    message(`“${game.lang === "ko" ? l.ko : l.en}”`);
  }
  await sleep(gap);
  rooms.render();
}

// ---------- 최종 제출(docs/06) ----------
let recordNote: NoteInput | null = null;

const DOC_BUTTON: Record<DocId, keyof Strings> = {
  rules: "hs_journal",
  memo: "hs_journalBack",
  newspaper: "hs_frame",
  register: "hs_register",
  letter: "hs_letter",
  oaths: "hs_oathBox",
};

function startRecord(mode: "self" | "forced") {
  if (record !== "none") return;
  record = mode;
  setInputEnabled();
  if (rooms.current !== "lamp") void rooms.go("lamp");
  $("record").hidden = false;
  $("record-title").textContent = t.recordTitle;
  $("record-submit").textContent = t.closeLog;
  // 단서는 제출 중에도 펼쳐볼 수 있다
  $("record-docs").replaceChildren(
    ...[...found].map((id) => {
      const b = el("button", "", t[DOC_BUTTON[id]]);
      b.type = "button";
      b.addEventListener("click", () => docs.show(id));
      return b;
    }),
  );
  recordNote = new NoteInput($<HTMLDivElement>("record-note"), $("record-counter"), {
    limit: () => Math.max(12, Math.round(RECORD_BASE[game.lang] * INPUT_RATIO[Math.min(game.stage, 4)])),
    showCounter: () => true,
    onSubmit: () => {},
    erase: (text) => (game.stage >= 3 ? erasableRanges(text, game.lang, game.playerName) : []),
  });
  recordNote.setEnabled(true);
}

async function submitRecord() {
  if (record !== "self" && record !== "forced") return;
  record = "submitting";
  const text = recordNote?.content().judgeText ?? "";
  recordNote?.setEnabled(false);
  $<HTMLButtonElement>("record-submit").disabled = true;
  message(t.judging);
  const count = text ? await askSubmission(sessionId, text) : 0;
  message(count === null ? t.judgeUnavailable : "");
  const cores = count ?? 0;
  if (cores === 0) {
    // 진실을 하나도 적지 못하면 그 밤의 기록이 배에게 한 대답이 된다(docs/02)
    $("record-note").textContent = Array.from({ length: 12 }, () => "answer").join(" ");
    $("record").classList.add("answer-ink");
    await sleep(2500);
    scene.lampOut();
    await sleep(1500);
  }
  $("record").hidden = true;
  await finish(endingFor(cores, game.questionsSent), cores);
}

async function finish(ending: Ending, cores: number) {
  if (record === "done") return;
  record = "done";
  busy = true;
  setInputEnabled();
  docs.close();
  await playEnding(
    {
      ending,
      lang: game.lang,
      playerName: game.playerName,
      cores,
      signals: game.questionsSent,
      stage: game.stage,
      oathUsed: game.oathUsed,
      storeroomOpened: game.storeroomOpened,
      playMs: clock.elapsed,
      badQuestions: firstQuestions(game),
    },
    t,
  );
}

// ---------- 일시정지: ESC, 창 전환, 창 최소화 ----------
function pause(reason: string) {
  if (!started || record === "done" || pausedBy) return;
  pausedBy = reason;
  clock.paused = true;
  $("pause").hidden = false;
  $("pause-title").textContent = t.paused;
  $("pause-resume").textContent = t.resume;
  setInputEnabled();
}

function resume() {
  pausedBy = null;
  clock.paused = false;
  $("pause").hidden = true;
  $("intro").hidden = true;
  lastTick = performance.now();
  setInputEnabled();
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
    if (busy || canSignal(game) !== "reserve_locked" || !signalsAllowed()) return;
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
// ---------- 지금 할 일(화면 위쪽 한 줄) ----------
// 일지를 읽기 전에는 당직실로 이끌고, 읽은 뒤에는 잠시 다음 할 일을 알려준 뒤 사라진다.
// 배에게 대답해야 하는지는 알려주지 않는다(진상).
const HINT_NEXT_MS = 90_000;
let hintNextSince: number | null = null;

function renderHint() {
  let text = "";
  if (started && record === "none" && !game.over) {
    if (!found.has("rules")) text = t.hintLog;
    else {
      hintNextSince ??= clock.elapsed;
      if (game.log.length === 0 && clock.elapsed - hintNextSince < HINT_NEXT_MS) text = t.hintNext;
    }
  }
  const hint = $("hint");
  if (hint.textContent !== text) hint.textContent = text;
  hint.hidden = !text;
}

// ---------- 도입: 이야기 → 오늘 밤 할 일 → 등실 ----------
let introAction: () => void = () => {};

function renderIntro(page: "story" | "how", button: string, action: () => void) {
  const intro = INTRO[lang];
  const box = $("intro-page");
  if (page === "story") {
    box.replaceChildren(...intro.story.map((line) => el("p", "", line)));
  } else {
    const dl = document.createElement("dl");
    for (const [label, text] of intro.how) dl.append(el("dt", "", label), el("dd", "", text));
    box.replaceChildren(el("h2", "", t.howTitle), dl);
  }
  $("intro-next").textContent = button;
  introAction = action;
  $("intro").hidden = false;
  $("intro-next").focus();
}

function start() {
  const name = $<HTMLInputElement>("name").value.trim();
  if (!name) return $("name").focus();
  $("start").hidden = true;
  renderIntro("story", t.next, () => renderIntro("how", t.climb, () => void begin(name)));
}

// 당직 중 도움말: 폭풍 시계를 멈추고 "오늘 밤 할 일"을 다시 보여준다
function showHelp() {
  if (!started || record === "done" || pausedBy) return;
  pausedBy = "help";
  clock.paused = true;
  setInputEnabled();
  renderIntro("how", t.helpBack, resume);
}

async function begin(name: string) {
  $("intro").hidden = true;
  $("help-btn").hidden = false;
  rooms.preload();
  preloadArt(Object.values(PAPER));
  game = newGame(name, lang);
  sessionId = crypto.randomUUID();
  started = true;
  lastTick = performance.now();
  renderLog();
  renderGauge();
  renderNoteStage();
  rooms.render();
  renderHint();

  // 배의 첫 신호: 세 번 깜빡임과 다른 불규칙한 짧은 모스(docs/05). 대답은 자유다.
  busy = true;
  setInputEnabled();
  await sleep(1200);
  message(t.firstSignal);
  await scene.shipMorse([
    { on: true, ms: 220 }, { on: false, ms: 300 }, { on: true, ms: 650 }, { on: false, ms: 260 },
    { on: true, ms: 200 }, { on: false, ms: 520 }, { on: true, ms: 640 }, { on: false, ms: 240 }, { on: true, ms: 220 },
  ]);
  busy = false;
  setInputEnabled();
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
  $("start-btn").addEventListener("click", start);
  $("intro-next").addEventListener("click", () => introAction());
  $("help-btn").addEventListener("click", showHelp);
  $("name").addEventListener("keydown", (e) => {
    // 도입 버튼으로 초점이 옮겨진 뒤 같은 Enter가 그 버튼을 누르지 않도록 막는다
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      start();
    }
  });
  $("record-submit").addEventListener("click", () => void submitRecord());
  $("pause-resume").addEventListener("click", resume);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !docs.isOpen && !document.querySelector(".modal")) {
      if (pausedBy) resume();
      else pause("esc");
    }
  });
  window.addEventListener("blur", () => pause("blur"));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause("hidden");
  });
  window.setInterval(tick, 200);

  if (DEBUG) {
    window.addEventListener("keydown", async (e) => {
      if (busy) return;
      if (e.key === "F8") {
        const from = game.stage;
        const score = game.score + 8;
        game = { ...game, score, stage: stageFor(score) };
        renderDebug();
        if (game.stage !== from) {
          busy = true;
          await stageTransition(from, game.stage);
          busy = false;
          setInputEnabled();
        }
      }
      if (e.key === "F9") clock.elapsed += 5 * 60_000;
    });
  }
  void artUrl(TITLE_ART).then((url) => {
    if (url) $("start").style.backgroundImage = `linear-gradient(rgba(2,3,5,.3), rgba(2,3,5,.75)), url("${url}")`;
  });
  $("name").focus();
}

void main();
