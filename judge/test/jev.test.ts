import assert from "node:assert/strict";
import { test } from "node:test";
import { JevJudge, THRESHOLDS } from "../src/jev-judge.js";
import { decideLight } from "../src/light.js";

type Captured = { url: string; headers: Record<string, string>; body: any };

function fakeJev(answers: Record<string, unknown>) {
  const calls: Captured[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ model: "jev-test", answers, usage: { input_tokens: 1200, output_tokens: 0 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, judge: new JevJudge({ apiKey: "test-key", fetch, maxRetries: 0 }) };
}

const choiceAns = (choice: string, probabilities: Record<string, number>) => ({ type: "choice", choice, confidence: probabilities[choice], probabilities });

test("질문 판정: System One 요청 형식과 확률 → 판정 변환", async () => {
  const { calls, judge } = fakeJev({
    question_type: choiceAns("yes_no", { yes_no: 0.97, open: 0.02, lie_condition: 0.01 }),
    subject: choiceAns("ship", { ship: 0.9, person: 0.04, player: 0.02, past_event: 0.02, other: 0.02 }),
    self_related: { type: "noul", noul: 0.93 },
    proposition_truth: choiceAns("true", { true: 0.88, false: 0.1, not_in_facts: 0.02 }),
    rule4_violation: { type: "noul", noul: 0.12 },
  });
  const { result, model, usage } = await judge.question("너 매년 돌아와?");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.typesafe.ai/v1/systemone");
  assert.equal(calls[0].headers.Authorization, "Bearer test-key");
  assert.equal(calls[0].body.model, "jev-latest");
  assert.equal(calls[0].body.state.player_question, "너 매년 돌아와?");
  assert.equal(calls[0].body.state.facts.length, 50);
  assert.deepEqual(
    Object.fromEntries(Object.entries(calls[0].body.questions).map(([k, q]: [string, any]) => [k, q.type])),
    { question_type: "choice", subject: "choice", self_related: "noul", proposition_truth: "choice", rule4_violation: "noul" },
  );

  assert.equal(model, "jev-test");
  assert.equal(usage.input, 1200);
  assert.equal(result.self_related, true);
  assert.equal(result.rule4_violation, false);
  assert.equal(result.confidence, "high");
  assert.equal(decideLight(result), "no"); // 진실 예 → 배 자신 관련이라 반전
});

test("수칙 4 위반은 더 높은 확률에서만 인정한다", async () => {
  const base = {
    question_type: choiceAns("yes_no", { yes_no: 0.9, open: 0.05, lie_condition: 0.05 }),
    subject: choiceAns("ship", { ship: 0.9, person: 0.1, player: 0, past_event: 0, other: 0 }),
    self_related: { type: "noul", noul: 0.9 },
    proposition_truth: choiceAns("true", { true: 0.9, false: 0.05, not_in_facts: 0.05 }),
  };
  const below = fakeJev({ ...base, rule4_violation: { type: "noul", noul: THRESHOLDS.rule4 - 0.01 } });
  assert.equal((await below.judge.question("x")).result.rule4_violation, false);
  const above = fakeJev({ ...base, rule4_violation: { type: "noul", noul: THRESHOLDS.rule4 } });
  assert.equal((await above.judge.question("x")).result.rule4_violation, true);
});

test("명제 확률이 낮으면 신호가 닿지 않음", async () => {
  const { judge } = fakeJev({
    question_type: choiceAns("yes_no", { yes_no: 0.9, open: 0.05, lie_condition: 0.05 }),
    subject: choiceAns("past_event", { ship: 0.1, person: 0.1, player: 0.1, past_event: 0.6, other: 0.1 }),
    self_related: { type: "noul", noul: 0.1 },
    proposition_truth: choiceAns("true", { true: 0.4, false: 0.35, not_in_facts: 0.25 }),
    rule4_violation: { type: "noul", noul: 0.01 },
  });
  const { result } = await judge.question("애매한 질문");
  assert.equal(result.confidence, "low");
  assert.equal(decideLight(result), "no_reach");
});

test("서약과 제출 판정", async () => {
  const oath = fakeJev({ has_own_name: { type: "noul", noul: 0.95 }, has_oath_intent: { type: "noul", noul: 0.9 }, names_someone_else: { type: "noul", noul: 0.02 } });
  assert.equal((await oath.judge.oath("나 진은 이 등대의 등대지기다.", "Jin (진)")).result.valid, true);
  assert.equal(oath.calls[0].body.state.player_name, "Jin (진)");

  const sub = fakeJev({ core1: { type: "noul", noul: 0.9 }, core2: { type: "noul", noul: 0.8 }, core3: { type: "noul", noul: 0.2 } });
  const { result } = await sub.judge.submission("It's the ghost ship from 1951. Rule 2 is fake.");
  assert.deepEqual([result.core1.accepted, result.core2.accepted, result.core3.accepted], [true, true, false]);
});
