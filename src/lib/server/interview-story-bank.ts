/**
 * 经历故事册（Spec 29 / CONTEXT.md「经历故事册」）。
 *
 * 面试复盘的有效证据（评分扎实、有具体内容的回答）沉淀为故事册候选——
 * 候选即未确认态，用户确认后才成为活跃事实，才能被面试教练检索
 * （memory-policy interview_coaching 已放行 interview_story 类型）。
 */
import { createHash } from "node:crypto";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { admitMemory } from "@/lib/memory/admission";
import { getDatabaseDriver, isPostgresConfigured } from "@/lib/postgres";

export interface StoryCandidateInput {
  question: string;
  answer: string;
  /** 档位（0-4）或旧 1-5 分；≥3 才够格进故事册 */
  scoreBand: number;
  topic?: string;
}

export interface StoryCandidateResult {
  recorded: boolean;
  candidateId?: number;
  reason?: string;
}

const STORY_MIN_BAND = 3;

/** 一场面试结束时，把够格的回答沉淀为故事候选。 */
export async function recordStoryCandidates(
  principal: ExecutionPrincipal,
  answers: Array<StoryCandidateInput>,
): Promise<StoryCandidateResult[]> {
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) {
    return answers.map(() => ({ recorded: false, reason: "postgres_unavailable" }));
  }
  const results: StoryCandidateResult[] = [];
  for (const answer of answers) {
    if (answer.scoreBand < STORY_MIN_BAND || answer.answer.trim().length < 80) {
      results.push({ recorded: false, reason: "below_story_bar" });
      continue;
    }
    const fingerprint = createHash("sha256").update(`${answer.question}\u0000${answer.answer}`).digest("hex").slice(0, 24);
    try {
      const result = await admitMemory({
        userId: principal.userId,
        agentId: "interview",
        kind: "session_observation",
        sourceType: "story",
        sourceId: fingerprint,
        fact: {
          partition: "core",
          subject: `story:${fingerprint}`,
          predicate: "interview_story",
          object: {
            question: answer.question.slice(0, 300),
            topic: answer.topic || answer.question.slice(0, 120),
            excerpt: answer.answer.slice(0, 600),
          },
          canonicalText: `面试故事候选：针对「${answer.question.slice(0, 80)}」的有效回答（评分档位 ${answer.scoreBand}），待用户确认入故事册。`,
          confidence: 0.7,
          importance: 0.65,
        },
        evidence: {
          quote: answer.answer.slice(0, 800),
          extractionMethod: "interview_recap_story",
          isInterviewAnswer: true,
        },
      });
      results.push({ recorded: result.outcome === "candidate", candidateId: result.candidate?.id, reason: result.outcome === "rejected" ? result.reason : undefined });
    } catch (error) {
      results.push({ recorded: false, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}
