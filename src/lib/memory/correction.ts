import { createHash } from "node:crypto";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { getPostgresPool, withPostgresClient } from "@/lib/postgres";
import { recordEpisode, writeFactOperations, type FactCandidate, type RecordedFact } from "@/lib/memory/fact-ledger";
import { containsForbiddenMemoryContent, containsSalaryMemoryContent, containsSensitiveJobMemoryContent } from "@/lib/memory/admission";

export async function correctMemoryFact(
  principal: ExecutionPrincipal,
  input: {
    targetFactId: number;
    canonicalText: string;
    object?: Record<string, unknown>;
    sourceText: string;
    confirmedJobUse?: boolean;
  },
): Promise<RecordedFact[]> {
  if (!principal.userId.trim()) throw new Error("Memory user identity is required");
  if (!Number.isSafeInteger(input.targetFactId) || input.targetFactId <= 0) throw new Error("A target fact is required");
  const canonicalText = input.canonicalText.trim();
  const sourceText = input.sourceText.trim();
  if (!canonicalText || !sourceText) throw new Error("Correction text and source are required");
  const objectText = JSON.stringify(input.object || {});
  if (containsForbiddenMemoryContent(`${canonicalText}\n${sourceText}\n${objectText}`)) {
    throw new Error("forbidden_secret_or_identity_number");
  }
  return withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      const targetResult = await client.query(
        `SELECT partition, subject, predicate, canonical_text, object_json, invalid_at, superseded_by
         FROM memory_facts
         WHERE id=$1 AND user_id=$2
         FOR UPDATE`,
        [input.targetFactId, principal.userId],
      );
      const target = targetResult.rows[0] as { partition: string; subject: string; predicate: string; canonical_text: string; object_json: Record<string, unknown>; invalid_at: Date | null; superseded_by: string | null } | undefined;
      if (!target) throw new Error("Memory fact not found or already inactive");
      const correctionContext = `${target.predicate}\n${target.canonical_text}\n${JSON.stringify(target.object_json)}\n${canonicalText}\n${objectText}\n${sourceText}`;
      const sensitive = containsSensitiveJobMemoryContent(correctionContext);
      if (sensitive && input.confirmedJobUse !== true) throw new Error("sensitive_job_use_confirmation_required");
      const predicate = containsSalaryMemoryContent(correctionContext) && !containsSalaryMemoryContent(target.predicate)
        ? "salary_preference" : String(target.predicate);
      const candidate: FactCandidate = {
        partition: sensitive ? "private" : String(target.partition),
        subject: String(target.subject),
        predicate,
        object: input.object || { value: canonicalText },
        canonicalText,
        confidence: 1,
        importance: 0.8,
        currentPreference: sensitive,
      };
      const content = { targetFactId: input.targetFactId, sourceText, replacement: canonicalText,
        ...(sensitive ? { confirmedJobUse: true } : {}) };
      let episodeId: number;
      if (target.invalid_at) {
        const replay = await client.query(
          `SELECT d.source_episode_id
           FROM memory_fact_decisions d
           JOIN memory_episodes e ON e.id=d.source_episode_id AND e.user_id=d.user_id
           JOIN memory_facts f ON f.id=d.result_fact_id AND f.user_id=d.user_id
           WHERE d.user_id=$1 AND d.target_fact_id=$2 AND d.result_fact_id=$3
             AND d.decision='UPDATE' AND d.agent_id='profile'
             AND e.source_type='user_correction' AND e.content_json=$4::jsonb
             AND f.canonical_text=$5 AND f.object_json=$6::jsonb
             AND f.partition=$7 AND f.subject=$8 AND f.predicate=$9
             AND f.decision_id=d.id AND f.invalid_at IS NULL`,
          [principal.userId, input.targetFactId, target.superseded_by, JSON.stringify(content),
            canonicalText, JSON.stringify(candidate.object), candidate.partition, candidate.subject, candidate.predicate],
        );
        if (replay.rowCount !== 1) throw new Error("Memory fact not found or already inactive");
        episodeId = Number(replay.rows[0].source_episode_id);
      } else {
        const sourceHash = createHash("sha256").update(JSON.stringify([input.targetFactId, canonicalText, candidate.object, sourceText, candidate.partition, sensitive && input.confirmedJobUse === true])).digest("hex");
        const sourceId = `correction:${input.targetFactId}:${sourceHash}`;
        episodeId = await recordEpisode(principal, {
          sourceType: "user_correction",
          sourceId,
          content,
        }, client);
      }
      const recorded = await writeFactOperations(principal, [{
        decision: "UPDATE",
        candidate,
        targetFactId: input.targetFactId,
        reason: "user-confirmed memory correction",
      }], { episodeId, agentId: "profile", client });
      await client.query("COMMIT");
      return recorded;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function getCorrectionTarget(principal: ExecutionPrincipal, targetFactId: number) {
  const result = await getPostgresPool().query(
    `SELECT id, partition, subject, predicate, canonical_text
     FROM memory_facts WHERE id=$1 AND user_id=$2 AND invalid_at IS NULL`,
    [targetFactId, principal.userId],
  );
  return result.rows[0] || null;
}
