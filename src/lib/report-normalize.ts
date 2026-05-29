import type { EvaluationScores } from "@/types";

type StoredBlock = string | { content?: unknown; score?: unknown };
type StoredBlocks = Record<string, StoredBlock>;

const BLOCK_KEYS = ["a", "b", "c", "d", "e", "f", "g"] as const;

export function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function normalizeReportBlocks(raw: unknown): EvaluationReportBlocks {
  const source = (raw && typeof raw === "object" ? raw : {}) as StoredBlocks;
  const blocks = {} as EvaluationReportBlocks;
  for (const key of BLOCK_KEYS) {
    const value = source[key];
    if (typeof value === "string") {
      blocks[key] = value;
    } else if (value && typeof value === "object" && typeof value.content === "string") {
      blocks[key] = value.content;
    } else {
      blocks[key] = "";
    }
  }
  return blocks;
}

export function normalizeReportScores(raw: unknown): EvaluationScores {
  const source = (raw && typeof raw === "object" ? raw : {}) as StoredBlocks;
  const scores = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: "" };
  for (const key of BLOCK_KEYS) {
    const value = source[key];
    if (value && typeof value === "object" && typeof value.score === "number") {
      if (key === "g") scores.g = String(value.score);
      else scores[key] = value.score;
    }
  }
  return scores;
}

type EvaluationReportBlocks = {
  a: string;
  b: string;
  c: string;
  d: string;
  e: string;
  f: string;
  g: string;
};
