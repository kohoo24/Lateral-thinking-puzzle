// 게임 파일(app/dist)을 판정 서버가 함께 내보낸다. 게임과 판정 API가 같은 주소에 있으면
// 브라우저의 다른 주소 요청 제한(CORS) 설정이 필요 없다.
import fs from "node:fs";
import type http from "node:http";
import path from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// 요청을 처리했으면 true. 파일이 없으면 false(호출한 쪽이 404를 보낸다)
export function serveStatic(root: string, req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const url = new URL(req.url ?? "/", "http://x");
  let rel: string;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    return false;
  }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.resolve(root, "." + rel);
  // 게임 폴더 밖의 파일은 내보내지 않는다
  if (!file.startsWith(path.resolve(root) + path.sep)) return false;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    "content-type": TYPES[ext] ?? "application/octet-stream",
    "content-length": stat.size,
    // 빌드 결과의 assets/는 파일 이름에 해시가 붙어 오래 캐시해도 된다. 첫 화면은 늘 새로 받는다
    "cache-control": rel.startsWith("/assets/") ? "public, max-age=31536000, immutable" : ext === ".html" ? "no-cache" : "public, max-age=3600",
  });
  if (req.method === "HEAD") res.end();
  else fs.createReadStream(file).pipe(res);
  return true;
}
