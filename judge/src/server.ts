// 게임 클라이언트가 호출하는 판정 서버. API 키는 이 서버에만 있다.
//   POST /v1/question   { sessionId, text }             → { light, contamination, judgment }
//   POST /v1/oath       { sessionId, text, playerName } → { valid }
//   POST /v1/submission { sessionId, text }             → { cores, count }
// 스팀 인증은 M4에서 붙인다. 지금은 sessionId 단위로 호출 수만 제한한다.
import http from "node:http";
import { Judge, JudgeUnavailable } from "./judge.js";
import { contaminationFor, countCores, decideLight } from "./light.js";

const PORT = Number(process.env.PORT ?? 8787);
const CALL_LIMIT_PER_SESSION = 60; // 신호 24회 + 실패 재시도·서약·제출 여유
const GAME_TIMEOUT_MS = 5500; // 게임은 6초에 끊으므로 서버가 먼저 포기한다

const judge = new Judge({ timeoutMs: GAME_TIMEOUT_MS, maxRetries: 0 });
const callsBySession = new Map<string, number>();

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
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") return send(res, 404, { error: "not found" });
  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, { error: "invalid json" });
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const text = typeof body.text === "string" ? body.text.slice(0, 500) : "";
  if (!sessionId || !text) return send(res, 400, { error: "sessionId and text are required" });

  const used = callsBySession.get(sessionId) ?? 0;
  if (used >= CALL_LIMIT_PER_SESSION) return send(res, 429, { error: "call limit reached" });
  callsBySession.set(sessionId, used + 1);

  try {
    switch (req.url) {
      case "/v1/question": {
        const { result } = await judge.question(text);
        const light = decideLight(result);
        return send(res, 200, { light, contamination: contaminationFor(result, light), judgment: result });
      }
      case "/v1/oath": {
        const playerName = typeof body.playerName === "string" ? body.playerName.slice(0, 40) : "";
        const { result } = await judge.oath(text, playerName);
        return send(res, 200, { valid: result.valid });
      }
      case "/v1/submission": {
        const { result } = await judge.submission(text);
        return send(res, 200, { count: countCores(result), cores: result });
      }
      default:
        return send(res, 404, { error: "not found" });
    }
  } catch (e) {
    // 판정 실패는 게임 쪽에서 "신호가 닿지 않음"(등유 반환)으로 처리한다.
    callsBySession.set(sessionId, used);
    const reason = e instanceof JudgeUnavailable ? e.message : "judge unavailable";
    return send(res, 503, { light: "no_reach", error: reason });
  }
});

server.listen(PORT, () => console.log(`judge server on :${PORT} (${judge.model}, effort ${judge.effort})`));
