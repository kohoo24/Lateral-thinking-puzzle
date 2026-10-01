// 공개 배포용 사용량 보호. 판정 비용은 API 키 주인에게 청구되므로, 링크가 퍼져도 비용이 정해진 선을 넘지 않게 한다.
//   세션당 호출 수   SESSION_CALL_LIMIT(기본 60): 신호 24회 + 실패 재시도·서약·제출 여유
//   하루 전체 호출 수 JUDGE_DAILY_CALL_LIMIT(기본 2000, UTC 날짜 기준): 넘으면 그날은 모두 "신호가 닿지 않음"
//   IP당 새 세션 수   SESSIONS_PER_IP_PER_HOUR(기본 6): 세션 ID를 계속 새로 만들어 세션 제한을 피하는 것을 막는다
// 기록은 메모리에만 있으므로 서버를 다시 켜면 처음부터 센다.

const num = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) ? Number(v) : fallback);

export type GuardLimits = { sessionCalls: number; dailyCalls: number; sessionsPerIpPerHour: number };

export const limitsFromEnv = (env = process.env): GuardLimits => ({
  sessionCalls: num(env.SESSION_CALL_LIMIT, 60),
  dailyCalls: num(env.JUDGE_DAILY_CALL_LIMIT, 2000),
  sessionsPerIpPerHour: num(env.SESSIONS_PER_IP_PER_HOUR, 6),
});

export type Refusal = "session_limit" | "daily_limit" | "ip_limit";

export class Guard {
  private day = "";
  private dailyCalls = 0;
  private callsBySession = new Map<string, number>();
  private sessionsByIp = new Map<string, number[]>();

  constructor(
    readonly limits: GuardLimits,
    private now: () => number = Date.now,
  ) {}

  private rollDay() {
    const today = new Date(this.now()).toISOString().slice(0, 10);
    if (today !== this.day) {
      // 날이 바뀌면 하루 호출 수와 세션 기록을 비운다(메모리가 계속 늘지 않게)
      this.day = today;
      this.dailyCalls = 0;
      this.callsBySession.clear();
      this.sessionsByIp.clear();
    }
  }

  // 판정 한 번을 쓸 수 있으면 null, 아니면 막힌 이유. 쓸 수 있으면 바로 센다(실패하면 release로 되돌린다)
  take(sessionId: string, ip: string): Refusal | null {
    this.rollDay();
    if (this.dailyCalls >= this.limits.dailyCalls) return "daily_limit";
    const used = this.callsBySession.get(sessionId);
    if (used === undefined) {
      const hourAgo = this.now() - 3_600_000;
      const recent = (this.sessionsByIp.get(ip) ?? []).filter((t) => t > hourAgo);
      if (recent.length >= this.limits.sessionsPerIpPerHour) return "ip_limit";
      recent.push(this.now());
      this.sessionsByIp.set(ip, recent);
    } else if (used >= this.limits.sessionCalls) return "session_limit";
    this.callsBySession.set(sessionId, (used ?? 0) + 1);
    this.dailyCalls++;
    return null;
  }

  // 판정이 실패했을 때 센 것을 되돌린다(실패는 플레이어 몫이 아니다)
  release(sessionId: string) {
    const used = this.callsBySession.get(sessionId);
    if (used) this.callsBySession.set(sessionId, used - 1);
    if (this.dailyCalls > 0) this.dailyCalls--;
  }

  usage() {
    this.rollDay();
    return { day: this.day, dailyCalls: this.dailyCalls, dailyLimit: this.limits.dailyCalls, sessions: this.callsBySession.size };
  }
}

// 플레이어 주소. 배포 서비스(Render 등)의 앞단 프록시는 접속한 주소를 x-forwarded-for 끝에 덧붙인다.
// 첫 칸은 플레이어가 마음대로 적어 보낼 수 있으므로, 믿을 수 있는 프록시 수(hops, TRUSTED_PROXY_HOPS)만큼
// 끝에서 센 칸을 쓴다. 프록시 없이 직접 띄우면 0으로 둔다(소켓 주소를 쓴다).
export function clientIp(forwardedFor: string | string[] | undefined, socketAddress: string | undefined, hops: number): string {
  const list = (Array.isArray(forwardedFor) ? forwardedFor.join(",") : (forwardedFor ?? ""))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (hops > 0 && list.length >= hops) return list[list.length - hops];
  return socketAddress || "unknown";
}
