// 폭풍 시계(docs/01, 05). 실제 경과 시간 기준이며 일시정지하면 멈춘다.
const MIN = 60_000;

export const TIMELINE = {
  firstThreeFlash: 8 * MIN,
  threeFlashEvery: 6 * MIN,
  threeFlashEveryAfterStoreroom: 3 * MIN,
  threeFlashWindow: 15_000, // 세 번 깜빡임 뒤 배의 불빛이 희미하게 남아 있는 위험 구간
  rule6At: 25 * MIN,
  rule6Duration: 2 * MIN,
  lightningFrom: 30 * MIN,
  finalWarning: 35 * MIN,
  stormArrives: 37 * MIN, // 신호 불가, 강제 제출
  hardLimit: 40 * MIN, // 해가 뜨고 판정
} as const;

// 날씨 5단계: 약한 바람, 비, 강풍, 번개와 높은 파도, 폭풍 최고조
export function weatherPhase(ms: number): number {
  if (ms < 10 * MIN) return 0;
  if (ms < 20 * MIN) return 1;
  if (ms < 30 * MIN) return 2;
  if (ms < TIMELINE.stormArrives) return 3;
  return 4;
}

// 게임 속 시각 23:30 → 05:40 (40분 동안 6시간 10분)
export function gameClock(ms: number): string {
  const minutes = Math.min(370, Math.floor((ms / TIMELINE.hardLimit) * 370));
  const total = 23 * 60 + 30 + minutes;
  const h = Math.floor(total / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// 제출 단계에서 새벽빛이 밝아지는 정도(0~1)
export function dawnProgress(ms: number): number {
  return Math.max(0, Math.min(1, (ms - TIMELINE.stormArrives) / (TIMELINE.hardLimit - TIMELINE.stormArrives)));
}

export class StormClock {
  elapsed = 0;
  paused = false;
  constructor(public speed = 1) {}
  tick(dtMs: number) {
    if (!this.paused) this.elapsed += dtMs * this.speed;
  }
}

// 다음 세 번 깜빡임 시각. 창고 문을 연 뒤에는 더 자주 온다.
export function nextThreeFlashAt(last: number | null, storeroomOpened: boolean): number {
  if (last == null) return TIMELINE.firstThreeFlash;
  return last + (storeroomOpened ? TIMELINE.threeFlashEveryAfterStoreroom : TIMELINE.threeFlashEvery);
}

// 전임자의 목소리(수칙 6): 약 25분 또는 오염 3단계 진입 중 먼저 오는 때, 한 번
export function shouldStartRule6(ms: number, stage: number, done: boolean): boolean {
  return !done && (ms >= TIMELINE.rule6At || stage >= 3);
}
