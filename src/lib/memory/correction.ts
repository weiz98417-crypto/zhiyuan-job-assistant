import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { getPostgresPool, withPostgresClient } from "@/lib/postgres";
import { recordEpisode, writeFactOperations, type FactCandidate, type RecordedFact } from "@/lib/memory/fact-ledger";
import { containsForbiddenMemoryContent } from "@/lib/memory/admission";

export async function correctMemoryFact(
  principal: ExecutionPrincipal,
  input: {
    targetFactId: number;
    canonicalText: string;
    object?: Record<string, unknown>;
    sourceText: string;
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
        `SELECT partition, subject, predicate, canonical_text
         FROM memory_facts
         WHERE id=$1 AND user_id=$2 AND invalid_at IS NULL
         FOR UPDATE`,
        [input.targetFactId, principal.userId],
      );
      const target = targetResult.rows[0] as { partition: string; subject: string; predicate: string; canonical_text: string } | undefined;
      if (!target) throw new Error("Memory fact not found or already inactive");
      const candidate: FactCandidate = {
        partition: String(target.partition),
        subject: String(target.subject),
        predicate: String(target.predicate),
        object: input.object || { value: canonicalText },
        canonicalText,
        confidence: 1,
        importance: 0.8,
      };
      const sourceId = `correction:${input.targetFactId}:${Buffer.from(canonicalText).toString("base64url").slice(0, 48)}`;
      const episodeId = await recordEpisode(principal, {
        sourceType: "user_correction",
        sourceId,
        content: { targetFactId: input.targetFactId, sourceText, replacement: canonicalText },
      }, client);
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
