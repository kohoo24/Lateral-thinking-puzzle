import assert from "node:assert/strict";
import { test } from "node:test";
import { contaminationFor, countCores, decideLight } from "../src/light.js";
import type { QuestionJudgment } from "../src/schema.js";

const j = (over: Partial<QuestionJudgment>): QuestionJudgment => ({
  question_type: "yes_no",
  subject: "past_event",
  self_related: false,
  proposition_truth: "true",
  rule4_violation: false,
  confidence: "high",
  fact_ids: [],
  ...over,
});

test("배 자신과 무관한 질문은 진실로 대답한다", () => {
  assert.equal(decideLight(j({ proposition_truth: "true" })), "yes");
  assert.equal(decideLight(j({ proposition_truth: "false" })), "no");
});

test("배 자신 관련 질문은 대답을 뒤집는다", () => {
  assert.equal(decideLight(j({ self_related: true, proposition_truth: "true" })), "no");
  assert.equal(decideLight(j({ self_related: true, proposition_truth: "false" })), "yes");
});

test("사실 목록에 없으면 배 자신 관련이어도 상관없음", () => {
  assert.equal(decideLight(j({ self_related: true, proposition_truth: "not_in_facts" })), "irrelevant");
});

test("열린 질문과 거짓말 조건 질문은 다시 보내라", () => {
  assert.equal(decideLight(j({ question_type: "open", proposition_truth: "not_in_facts" })), "send_again");
  assert.equal(decideLight(j({ question_type: "lie_condition", proposition_truth: "not_in_facts" })), "send_again");
});

test("열린 질문은 확신이 낮아도 다시 보내라(질문 종류를 먼저 본다)", () => {
  assert.equal(decideLight(j({ question_type: "open", proposition_truth: "not_in_facts", confidence: "low" })), "send_again");
  assert.equal(decideLight(j({ question_type: "lie_condition", proposition_truth: "true", confidence: "low" })), "send_again");
});

test("예/아니오 질문인데 확신이 낮으면 신호가 닿지 않음(등유 반환, 오염 0)", () => {
  const judgment = j({ confidence: "low", self_related: true, rule4_violation: true });
  const light = decideLight(judgment);
  assert.equal(light, "no_reach");
  assert.equal(contaminationFor(judgment, light), 0);
});

test("오염 가산 원칙: 종류 점수 + 위반 점수 (docs/01)", () => {
  const surrounding = j({});
  assert.equal(contaminationFor(surrounding, decideLight(surrounding)), 1);
  const self = j({ subject: "ship", self_related: true });
  assert.equal(contaminationFor(self, decideLight(self)), 3);
  // "너 헤일이야?" = 3 + 5
  const hale = j({ subject: "ship", self_related: true, rule4_violation: true });
  assert.equal(contaminationFor(hale, decideLight(hale)), 8);
  // "누가 타고 있어?"(열린 질문, 배) = 3, "크레인은 왜 그랬어?" = 1
  const whoAboard = j({ question_type: "open", subject: "ship", proposition_truth: "not_in_facts" });
  assert.equal(contaminationFor(whoAboard, decideLight(whoAboard)), 3);
  const why = j({ question_type: "open", subject: "person", proposition_truth: "not_in_facts" });
  assert.equal(contaminationFor(why, decideLight(why)), 1);
});

test("제출 인정 개수", () => {
  const g = (a: boolean) => ({ accepted: a, reason: "" });
  assert.equal(countCores({ core1: g(true), core2: g(false), core3: g(true) }), 2);
});
