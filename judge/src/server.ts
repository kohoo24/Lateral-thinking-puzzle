// 게임 클라이언트가 호출하는 판정 서버. API 키는 이 서버에만 있다.
//   POST /v1/question   { sessionId, text }             → { light, contamination, judgment }
//   POST /v1/oath       { sessionId, text, playerName } → { valid }
//   POST /v1/submission { sessionId, text }             → { cores, count }
//   GET  /healthz                                       → 상태와 오늘 사용량(배포 서비스의 상태 확인용)
//   GET  /v1/logs, /v1/logs/plays-YYYY-MM-DD.jsonl      → 플레이 기록(LOG_ACCESS_TOKEN이 있을 때만, Bearer 토큰 필요)
//   GET  그 밖의 주소                                    → 게임 파일(STATIC_DIR이 있을 때. 배포용)
// 스팀 인증은 M4에서 붙인다. 지금은 사용량 보호(guard.ts)로 비용을 묶어 둔다.
// 판정 백엔드는 JUDGE_BACKEND(jev 기본, claude, mock)로 고른다.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJudge } from "./backends.js";
import { clientIp, Guard, limitsFromEnv, type Refusal } from "./guard.js";
import { JudgeUnavailable, type JudgeBackend } from "./judge.js";
import { contaminationFor, countCores, decideLight } from "./light.js";
import { PlayLog } from "./play-log.js";
import { serveStatic } from "./static-files.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const GAME_TIMEOUT_MS = 5500; // 게임은 6초에 끊으므로 서버가 먼저 포기한다
const STATIC_DIR = process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : null;
const LOG_DIR = path.resolve(process.env.JUDGE_LOG_DIR ?? path.join(here, "../logs"));
const LOG_ACCESS_TOKEN = process.env.LOG_ACCESS_TOKEN ?? "";
const TRUSTED_PROXY_HOPS = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);
// 배포 서비스가 실제 접속 주소를 따로 넣어 주는 헤더(예: Cloudflare를 거치는 Render의 cf-connecting-ip).
// 정하면 x-forwarded-for보다 먼저 쓴다. 플레이어가 위조할 수 없는(앞단이 덮어쓰는) 헤더만 적는다.
const CLIENT_IP_HEADER = (process.env.CLIENT_IP_HEADER ?? "").toLowerCase();
const IP_HEADERS = ["cf-connecting-ip", "true-client-ip", "x-real-ip"];

function playerIp(req: http.IncomingMessage): string {
  const fromHeader = CLIENT_IP_HEADER ? req.headers[CLIENT_IP_HEADER] : undefined;
  const value = (Array.isArray(fromHeader) ? fromHeader[0] : fromHeader)?.trim();
  return value || clientIp(req.headers["x-forwarded-for"], req.socket.remoteAddress, TRUSTED_PROXY_HOPS);
}

// /healthz에 붙이는 주소 판별 진단. 주소 값은 내보내지 않고 헤더의 생김새만 알려준다
function clientDiagnosis(req: http.IncomingMessage) {
  const xff = req.headers["x-forwarded-for"];
  const entries = (Array.isArray(xff) ? xff.join(",") : (xff ?? "")).split(",").filter((s) => s.trim()).length;
  const chosen = playerIp(req);
  return {
    forwardedEntries: entries,
    ipHeaders: IP_HEADERS.filter((h) => req.headers[h]),
    source: CLIENT_IP_HEADER && req.headers[CLIENT_IP_HEADER] ? `header:${CLIENT_IP_HEADER}` : entries >= TRUSTED_PROXY_HOPS && TRUSTED_PROXY_HOPS > 0 ? `forwarded:${TRUSTED_PROXY_HOPS}` : "socket",
    matches: Object.fromEntries(IP_HEADERS.filter((h) => req.headers[h]).map((h) => [h, String(req.headers[h]).trim() === chosen])),
  };
}

const judge: JudgeBackend = createJudge(undefined, { timeoutMs: GAME_TIMEOUT_MS, maxRetries: 0 });
const guard = new Guard(limitsFromEnv());
const playLog = new PlayLog(LOG_DIR);

const REFUSAL_STATUS: Record<Refusal, number> = { session_limit: 429, ip_limit: 429, daily_limit: 503 };

function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 10_000) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (e) {
        reject(e);
      }
    });
  });
}

function send(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}

function authorized(req: http.IncomingMessage): boolean {
  return LOG_ACCESS_TOKEN.length >= 16 && req.headers.authorization === `Bearer ${LOG_ACCESS_TOKEN}`;
}

function handleGet(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/healthz") return send(res, 200, { ok: true, model: judge.model, usage: guard.usage(), client: clientDiagnosis(req) });
  if (url.pathname === "/v1/logs" || url.pathname.startsWith("/v1/logs/")) {
    if (!authorized(req)) return send(res, 404, { error: "not found" });
    if (url.pathname === "/v1/logs") return send(res, 200, { files: playLog.files() });
    const file = playLog.pathOf(url.pathname.slice("/v1/logs/".length));
    if (!file) return send(res, 404, { error: "not found" });
    res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" });
    return void fs.createReadStream(file).pipe(res);
  }
  if (STATIC_DIR && serveStatic(STATIC_DIR, req, res)) return;
  send(res, 404, { error: "not found" });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" || req.method === "HEAD") return handleGet(req, res);
  if (req.method !== "POST") return send(res, 404, { error: "not found" });
  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, { error: "invalid json" });
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "";
  const text = typeof body.text === "string" ? body.text.slice(0, 500) : "";
  if (!sessionId || !text) return send(res, 400, { error: "sessionId and text are required" });
  if (!["/v1/question", "/v1/oath", "/v1/submission"].includes(req.url ?? "")) return send(res, 404, { error: "not found" });

  const refusal = guard.take(sessionId, playerIp(req));
  if (refusal) return send(res, REFUSAL_STATUS[refusal], { light: "no_reach", error: refusal });

  const started = performance.now();
  const kind = (req.url ?? "").slice("/v1/".length) as "question" | "oath" | "submission";
  try {
    switch (kind) {
      case "question": {
        const { result } = await judge.question(text);
        const light = decideLight(result);
        playLog.write({ kind, sessionId, text, ms: Math.round(performance.now() - started), result: { light, judgment: result } });
        return send(res, 200, { light, contamination: contaminationFor(result, light), judgment: result });
      }
      case "oath": {
        const playerName = typeof body.playerName === "string" ? body.playerName.slice(0, 40) : "";
        const { result } = await judge.oath(text, playerName);
        playLog.write({ kind, sessionId, text, ms: Math.round(performance.now() - started), result: { playerName, ...result } });
        return send(res, 200, { valid: result.valid });
      }
      case "submission": {
        const { result } = await judge.submission(text);
        const count = countCores(result);
        playLog.write({ kind, sessionId, text, ms: Math.round(performance.now() - started), result: { count, cores: result } });
        return send(res, 200, { count, cores: result });
      }
    }
  } catch (e) {
    // 판정 실패는 게임 쪽에서 "신호가 닿지 않음"(등유 반환)으로 처리한다.
    guard.release(sessionId);
    const reason = e instanceof JudgeUnavailable ? e.message : "judge unavailable";
    playLog.write({ kind, sessionId, text, ms: Math.round(performance.now() - started), error: reason });
    return send(res, 503, { light: "no_reach", error: reason });
  }
});

server.listen(PORT, () => {
  console.log(`judge server on :${PORT} (${judge.model})`);
  console.log(`  game files: ${STATIC_DIR ?? "(없음. STATIC_DIR을 정하면 게임도 함께 내보냄)"}`);
  console.log(`  play log: ${LOG_DIR}${LOG_ACCESS_TOKEN.length >= 16 ? " (내려받기 켜짐)" : ""}`);
  console.log(`  limits: ${JSON.stringify(guard.limits)}`);
});
