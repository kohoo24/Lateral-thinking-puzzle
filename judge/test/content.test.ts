import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { contentDir, facts, judgeTests } from "../src/content.js";

test("사실 목록은 50개이고 번호가 1부터 이어진다", () => {
  assert.equal(facts.length, 50);
  facts.forEach((f, i) => assert.equal(f.id, i + 1));
});

test("핵심 사실 표시(★)가 진상 문서와 같다", () => {
  const cores = facts.filter((f) => f.core).map((f) => `${f.id}:${f.core}`);
  assert.deepEqual(cores, ["11:1", "14:1", "34:2", "35:2", "39:3", "40:3", "43:1", "44:2"]);
});

test("검증 세트 문항 수가 docs/03의 설명과 같다", () => {
  const doc = fs.readFileSync(path.join(contentDir, "../docs/03_검증_질문_세트.md"), "utf8");
  const m = doc.match(/1차 세트는 (\d+)문항이다\. 영어·한국어 쌍으로 묻는 A~H (\d+)문항\((\d+)회\)과 한 언어로만 적힌 I·J (\d+)문항을 합쳐 (\d+)회/);
  assert.ok(m, "docs/03의 문항 수 문장을 찾지 못함");
  const [, total, paired, pairedCalls, single, calls] = m!.map(Number);
  const q = judgeTests.questions.length;
  const s = judgeTests.oaths.length + judgeTests.submissions.length;
  assert.equal(q, paired);
  assert.equal(q * 2, pairedCalls);
  assert.equal(s, single);
  assert.equal(q + s, total);
  assert.equal(q * 2 + s, calls);
});

test("모든 질문 문항에 영어·한국어와 기대 결과가 있다", () => {
  for (const t of judgeTests.questions) {
    assert.ok(t.en && t.ko, t.id);
    assert.ok(["yes", "no", "irrelevant", "send_again"].includes(t.expectedLight), t.id);
  }
});
