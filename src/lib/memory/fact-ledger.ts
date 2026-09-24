/**
 * 记忆事实账本（M5，ADR-0028）。
 *
 * 双时态事实账本：episodes append-only，facts 带 valid_at/invalid_at——
 * 新事实与开放事实矛盾时作废旧事实（invalid_at + superseded_by），永不覆盖。
 * 写入走两段式决策（Mem0 模式）：抽取候选 → 与相似开放事实比对 →
 * ADD/UPDATE/DELETE/NOOP + 理由；LLM 不可用时退回确定性规则（精确去重、
 * 同主谓不同宾 → 作废旧事实再新增）。
 * 画像（profile_blocks）是结构化字段集，纯 SQL 查询，永不走向量。
 * 分区（memory_partitions）按 agent 表达读写权限（MemCube 模型）。
 */
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { getDataRepositories } from "@/lib/data-repositories";
import { getPostgresPool } from "@/lib/postgres";

export type FactDecision = "ADD" | "UPDATE" | "DELETE" | "NOOP";

export interface FactCandidate {
  partition: string;
  subject: string;
  predicate: string;
  object: Record<string, unknown>;
  canonicalText: string;
  confidence: number;
  importance: number;
}

export interface ExistingFact {
  id: number;
  partition: string;
  subject: string;
  predicate: string;
  canonicalText: string;
  validAt: Date;
  confidence: number;
}

export interface FactOperation {
  decision: FactDecision;
  candidate: FactCandidate;
  /** For UPDATE/DELETE: the open fact being invalidated. */
  targetFactId?: number;
  reason: string;
}

export interface RecordedFact {
  factId: number;
  decision: FactDecision;
}

// ── Episodes ──

export async function recordEpisode(
  principal: ExecutionPrincipal,
  input: { sourceType: string; sourceId: string; content: Record<string, unknown> },
): Promise<number> {
  const pool = getPostgresPool();
  const result = await pool.query(
    `INSERT INTO memory_episodes (user_id, source_type, source_id, content_json)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [principal.userId, input.sourceType, input.sourceId, JSON.stringify(input.content)],
  );
  return Number(result.rows[0].id);
}

// ── Decision stage (stage 2 of the write pipeline) ──

/** Deterministic decision rules; used directly when the LLM is unavailable. */
export function decideFactOperationsDeterministic(
  existing: ExistingFact[],
  candidate: FactCandidate,
): FactOperation[] {
  const exact = existing.find((fact) => fact.partition === candidate.partition
    && fact.canonicalText === candidate.canonicalText);
  if (exact) {
    return [{ decision: "NOOP", candidate, targetFactId: exact.id, reason: "identical canonical fact already open" }];
  }
  const sameSubjectPredicate = existing.find(
    (fact) => fact.partition === candidate.partition
      && fact.subject === candidate.subject
      && fact.predicate === candidate.predicate,
  );
  if (sameSubjectPredicate) {
    return [
      {
        decision: "UPDATE",
        candidate,
        targetFactId: sameSubjectPredicate.id,
        reason: `same subject+predicate with different object; invalidates fact #${sameSubjectPredicate.id}`,
      },
    ];
  }
  return [{ decision: "ADD", candidate, reason: "no conflicting open fact" }];
}

/** LLM decision stage: compare candidates against similar open facts. */
export async function decideFactOperations(
  existing: ExistingFact[],
  candidate: FactCandidate,
): Promise<FactOperation[]> {
  const similar = existing.filter(
    (fact) => fact.partition === candidate.partition
      && (fact.subject === candidate.subject || fact.predicate === candidate.predicate),
  );
  if (similar.length === 0) {
    return [{ decision: "ADD", candidate, reason: "no similar open fact" }];
  }
  try {
    const { complete, getThinkModelChain } = await import("@/lib/ai/model-gateway");
    const result = await complete({
      messages: [{
        role: "user",
        content: [
          "你是记忆库管理员。判断新事实应当如何并入事实账本。只输出 JSON。",
          "",
          "已有开放事实：",
          ...similar.map((fact) => `- id=${fact.id} [${fact.subject} | ${fact.predicate}] ${fact.canonicalText}`),
          "",
          `新事实：[${candidate.subject} | ${candidate.predicate}] ${candidate.canonicalText}`,
          "",
          '规则：完全重复 → NOOP；同一事实的更新（如意向变更）→ UPDATE 并给出理由；新事实使旧事实失效 → DELETE 旧事实；无关 → ADD。',
          '输出：{"decision":"ADD|UPDATE|DELETE|NOOP","targetFactId":<数字或null>,"reason":"一句话"}',
        ].join("\n"),
      }],
      temperature: 0.1,
      maxTokens: 256,
      stream: false,
      chain: getThinkModelChain(),
      timeoutMs: 8_000,
    });
    const match = result.text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { decision?: string; targetFactId?: number; reason?: string };
      const decision = ["ADD", "UPDATE", "DELETE", "NOOP"].includes(parsed.decision || "")
        ? parsed.decision as FactDecision
        : null;
      if (decision) {
        const targetFactId = decision === "UPDATE" || decision === "DELETE"
          ? Number(parsed.targetFactId) || similar[0]?.id
          : undefined;
        return [{ decision, candidate, targetFactId, reason: parsed.reason || `llm decision: ${decision}` }];
      }
    }
  } catch {
    // fall through to deterministic rules
  }
  return decideFactOperationsDeterministic(existing, candidate);
}

// ── Write path ──

export async function writeFactOperations(
  principal: ExecutionPrincipal,
  operations: FactOperation[],
  episodeId?: number,
): Promise<RecordedFact[]> {
  const pool = getPostgresPool();
  const recorded: RecordedFact[] = [];
  for (const op of operations) {
    if (op.decision === "NOOP") {
      recorded.push({ factId: op.targetFactId ?? 0, decision: "NOOP" });
      continue;
    }
    if ((op.decision === "UPDATE" || op.decision === "DELETE") && op.targetFactId) {
      await pool.query(
        `UPDATE memory_facts
         SET invalid_at = NOW(),
             invalidation_reason = $3,
             superseded_by = $4
         WHERE id = $1 AND user_id = $2 AND invalid_at IS NULL`,
        [op.targetFactId, principal.userId, op.reason, op.decision === "UPDATE" ? null : null],
      );
      if (op.decision === "DELETE") {
        recorded.push({ factId: op.targetFactId, decision: "DELETE" });
        continue;
      }
    }
    const inserted = await pool.query(
      `INSERT INTO memory_facts
        (user_id, partition, subject, predicate, object_json, canonical_text,
         confidence, importance, source_episode_id, decision, decision_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        principal.userId,
        op.candidate.partition,
        op.candidate.subject,
        op.candidate.predicate,
        JSON.stringify(op.candidate.object),
        op.candidate.canonicalText,
        op.candidate.confidence,
        op.candidate.importance,
        episodeId ?? null,
        op.decision,
        op.reason,
      ],
    );
    recorded.push({ factId: Number(inserted.rows[0].id), decision: op.decision });
  }
  return recorded;
}

/** Full pipeline for one candidate: decide → apply. */
export async function recordFact(
  principal: ExecutionPrincipal,
  candidate: FactCandidate,
  options: { episodeId?: number; useLlmDecision?: boolean } = {},
): Promise<RecordedFact[]> {
  const existing = await listOpenFacts(principal, {
    partition: candidate.partition,
    subject: candidate.subject,
    limit: 10,
  });
  const operations = options.useLlmDecision === false
    ? decideFactOperationsDeterministic(existing, candidate)
    : await decideFactOperations(existing, candidate);
  return writeFactOperations(principal, operations, options.episodeId);
}

// ── Read path ──

export async function listOpenFacts(
  principal: ExecutionPrincipal,
  input: { partition?: string; subject?: string; limit?: number } = {},
): Promise<ExistingFact[]> {
  const pool = getPostgresPool();
  const result = await pool.query(
    `SELECT id, partition, subject, predicate, canonical_text, valid_at, confidence
     FROM memory_facts
     WHERE user_id = $1 AND invalid_at IS NULL
       AND ($2::text IS NULL OR partition = $2)
       AND ($3::text IS NULL OR subject = $3)
     ORDER BY importance DESC, valid_at DESC
     LIMIT $4`,
    [principal.userId, input.partition ?? null, input.subject ?? null, input.limit ?? 20],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    partition: String(row.partition),
    subject: String(row.subject),
    predicate: String(row.predicate),
    canonicalText: String(row.canonical_text),
    validAt: new Date(row.valid_at),
    confidence: Number(row.confidence),
  }));
}

/**
 * Hybrid fact retrieval: vector similarity + Postgres full-text, fused with
 * reciprocal rank fusion (k=60).
 */
export async function searchFactsHybrid(
  principal: ExecutionPrincipal,
  input: { queryText: string; queryEmbedding: number[]; partition?: string; limit?: number },
): Promise<Array<{ factId: number; canonicalText: string; score: number }>> {
  const pool = getPostgresPool();
  const limit = input.limit ?? 8;
  const vector = `[${input.queryEmbedding.join(",")}]`;
  const result = await pool.query(
    `WITH vector_hits AS (
       SELECT fact_id, ROW_NUMBER() OVER (ORDER BY embedding <=> $1::vector) AS rank
       FROM memory_fact_chunks
       WHERE user_id = $2 AND embedding_status = 'embedded'
     ),
     text_hits AS (
       SELECT f.id AS fact_id,
              ROW_NUMBER() OVER (ORDER BY ts_rank(to_tsvector('simple', c.content), plainto_tsquery('simple', $3)) DESC) AS rank
       FROM memory_facts f
       JOIN memory_fact_chunks c ON c.fact_id = f.id
       WHERE f.user_id = $2 AND f.invalid_at IS NULL
         AND to_tsvector('simple', c.content) @@ plainto_tsquery('simple', $3)
     ),
     fusion AS (
       SELECT fact_id, SUM(1.0 / (60 + rank)) AS score FROM (
         SELECT fact_id, rank FROM vector_hits LIMIT $4
         UNION ALL
         SELECT fact_id, rank FROM text_hits LIMIT $4
       ) combined GROUP BY fact_id
     )
     SELECT fusion.fact_id, fusion.score, f.canonical_text
     FROM fusion JOIN memory_facts f ON f.id = fusion.fact_id
     WHERE f.invalid_at IS NULL
     ORDER BY fusion.score DESC
     LIMIT $4`,
    [vector, principal.userId, input.queryText, limit * 3],
  );
  return result.rows.map((row) => ({
    factId: Number(row.fact_id),
    canonicalText: String(row.canonical_text),
    score: Number(row.score),
  }));
}

// ── Profile blocks (structured, never vectorized) ──

export async function upsertProfileBlock(
  principal: ExecutionPrincipal,
  input: { topic: string; subTopic: string; value: Record<string, unknown>; label?: string; confidence?: number; source?: string },
): Promise<void> {
  const pool = getPostgresPool();
  await pool.query(
    `INSERT INTO profile_blocks (user_id, topic, sub_topic, value_json, label, confidence, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, topic, sub_topic)
     DO UPDATE SET value_json = EXCLUDED.value_json,
       label = EXCLUDED.label,
       confidence = EXCLUDED.confidence,
       updated_at = NOW()`,
    [
      principal.userId,
      input.topic,
      input.subTopic,
      JSON.stringify(input.value),
      input.label ?? null,
      input.confidence ?? 0.6,
      input.source ?? "agent",
    ],
  );
}

export async function getProfileBlocks(
  principal: ExecutionPrincipal,
  topic?: string,
): Promise<Array<{ topic: string; subTopic: string; value: Record<string, unknown>; label: string | null }>> {
  const pool = getPostgresPool();
  const result = await pool.query(
    `SELECT topic, sub_topic, value_json, label
     FROM profile_blocks
     WHERE user_id = $1 AND ($2::text IS NULL OR topic = $2)
     ORDER BY topic, sub_topic`,
    [principal.userId, topic ?? null],
  );
  return result.rows.map((row) => ({
    topic: String(row.topic),
    subTopic: String(row.sub_topic),
    value: row.value_json as Record<string, unknown>,
    label: row.label ? String(row.label) : null,
  }));
}

// ── Partitions (MemCube-style permissions) ──

export interface PartitionAccess {
  readable: boolean;
  writable: boolean;
}

const DEFAULT_PARTITIONS: Record<string, { readable: string[]; writable: string[] }> = {
  core: {
    readable: ["general", "resume", "evaluate", "offer", "interview", "profile"],
    writable: ["profile", "interview", "general"],
  },
  evaluation: {
    readable: ["general", "evaluate", "offer", "interview"],
    writable: ["evaluate", "offer"],
  },
  research: {
    readable: ["general", "evaluate"],
    writable: ["general"],
  },
};

export function resolvePartitionAccess(
  partition: string,
  agentId: string,
): PartitionAccess {
  const defaults = DEFAULT_PARTITIONS[partition] ?? DEFAULT_PARTITIONS.core;
  return {
    readable: defaults.readable.includes(agentId),
    writable: defaults.writable.includes(agentId),
  };
}

/** Assert a delegation/agent may write into a partition before recording. */
export function assertFactWritable(partition: string, agentId: string): void {
  if (!resolvePartitionAccess(partition, agentId).writable) {
    throw new Error(`Agent ${agentId} 不可写入记忆分区 ${partition}`);
  }
}

// Re-export for repository-style consumers.
export { getDataRepositories };
