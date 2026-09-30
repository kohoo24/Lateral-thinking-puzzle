// AI 판정 결과를 배의 불빛과 오염 점수로 바꾸는 게임 규칙(docs/03 "불빛이 정해지는 순서", docs/01 가산 원칙).
import type { QuestionJudgment } from "./schema.js";

// no_reach = "신호가 닿지 않음": 등유를 돌려주고 오염도 없다.
export type ShipLight = "yes" | "no" | "irrelevant" | "send_again" | "no_reach";

export function decideLight(j: QuestionJudgment): ShipLight {
  if (j.confidence === "low") return "no_reach";
  if (j.question_type !== "yes_no") return "send_again";
  if (j.proposition_truth === "not_in_facts") return "irrelevant";
  const truth = j.proposition_truth === "true";
  return truth !== j.self_related ? "yes" : "no";
}

export const CONTAMINATION = { surrounding: 1, shipSelf: 3, rule4: 5 } as const;

export function contaminationFor(j: QuestionJudgment, light: ShipLight): number {
  if (light === "no_reach") return 0;
  const base = j.self_related || j.subject === "ship" ? CONTAMINATION.shipSelf : CONTAMINATION.surrounding;
  return base + (j.rule4_violation ? CONTAMINATION.rule4 : 0);
}

export function countCores(s: { core1: { accepted: boolean }; core2: { accepted: boolean }; core3: { accepted: boolean } }): number {
  return [s.core1, s.core2, s.core3].filter((c) => c.accepted).length;
}
