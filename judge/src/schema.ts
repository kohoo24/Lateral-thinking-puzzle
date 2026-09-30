import { z } from "zod";

export const QuestionJudgment = z.object({
  question_type: z.enum(["yes_no", "open", "lie_condition"]),
  subject: z.enum(["ship", "person", "player", "past_event", "other"]),
  self_related: z.boolean(),
  proposition_truth: z.enum(["true", "false", "not_in_facts"]),
  rule4_violation: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  fact_ids: z.array(z.number().int()),
});
export type QuestionJudgment = z.infer<typeof QuestionJudgment>;

export const OathJudgment = z.object({
  has_own_name: z.boolean(),
  has_oath_intent: z.boolean(),
  names_someone_else: z.boolean(),
  valid: z.boolean(),
});
export type OathJudgment = z.infer<typeof OathJudgment>;

const CoreGrade = z.object({ accepted: z.boolean(), reason: z.string() });
export const SubmissionJudgment = z.object({ core1: CoreGrade, core2: CoreGrade, core3: CoreGrade });
export type SubmissionJudgment = z.infer<typeof SubmissionJudgment>;
