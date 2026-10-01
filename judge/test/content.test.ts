import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { contentDir, facts, holdoutTests, judgeTests } from "../src/content.js";

test("사실 목록은 51개이고 번호가 1부터 이어진다", () => {
  assert.equal(facts.length, 51);
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

test("별도 검증 세트 문항 수가 docs/09 수정 이력의 마지막 줄과 같다", () => {
  const doc = fs.readFileSync(path.join(contentDir, "../docs/09_별도_검증_세트.md"), "utf8");
  const all = [...doc.matchAll(/질문 (\d+)개\(영어·한국어 (\d+)회\), 서약 (\d+)개, 제출 (\d+)개/g)];
  assert.ok(all.length, "docs/09의 문항 수 문장을 찾지 못함");
  const [, q, calls, o, s] = all.at(-1)!.map(Number);
  assert.equal(holdoutTests.questions.length, q);
  assert.equal(holdoutTests.questions.length * 2, calls);
  assert.equal(holdoutTests.oaths.length, o);
  assert.equal(holdoutTests.submissions.length, s);
  for (const t of holdoutTests.questions) {
    assert.ok(t.en && t.ko, t.id);
    assert.ok(["yes", "no", "irrelevant", "send_again"].includes(t.expectedLight), t.id);
  }
});

// 별도 검증 세트는 규칙을 고칠 때 보지 않은 문장이어야 한다. 검증 질문 세트, 판정 원칙(docs/02),
// 프롬프트의 예시 문장과 같거나 한쪽이 다른 쪽을 포함하면 실패한다.
// 포함 검사는 12자 이상만 본다("your ship" 같은 낱말 목록이 걸리지 않도록).
test("별도 검증 세트 문장이 검증 질문 세트와 규칙 예시에 겹치지 않는다", () => {
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const quoted = (file: string) =>
    [...fs.readFileSync(path.join(contentDir, file), "utf8").matchAll(/["“]([^"”\n]{3,200})["”]/g)].map((m) => m[1]);
  const seen = [
    ...judgeTests.questions.flatMap((t) => [t.en, t.ko]),
    ...judgeTests.oaths.map((t) => t.text),
    ...judgeTests.submissions.map((t) => t.text),
    ...quoted("../docs/02_진상_문서.md"),
    ...quoted("../judge/src/prompt.ts"),
    ...quoted("../judge/src/jev-judge.ts"),
  ]
    .map(norm)
    .filter((t) => t.length >= 3);
  const held = [
    ...holdoutTests.questions.flatMap((t) => [{ id: t.id, text: t.en }, { id: t.id, text: t.ko }]),
    ...holdoutTests.oaths.map((t) => ({ id: t.id, text: t.text })),
    ...holdoutTests.submissions.map((t) => ({ id: t.id, text: t.text })),
  ];
  for (const h of held) {
    const n = norm(h.text);
    const hit = seen.find((s) => s === n || (n.length >= 12 && s.includes(n)) || (s.length >= 12 && n.includes(s)));
    assert.equal(hit, undefined, `${h.id} "${h.text}"가 이미 쓰인 문장과 겹침`);
  }
});
