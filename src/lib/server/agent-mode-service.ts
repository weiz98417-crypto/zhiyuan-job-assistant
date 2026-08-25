import { readFileSync } from "node:fs";
import { join } from "node:path";

const MODE_FILES = {
  dingwei: join("modes", "zh", "dingwei.md"),
  "interview-prep": join("modes", "zh", "interview-prep.md"),
} as const;

export function loadAgentMode(name: keyof typeof MODE_FILES): string {
  return readFileSync(join(process.cwd(), MODE_FILES[name]), "utf8");
}

export function loadInterviewStoryBank(): string {
  return readFileSync(join(process.cwd(), "interview-prep", "story-bank.md"), "utf8");
}
