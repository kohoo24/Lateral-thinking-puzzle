// 플레이 테스트 기록. 판정 한 번마다 한 줄(JSON)을 날짜별 파일에 남긴다(JUDGE_LOG_DIR, 기본 judge/logs).
// 실제 플레이어가 입력한 질문을 모아 검증 질문 세트(docs/03)를 넓히는 데 쓴다(docs/03 "다음 단계").
// IP 주소는 남기지 않는다. 서약 판정에는 플레이어가 적은 이름이 들어간다.
import fs from "node:fs";
import path from "node:path";

export type PlayLogEntry = {
  kind: "question" | "oath" | "submission";
  sessionId: string;
  text: string;
  ms?: number;
  result?: unknown;
  error?: string;
};

const DAY_FILE = /^plays-\d{4}-\d{2}-\d{2}\.jsonl$/;

export class PlayLog {
  constructor(readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  write(entry: PlayLogEntry, now = new Date()) {
    const line = JSON.stringify({ t: now.toISOString(), ...entry }) + "\n";
    // 기록 실패가 판정을 막지 않게 한다
    fs.appendFile(path.join(this.dir, `plays-${now.toISOString().slice(0, 10)}.jsonl`), line, () => {});
  }

  files(): string[] {
    return fs.readdirSync(this.dir).filter((f) => DAY_FILE.test(f)).sort();
  }

  // 파일 이름이 정해진 형식일 때만 경로를 돌려준다(다른 파일을 읽지 못하게)
  pathOf(file: string): string | null {
    return DAY_FILE.test(file) && fs.existsSync(path.join(this.dir, file)) ? path.join(this.dir, file) : null;
  }
}
