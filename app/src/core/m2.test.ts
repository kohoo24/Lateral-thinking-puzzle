import { describe, expect, test } from "vitest";
import { dawnProgress, gameClock, nextThreeFlashAt, shouldStartRule6, TIMELINE, weatherPhase } from "./clock";
import { endingFor } from "./endings";
import { erasableRanges } from "./erasure";
import {
  alterEarlyQuestion,
  applyResult,
  canUseOath,
  firstQuestions,
  newGame,
  openDoor,
  openStoreroom,
  recoverWithOath,
  type GameState,
  type JudgeResult,
} from "./state";

const r = (over: Partial<JudgeResult> = {}): JudgeResult => ({ light: "yes", contamination: 1, selfRelated: false, rule4: false, ...over });
const MIN = 60_000;

describe("폭풍 시계(docs/05)", () => {
  test("게임 속 시각 23:30 → 05:40", () => {
    expect(gameClock(0)).toBe("23:30");
    expect(gameClock(10 * MIN)).toBe("01:02");
    expect(gameClock(40 * MIN)).toBe("05:40");
  });
  test("날씨 단계와 새벽빛", () => {
    expect([0, 12, 25, 33, 38].map((m) => weatherPhase(m * MIN))).toEqual([0, 1, 2, 3, 4]);
    expect(dawnProgress(36 * MIN)).toBe(0);
    expect(dawnProgress(38.5 * MIN)).toBeCloseTo(0.5);
    expect(dawnProgress(41 * MIN)).toBe(1);
  });
  test("세 번 깜빡임: 8분, 이후 6분마다, 창고를 연 뒤에는 3분마다", () => {
    expect(nextThreeFlashAt(null, false)).toBe(8 * MIN);
    expect(nextThreeFlashAt(8 * MIN, false)).toBe(14 * MIN);
    expect(nextThreeFlashAt(14 * MIN, true)).toBe(17 * MIN);
  });
  test("전임자의 목소리는 25분 또는 오염 3단계 중 먼저, 한 번", () => {
    expect(shouldStartRule6(24 * MIN, 2, false)).toBe(false);
    expect(shouldStartRule6(TIMELINE.rule6At, 0, false)).toBe(true);
    expect(shouldStartRule6(10 * MIN, 3, false)).toBe(true);
    expect(shouldStartRule6(30 * MIN, 3, true)).toBe(false);
  });
});

describe("수칙 위반", () => {
  test("세 번 깜빡임에 대답하면 종류 점수에 +5", () => {
    const { state } = applyResult(newGame("Jin", "en"), "q", [], r({ contamination: 3, selfRelated: true }), { answeredThreeFlashes: true });
    expect(state.score).toBe(8);
    expect(state.rulesBroken).toContain(3);
  });
  test("창고 문: 등유 2, 마지막 칸 아래로는 내리지 않음, 한 번만", () => {
    const s = openStoreroom(newGame("Jin", "en"));
    expect(s.kerosene).toBe(23);
    expect(s.rulesBroken).toEqual([5]);
    expect(openStoreroom(s)).toBe(s);
    expect(openStoreroom({ ...newGame("Jin", "en"), kerosene: 2 }).kerosene).toBe(1);
  });
  test("전임자에게 문을 열면 +8", () => {
    const { state, stageChange } = openDoor(newGame("Jin", "en"));
    expect(state.score).toBe(8);
    expect(stageChange).toEqual({ from: 0, to: 1 });
  });
});

describe("서약서(docs/01)", () => {
  const at = (score: number, stage: number): GameState => ({ ...newGame("Jin", "en"), score, stage });
  test("0단계는 되찾을 것이 없고, 3단계부터는 너무 늦다", () => {
    expect(canUseOath(at(3, 0))).toBe("nothing_to_recover");
    expect(canUseOath(at(26, 3))).toBe("too_late");
    expect(canUseOath(at(10, 1))).toBe("ok");
  });
  test("한 단계 되돌리고 이전 단계의 시작 점수로", () => {
    const { state } = recoverWithOath(at(20, 2));
    expect(state.score).toBe(8);
    expect(state.stage).toBe(1);
    expect(canUseOath(state)).toBe("used");
    expect(recoverWithOath(at(10, 1)).state.score).toBe(0);
  });
});

describe("지워지는 단어(docs/05)", () => {
  const erased = (text: string, lang: "en" | "ko", name = "Jin") =>
    erasableRanges(text, lang, name).map(([a, b]) => text.slice(a, b));
  test("영어: I, me, my, home과 이름", () => {
    expect(erased("Will I survive if my lamp stays lit, Jin?", "en")).toEqual(["I", "my", "Jin"]);
    expect(erased("Is it mine or yours", "en")).toEqual(["mine"]);
  });
  test("한국어: 목록과 정확히 일치하는 어절만, 나무·내일·제발·저 배는 그대로", () => {
    expect(erased("나는 나무 아래 내일 집에 가", "ko")).toEqual(["나는"]);
    expect(erased("제발 저 배 좀 봐 내가 할게", "ko")).toEqual(["내가"]);
    expect(erased("진은 여기 있어", "ko", "진")).toEqual(["진은"]);
    expect(erased("진짜야?", "ko", "진")).toEqual([]);
  });
});

describe("엔딩(docs/06)", () => {
  test("핵심 개수와 신호 수", () => {
    expect(endingFor(3, 0)).toBe("hidden");
    expect(endingFor(3, 5)).toBe("true");
    expect(endingFor(2, 5)).toBe("partial");
    expect(endingFor(0, 0)).toBe("bad");
  });
  test("2→3 전환은 초반 질문 하나를 바꾸고, 배드 엔딩은 기록에 남은 처음 세 질문을 쓴다", () => {
    let s = newGame("Jin", "en");
    s = applyResult(s, "Is rule 2 fake?", [], r()).state;
    s = applyResult(s, "Did Crane answer tonight?", ["answer"], r()).state;
    s = alterEarlyQuestion(s);
    expect(s.log[0].question).toBe("Should I come aboard?");
    expect(firstQuestions(s)).toEqual(["Should I come aboard?", "Did Crane tonight?", "Is anyone out there?"]);
  });
});
