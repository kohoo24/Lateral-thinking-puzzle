import { defineConfig } from "vite";

export default defineConfig({
  // 웹 플레이 빌드(build:web)는 아티팩트의 상대 경로에서 열리므로 상대 주소로 만든다
  base: process.env.VITE_JUDGE_MODE === "claude" ? "./" : "/",
  server: {
    port: 5173,
    // 개발 중에는 판정 서버(judge/)로 넘긴다. API 키는 판정 서버에만 있다.
    proxy: { "/v1": "http://localhost:8787" },
  },
  test: { include: ["src/**/*.test.ts"] },
});
