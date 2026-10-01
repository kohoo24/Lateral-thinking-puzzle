import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { clientIp, Guard } from "../src/guard.js";
import { PlayLog } from "../src/play-log.js";
import { serveStatic } from "../src/static-files.js";

test("사용량 보호: 세션당 호출 수", () => {
  const g = new Guard({ sessionCalls: 2, dailyCalls: 100, sessionsPerIpPerHour: 10 });
  assert.equal(g.take("s1", "ip"), null);
  assert.equal(g.take("s1", "ip"), null);
  assert.equal(g.take("s1", "ip"), "session_limit");
  // 실패한 판정은 되돌려 다시 쓸 수 있다
  g.release("s1");
  assert.equal(g.take("s1", "ip"), null);
});

test("사용량 보호: 하루 전체 호출 수와 날짜가 바뀌면 초기화", () => {
  let now = Date.parse("2026-10-01T10:00:00Z");
  const g = new Guard({ sessionCalls: 100, dailyCalls: 3, sessionsPerIpPerHour: 100 }, () => now);
  for (const s of ["a", "b", "c"]) assert.equal(g.take(s, s), null);
  assert.equal(g.take("d", "d"), "daily_limit");
  now = Date.parse("2026-10-02T00:00:01Z");
  assert.equal(g.take("d", "d"), null);
  assert.equal(g.usage().dailyCalls, 1);
});

test("사용량 보호: IP당 새 세션 수(한 시간)", () => {
  let now = Date.parse("2026-10-01T10:00:00Z");
  const g = new Guard({ sessionCalls: 100, dailyCalls: 100, sessionsPerIpPerHour: 2 }, () => now);
  assert.equal(g.take("s1", "1.1.1.1"), null);
  assert.equal(g.take("s2", "1.1.1.1"), null);
  assert.equal(g.take("s3", "1.1.1.1"), "ip_limit");
  // 이미 시작한 세션은 계속 쓸 수 있고, 다른 IP는 영향이 없다
  assert.equal(g.take("s1", "1.1.1.1"), null);
  assert.equal(g.take("s9", "2.2.2.2"), null);
  now += 3_600_001;
  assert.equal(g.take("s3", "1.1.1.1"), null);
});

test("플레이 기록: 날짜별 파일에 한 줄씩, 정해진 이름만 읽을 수 있다", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "playlog-"));
  const log = new PlayLog(dir);
  log.write({ kind: "question", sessionId: "s", text: "너 매년 돌아와?", result: { light: "no" } }, new Date("2026-10-01T12:00:00Z"));
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(log.files(), ["plays-2026-10-01.jsonl"]);
  const line = JSON.parse(fs.readFileSync(path.join(dir, "plays-2026-10-01.jsonl"), "utf8"));
  assert.equal(line.text, "너 매년 돌아와?");
  assert.equal(log.pathOf("../../etc/passwd"), null);
  assert.equal(log.pathOf("plays-2026-10-02.jsonl"), null);
});

test("게임 파일: 폴더 안의 파일만 내보낸다", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "static-"));
  fs.writeFileSync(path.join(root, "index.html"), "<p>game</p>");
  fs.mkdirSync(path.join(root, "assets"));
  fs.writeFileSync(path.join(root, "assets", "a-123.js"), "1");
  fs.writeFileSync(path.join(path.dirname(root), "secret.txt"), "no");
  const server = http.createServer((req, res) => {
    if (!serveStatic(root, req, res)) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  const get = (p: string, method = "GET") =>
    new Promise<{ status: number; type?: string; cache?: string; body: string }>((resolve) => {
      // 경로를 그대로 보내려고 http.request를 쓴다(fetch는 ../를 미리 정리해 버린다)
      const req = http.request({ port, path: p, method }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode!, type: res.headers["content-type"], cache: res.headers["cache-control"], body }));
      });
      req.end();
    });
  try {
    const index = await get("/");
    assert.equal(index.status, 200);
    assert.equal(index.body, "<p>game</p>");
    assert.equal(index.cache, "no-cache");
    const asset = await get("/assets/a-123.js");
    assert.match(asset.type!, /javascript/);
    assert.match(asset.cache!, /immutable/);
    assert.equal((await get("/assets/a-123.js", "HEAD")).status, 200);
    assert.equal((await get("/../secret.txt")).status, 404);
    assert.equal((await get("/%2e%2e/secret.txt")).status, 404);
    assert.equal((await get("/missing.png")).status, 404);
  } finally {
    server.close();
  }
});

test("플레이어 주소: 프록시가 덧붙인 끝 칸을 쓰고, 플레이어가 적어 보낸 앞 칸은 믿지 않는다", () => {
  // 플레이어가 "1.2.3.4"를 적어 보냈고, 프록시가 실제 주소 5.6.7.8을 덧붙였다
  assert.equal(clientIp("1.2.3.4, 5.6.7.8", "10.0.0.1", 1), "5.6.7.8");
  assert.equal(clientIp("1.2.3.4, 5.6.7.8, 10.0.0.2", "10.0.0.1", 2), "5.6.7.8");
  assert.equal(clientIp(undefined, "10.0.0.1", 1), "10.0.0.1");
  assert.equal(clientIp("1.2.3.4", "10.0.0.1", 0), "10.0.0.1");
});
