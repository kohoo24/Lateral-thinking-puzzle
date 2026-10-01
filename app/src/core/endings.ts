// 엔딩 판정(docs/06).
export type Ending = "true" | "hidden" | "partial" | "bad";

export function endingFor(coresAccepted: number, signalsSent: number): Ending {
  if (coresAccepted >= 3) return signalsSent === 0 ? "hidden" : "true";
  if (coresAccepted >= 1) return "partial";
  return "bad";
}
