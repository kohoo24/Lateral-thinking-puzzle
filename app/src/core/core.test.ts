import { describe, expect, test } from "vitest";
import { insertionIndex, shouldIntrude } from "./intrusion";
import { toMorse, toPulses } from "./morse";
import { inputLimit, KEROSENE_TOTAL, stageFor } from "./rules";
import { applyResult, canSignal, newGame, spendSignal, type GameState, type JudgeResult } from "./state";

const r = (over: Partial<JudgeResult> = {}): JudgeResult => ({ light: "yes", contamination: 1, selfRelated: false, rule4: false, ...over });

describe("등유(docs/01)", () => {
  test("신호는 24회까지, 마지막 한 칸에서 레버가 잠긴다", () => {
    let s = newGame("Jin", "en");
    let sent = 0;
    while (canSignal(s) === "ok") {
      s = spendSignal(s);
      sent++;
    }
    expect(sent).toBe(KEROSENE_TOTAL - 1);
    expect(s.kerosene).toBe(1);
    expect(canSignal(s)).toBe("reserve_locked");
    expect(spendSignal(s)).toBe(s); // 억지로 당기지 않으면 아무 일도 없다
  });

  test("잠긴 레버를 억지로 당기면 등불이 꺼져 배드 엔딩", () => {
    const s: GameState = { ...newGame("Jin", "en"), kerosene: 1 };
    const out = spendSignal(s, true);
    expect(out.kerosene).toBe(0);
    expect(out.over).toBe("bad_lamp");
  });

  test("신호가 닿지 않으면 등유를 돌려주고 오염도 없다", () => {
    const s = spendSignal(newGame("Jin", "en"));
    const { state } = applyResult(s, "q", [], r({ light: "no_reach", contamination: 3 }));
    expect(state.kerosene).toBe(KEROSENE_TOTAL);
    expect(state.score).toBe(0);
    expect(state.questionsSent).toBe(0);
  });
});

describe("오염 단계(docs/01)", () => {
  test("단계 기준 0/8/16/26/36", () => {
    expect([0, 7, 8, 15, 16, 25, 26, 35, 36, 50].map(stageFor)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  test("주변 질문만 20회 하면 2단계", () => {
    let s = newGame("Jin", "en");
    for (let i = 0; i < 20; i++) s = applyResult(s, "q", [], r()).state;
    expect(s.score).toBe(20);
    expect(s.stage).toBe(2);
  });

  test("단계가 바뀌는 순간을 알려준다", () => {
    const s = { ...newGame("Jin", "en"), score: 6 };
    const { stageChange } = applyResult(s, "q", [], r({ contamination: 3, selfRelated: true }));
    expect(stageChange).toEqual({ from: 0, to: 1 });
  });

  test("44점에 도달하면 배드 엔딩", () => {
    const s = { ...newGame("Jin", "en"), score: 41, stage: 4 };
    expect(applyResult(s, "q", [], r({ contamination: 3 })).state.over).toBe("bad_contamination");
  });

  test("끼어든 배의 이름을 지우지 않고 보내면 +5, 판정이 이미 위반을 잡았으면 중복하지 않는다", () => {
    const s = newGame("Jin", "en");
    expect(applyResult(s, "q", ["Thomas Hale"], r(), true).state.score).toBe(6);
    expect(applyResult(s, "q", ["Thomas Hale"], r({ contamination: 8, rule4: true }), true).state.score).toBe(8);
  });

  test("입력 분량은 단계별 비율로 줄어든다", () => {
    expect([0, 1, 2, 3].map((st) => inputLimit(st, "en"))).toEqual([120, 90, 60, 30]);
    expect(inputLimit(2, "ko")).toBe(30);
  });
});

describe("끼어드는 단어(docs/05)", () => {
  test("0·1단계는 끼어들지 않고, 2단계는 세 번에 한 번, 3단계부터 매번", () => {
    expect([0, 1, 2].map((i) => shouldIntrude(1, i))).toEqual([false, false, false]);
    expect([0, 1, 2, 3, 4, 5].map((i) => shouldIntrude(2, i))).toEqual([false, false, true, false, false, true]);
    expect(shouldIntrude(3, 0)).toBe(true);
  });

  test("가운데와 가장 가까운 띄어쓰기에 끼워 넣는다", () => {
    expect(insertionIndex("is rule two fake")).toBe(7);
    expect(insertionIndex("살아있어")).toBe(4);
  });
});

describe("모스 부호", () => {
  test("라틴 문자는 국제 모스 부호", () => {
    expect(toMorse("SOS now")).toBe("... --- ... / -. --- .--");
  });

  test("신호 길이는 2~3초로 압축된다", () => {
    for (const text of ["hi", "Was the lighthouse dark on the night the ship sank?", "2번 수칙은 가짜야?"]) {
      const total = toPulses(text).reduce((a, p) => a + p.ms, 0);
      expect(total).toBeGreaterThanOrEqual(1999);
      expect(total).toBeLessThanOrEqual(3001);
    }
  });
});
