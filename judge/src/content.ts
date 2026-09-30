import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const contentDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../content");

export type Fact = { id: number; core: number | null; selfRelated: boolean; en: string; ko: string };
export type Light = "yes" | "no" | "irrelevant" | "send_again";
export type QuestionTest = {
  id: string;
  section: string;
  group: string | null;
  en: string;
  ko: string;
  expectedLight: Light;
  expectedRule4: boolean;
  expectedSelfRelated: boolean | null;
  note: string;
};
export type OathTest = { id: string; text: string; expectedValid: boolean; note: string };
export type SubmissionTest = { id: string; text: string; expectedCount: number; note: string };

function load<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(contentDir, name), "utf8")) as T;
}

export const facts = load<Fact[]>("facts.json");
export const judgeTests = load<{ questions: QuestionTest[]; oaths: OathTest[]; submissions: SubmissionTest[] }>(
  "judge-tests.json",
);
