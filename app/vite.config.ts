import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    // 개발 중에는 판정 서버(judge/)로 넘긴다. API 키는 판정 서버에만 있다.
    proxy: { "/v1": "http://localhost:8787" },
  },
  test: { include: ["src/**/*.test.ts"] },
});
