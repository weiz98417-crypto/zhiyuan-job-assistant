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
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { getDataRepositories } from "@/lib/data-repositories";
import { getPostgresPool, withPostgresClient } from "@/lib/postgres";
import { assertMemoryExtractionGateOpen, assertMemoryGateOpen, assertMemoryWriteGateOpen } from "@/lib/memory/runtime-gates";

export type FactDecision = "ADD" | "UPDATE" | "DELETE" | "NOOP";

export interface FactCandidate {
  partition: string;
  subject: string;
  predicate: string;
  object: Record<string, unknown>;
  canonicalText: string;
  confidence: number;
  importance: number;
  currentPreference?: boolean;
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
  decisionId?: number;
}

export interface MemoryAccessContext {
  agentId: string;
  runId?: string;
}

export interface FactProvenance {
  factId: number;
  partition: string;
  predicate?: string;
  canonicalText: string;
  validAt: Date;
  createdAt?: Date;
  confidence?: number;
  importance?: number;
  invalidAt: Date | null;
  supersededBy: number | null;
  sourceEpisodeId: number | null;
  sourceType: string | null;
  sourceId: string | null;
  entityKeys?: string[];
  decisionId: number | null;
  decision: FactDecision;
  decisionReason: string | null;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertPrincipal(principal: ExecutionPrincipal): void {
  if (!principal.userId?.trim()) throw new Error("Memory user identity is required");
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

// ── Episodes ──

export async function recordEpisode(
  principal: ExecutionPrincipal,
  input: { sourceType: string; sourceId: string; content: Record<string, unknown> },
  client?: PoolClient,
): Promise<number> {
  assertPrincipal(principal);
  await assertMemoryExtractionGateOpen();
  if (!input.sourceType?.trim() || !input.sourceId?.trim()) {
    throw new Error("Memory episode source identity is required");
  }
  const pool = client || getPostgresPool();
  const idempotencyKey = digest(`${input.sourceType}\u0000${input.sourceId}`);
  const content = JSON.stringify(input.content);
  const result = await pool.query(
    `INSERT INTO memory_episodes (user_id, source_type, source_id, content_json, idempotency_key)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL
     DO NOTHING RETURNING id`,
    [principal.userId, input.sourceType, input.sourceId, content, idempotencyKey],
  );
  if (result.rows[0]) return Number(result.rows[0].id);
  const existing = await pool.query(
    `SELECT id, content_json = $3::jsonb AS same_content
     FROM memory_episodes WHERE user_id = $1 AND idempotency_key = $2`,
    [principal.userId, idempotencyKey, content],
  );
  if (!existing.rows[0]?.same_content) {
    throw new Error("Memory episode source was reused with different content");
  }
  return Number(existing.rows[0].id);
}

// ── Decision stage (stage 2 of the write pipeline) ──

/** Deterministic decision rules; used directly when the LLM is unavailable. */
export function decideFactOperationsDeterministic(
  existing: ExistingFact[],
  candidate: FactCandidate,
): FactOperation[] {
  const exact = existing.find((fact) => (candidate.currentPreference || fact.partition === candidate.partition)
    && fact.canonicalText === candidate.canonicalText);
  if (exact) {
    return [{ decision: "NOOP", candidate, targetFactId: exact.id, reason: "identical canonical fact already open" }];
  }
  const sameSubjectPredicate = existing.find(
    (fact) => (candidate.currentPreference || fact.partition === candidate.partition)
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
    (fact) => (candidate.currentPreference || fact.partition === candidate.partition)
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
  options: { episodeId?: number; agentId?: string; runId?: string; client?: PoolClient } | number = {},
): Promise<RecordedFact[]> {
  assertPrincipal(principal);
  await assertMemoryWriteGateOpen();
  const normalized = typeof options === "number" ? { episodeId: options } : options;
  const agentId = normalized.agentId?.trim();
  if (!agentId) throw new Error("Memory fact writes require an agent identity");
  if (!normalized.episodeId) throw new Error("Memory fact writes require a source episode");
  for (const operation of operations) {
    await assertFactWritableForPrincipal(principal, operation.candidate.partition, agentId);
  }

  const execute = async (client: PoolClient): Promise<RecordedFact[]> => {
      const episode = await client.query(
        "SELECT id FROM memory_episodes WHERE id = $1 AND user_id = $2",
        [normalized.episodeId, principal.userId],
      );
      if (!episode.rowCount) throw new Error("Source episode does not belong to memory principal");
      const recorded: RecordedFact[] = [];
      for (const op of operations) {
        const idempotencyKey = digest([
          normalized.episodeId,
          op.decision,
          op.targetFactId ?? "",
          op.candidate.partition,
          op.candidate.subject,
          op.candidate.predicate,
          op.candidate.canonicalText,
        ].join("\u0000"));
        const existingDecision = await client.query(
          `SELECT id, decision, COALESCE(result_fact_id, target_fact_id) AS fact_id
           FROM memory_fact_decisions WHERE user_id = $1 AND idempotency_key = $2`,
          [principal.userId, idempotencyKey],
        );
        if (existingDecision.rows[0]) {
          recorded.push({
            factId: Number(existingDecision.rows[0].fact_id || 0),
            decision: String(existingDecision.rows[0].decision) as FactDecision,
            decisionId: Number(existingDecision.rows[0].id),
          });
          continue;
        }
        const decision = await client.query(
          `INSERT INTO memory_fact_decisions
            (user_id, idempotency_key, source_episode_id, partition, agent_id,
             decision, decision_reason, target_fact_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [principal.userId, idempotencyKey, normalized.episodeId, op.candidate.partition,
            agentId, op.decision, op.reason, op.targetFactId ?? null],
        );
        const decisionId = Number(decision.rows[0].id);
        let resultFactId = op.targetFactId ?? null;
        if ((op.decision === "UPDATE" || op.decision === "DELETE") && op.targetFactId) {
          const invalidated = await client.query(
            `UPDATE memory_facts SET invalid_at = NOW(), invalidation_reason = $3
             WHERE id = $1 AND user_id = $2
               AND ($4::boolean OR partition = $5)
               AND invalid_at IS NULL RETURNING id`,
            [op.targetFactId, principal.userId, op.candidate.currentPreference === true, op.candidate.partition],
          );
          if (!invalidated.rowCount) throw new Error(`Open fact #${op.targetFactId} is no longer available`);
        }
        if (op.decision === "UPDATE" || op.decision === "ADD") {
          const inserted = await client.query(
            `INSERT INTO memory_facts
              (user_id, partition, subject, predicate, object_json, canonical_text,
               confidence, importance, source_episode_id, decision, decision_reason, decision_id)
             VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
            [principal.userId, op.candidate.partition, op.candidate.subject, op.candidate.predicate,
              JSON.stringify(op.candidate.object), op.candidate.canonicalText,
              clamp01(op.candidate.confidence), clamp01(op.candidate.importance), normalized.episodeId,
              op.decision, op.reason, decisionId],
          );
          resultFactId = Number(inserted.rows[0].id);
          await linkFactToEntities(client, principal.userId, resultFactId, op.candidate);
          await client.query(
            `INSERT INTO memory_fact_chunks (fact_id, user_id, chunk_index, content, embedding_status)
             VALUES ($1, $2, 0, $3, 'pending')
             ON CONFLICT (fact_id, chunk_index) DO UPDATE
             SET user_id = EXCLUDED.user_id, content = EXCLUDED.content,
                 embedding_status = CASE WHEN memory_fact_chunks.content = EXCLUDED.content
                   THEN memory_fact_chunks.embedding_status ELSE 'pending' END`,
            [resultFactId, principal.userId, op.candidate.canonicalText],
          );
          if (op.decision === "UPDATE" && op.targetFactId) {
            await client.query(
              "UPDATE memory_facts SET superseded_by = $1 WHERE id = $2 AND user_id = $3",
              [resultFactId, op.targetFactId, principal.userId],
            );
          }
        }
        await client.query(
          "UPDATE memory_fact_decisions SET result_fact_id = $1 WHERE id = $2",
          [resultFactId, decisionId],
        );
        recorded.push({ factId: Number(resultFactId || 0), decision: op.decision, decisionId });
      }
      return recorded;
  };
  if (normalized.client) return execute(normalized.client);
  return withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      const recorded = await execute(client);
      await client.query("COMMIT");
      return recorded;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function linkFactToEntities(
  client: { query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  userId: string,
  factId: number,
  candidate: FactCandidate,
): Promise<void> {
  const keys = new Set<string>();
  const subject = candidate.subject.trim();
  if (subject) keys.add(subject);
  for (const value of Object.values(candidate.object || {})) {
    if (typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 160) keys.add(value.trim());
  }
  for (const entityKey of keys) {
    const entity = await client.query(
      `INSERT INTO memory_entities (user_id, partition, entity_key, summary)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, partition, entity_key)
       DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [userId, candidate.partition, entityKey, candidate.canonicalText],
    );
    const entityId = Number(entity.rows[0]?.id);
    if (!entityId) continue;
    await client.query(
      `INSERT INTO memory_entity_facts (entity_id, fact_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [entityId, factId],
    );
    await rebuildEntitySummary(client, userId, entityId);
  }
}

async function rebuildEntitySummary(
  client: { query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  userId: string,
  entityId: number,
): Promise<void> {
  const result = await client.query(
    `SELECT f.canonical_text
     FROM memory_entity_facts ef
     JOIN memory_facts f ON f.id = ef.fact_id AND f.user_id = $1
     WHERE ef.entity_id = $2 AND f.invalid_at IS NULL
     ORDER BY f.valid_at DESC, f.id DESC
     LIMIT 12`,
    [userId, entityId],
  );
  const summary = result.rows.map((row) => String(row.canonical_text || "").trim()).filter(Boolean).join("; ").slice(0, 2_000);
  await client.query(
    `UPDATE memory_entities SET summary=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3`,
    [summary, entityId, userId],
  );
}

/** Full pipeline for one candidate: decide → apply. */
export async function recordFact(
  principal: ExecutionPrincipal,
  candidate: FactCandidate,
  options: { episodeId?: number; agentId?: string; runId?: string; useLlmDecision?: boolean; client?: PoolClient } = {},
): Promise<RecordedFact[]> {
  assertPrincipal(principal);
  if (!options.agentId) throw new Error("Memory fact writes require an agent identity");
  await assertFactWritableForPrincipal(principal, candidate.partition, options.agentId);
  const existing = await listOpenFacts(principal, {
    partition: candidate.currentPreference ? undefined : candidate.partition,
    subject: candidate.subject,
    agentId: options.agentId,
    limit: 10,
    client: options.client,
  });
  const operations = options.useLlmDecision === false
    ? decideFactOperationsDeterministic(existing, candidate)
    : await decideFactOperations(existing, candidate);
  return writeFactOperations(principal, operations, options);
}

// ── Read path ──

export async function listOpenFacts(
  principal: ExecutionPrincipal,
  input: { partition?: string; subject?: string; limit?: number; agentId?: string; client?: PoolClient } = {},
): Promise<ExistingFact[]> {
  assertPrincipal(principal);
  await assertMemoryGateOpen("read");
  const agentId = input.agentId || "user";
  if (input.partition) await assertFactReadableForPrincipal(principal, input.partition, agentId);
  const pool = input.client || getPostgresPool();
  const readablePartitions = await listReadablePartitionsForPrincipal(principal, agentId);
  if (!readablePartitions.length) throw new Error(`Agent ${agentId} has no readable memory partitions`);
  const result = await pool.query(
    `SELECT id, partition, subject, predicate, canonical_text, valid_at, confidence
     FROM memory_facts
     WHERE user_id = $1 AND invalid_at IS NULL
       AND ($2::text IS NULL OR partition = $2)
       AND ($3::text IS NULL OR subject = $3)
       AND partition = ANY($5::text[])
       AND NOT EXISTS (
         SELECT 1
         FROM memory_erasure_suppressions s
         JOIN memory_erasure_requests r ON r.id = s.request_id AND r.user_id = s.user_id
         WHERE s.user_id = memory_facts.user_id AND s.lifted_at IS NULL
           AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(r.scope_json->'factIds') id WHERE id = memory_facts.id::text)
       )
     ORDER BY importance DESC, valid_at DESC
     LIMIT $4`,
    [principal.userId, input.partition ?? null, input.subject ?? null, input.limit ?? 20, readablePartitions],
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

export async function listFactProvenance(
  principal: ExecutionPrincipal,
  factId: number,
  agentId = "user",
): Promise<FactProvenance | null> {
  assertPrincipal(principal);
  await assertMemoryGateOpen("read");
  const readablePartitions = await listReadablePartitionsForPrincipal(principal, agentId);
  if (!readablePartitions.length) return null;
  const pool = getPostgresPool();
  const result = await pool.query(
    `SELECT f.id, f.partition, f.predicate, f.canonical_text, f.valid_at, f.created_at, f.confidence, f.importance, f.invalid_at,
            f.superseded_by, f.source_episode_id, f.decision_id, f.decision,
            f.decision_reason, e.source_type, e.source_id,
            COALESCE(array_agg(DISTINCT me.entity_key) FILTER (WHERE me.entity_key IS NOT NULL), '{}') AS entity_keys
     FROM memory_facts f
     LEFT JOIN memory_episodes e ON e.id = f.source_episode_id AND e.user_id = f.user_id
     LEFT JOIN memory_entity_facts mef ON mef.fact_id = f.id
     LEFT JOIN memory_entities me ON me.id = mef.entity_id AND me.user_id = f.user_id
     WHERE f.id = $1 AND f.user_id = $2 AND f.partition = ANY($3::text[])
       AND NOT EXISTS (
         SELECT 1
         FROM memory_erasure_suppressions s
         JOIN memory_erasure_requests r ON r.id = s.request_id AND r.user_id = s.user_id
         WHERE s.user_id = f.user_id AND s.lifted_at IS NULL
           AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(r.scope_json->'factIds') id WHERE id = f.id::text)
       )
     GROUP BY f.id, e.source_type, e.source_id`,
    [factId, principal.userId, readablePartitions],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  await assertFactReadableForPrincipal(principal, String(row.partition), agentId);
  return {
    factId: Number(row.id), partition: String(row.partition), predicate: String(row.predicate || ""), canonicalText: String(row.canonical_text),
    validAt: new Date(String(row.valid_at)), invalidAt: row.invalid_at ? new Date(String(row.invalid_at)) : null,
    createdAt: row.created_at ? new Date(String(row.created_at)) : undefined,
    confidence: row.confidence == null ? undefined : Number(row.confidence),
    importance: row.importance == null ? undefined : Number(row.importance),
    supersededBy: row.superseded_by == null ? null : Number(row.superseded_by),
    sourceEpisodeId: row.source_episode_id == null ? null : Number(row.source_episode_id),
    sourceType: row.source_type == null ? null : String(row.source_type),
    sourceId: row.source_id == null ? null : String(row.source_id),
    entityKeys: Array.isArray(row.entity_keys) ? row.entity_keys.map(String) : [],
    decisionId: row.decision_id == null ? null : Number(row.decision_id),
    decision: String(row.decision) as FactDecision,
    decisionReason: row.decision_reason == null ? null : String(row.decision_reason),
  };
}

export async function listFactsByEpisode(
  principal: ExecutionPrincipal,
  episodeId: number,
  agentId = "user",
): Promise<FactProvenance[]> {
  assertPrincipal(principal);
  await assertMemoryGateOpen("read");
  const readablePartitions = await listReadablePartitionsForPrincipal(principal, agentId);
  if (!readablePartitions.length) return [];
  const pool = getPostgresPool();
  const result = await pool.query(
    `SELECT f.id, f.partition, f.predicate, f.canonical_text, f.valid_at, f.created_at, f.confidence, f.importance, f.invalid_at,
            f.superseded_by, f.source_episode_id, f.decision_id, f.decision,
            f.decision_reason, e.source_type, e.source_id,
            COALESCE(array_agg(DISTINCT me.entity_key) FILTER (WHERE me.entity_key IS NOT NULL), '{}') AS entity_keys
     FROM memory_facts f
     JOIN memory_episodes e ON e.id = f.source_episode_id AND e.user_id = f.user_id
     LEFT JOIN memory_entity_facts mef ON mef.fact_id = f.id
     LEFT JOIN memory_entities me ON me.id = mef.entity_id AND me.user_id = f.user_id
     WHERE f.source_episode_id = $1 AND f.user_id = $2
       AND f.partition = ANY($3::text[])
       AND NOT EXISTS (
         SELECT 1
         FROM memory_erasure_suppressions s
         JOIN memory_erasure_requests r ON r.id = s.request_id AND r.user_id = s.user_id
         WHERE s.user_id = f.user_id AND s.lifted_at IS NULL
           AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(r.scope_json->'factIds') id WHERE id = f.id::text)
       )
     GROUP BY f.id, e.source_type, e.source_id
     ORDER BY f.created_at, f.id`,
    [episodeId, principal.userId, readablePartitions],
  );
  const facts: FactProvenance[] = [];
  for (const row of result.rows as Record<string, unknown>[]) {
    await assertFactReadableForPrincipal(principal, String(row.partition), agentId);
    facts.push({
      factId: Number(row.id), partition: String(row.partition), predicate: String(row.predicate || ""), canonicalText: String(row.canonical_text),
      validAt: new Date(String(row.valid_at)), invalidAt: row.invalid_at ? new Date(String(row.invalid_at)) : null,
      createdAt: row.created_at ? new Date(String(row.created_at)) : undefined,
      confidence: row.confidence == null ? undefined : Number(row.confidence),
      importance: row.importance == null ? undefined : Number(row.importance),
      supersededBy: row.superseded_by == null ? null : Number(row.superseded_by),
      sourceEpisodeId: row.source_episode_id == null ? null : Number(row.source_episode_id),
      sourceType: row.source_type == null ? null : String(row.source_type),
      sourceId: row.source_id == null ? null : String(row.source_id),
      entityKeys: Array.isArray(row.entity_keys) ? row.entity_keys.map(String) : [],
      decisionId: row.decision_id == null ? null : Number(row.decision_id),
      decision: String(row.decision) as FactDecision,
      decisionReason: row.decision_reason == null ? null : String(row.decision_reason),
    });
  }
  return facts;
}

/**
 * Hybrid fact retrieval: vector similarity + Postgres full-text, fused with
 * reciprocal rank fusion (k=60).
 */
export async function searchFactsHybrid(
  principal: ExecutionPrincipal,
  input: { queryText: string; queryEmbedding: number[]; partition?: string; limit?: number; agentId?: string; sourceTypes?: string[] },
): Promise<Array<{
  factId: number;
  canonicalText: string;
  score: number;
  entityScore: number;
  confidence: number;
  importance: number;
  validAt: Date;
  sourceType: string | null;
  sourceId: string | null;
}>> {
  assertPrincipal(principal);
  await assertMemoryGateOpen("read");
  const agentId = input.agentId || "user";
  if (input.partition) await assertFactReadableForPrincipal(principal, input.partition, agentId);
  const readablePartitions = await listReadablePartitionsForPrincipal(principal, agentId);
  if (!readablePartitions.length) throw new Error(`Agent ${agentId} has no readable memory partitions`);
  const pool = getPostgresPool();
  const limit = input.limit ?? 8;
  const vector = `[${input.queryEmbedding.join(",")}]`;
  const result = await pool.query(
    `WITH vector_hits AS (
       SELECT fact_id, ROW_NUMBER() OVER (ORDER BY embedding <=> $1::vector) AS rank
       FROM memory_fact_chunks
       JOIN memory_facts vf ON vf.id = memory_fact_chunks.fact_id AND vf.user_id = $2
       LEFT JOIN memory_episodes ve ON ve.id = vf.source_episode_id AND ve.user_id = vf.user_id
       WHERE memory_fact_chunks.user_id = $2 AND embedding_status = 'embedded'
         AND vf.invalid_at IS NULL AND vf.partition = ANY($5::text[])
         AND ($6::text[] IS NULL OR ve.source_type = ANY($6::text[]))
     ),
     text_hits AS (
       SELECT f.id AS fact_id,
              ROW_NUMBER() OVER (ORDER BY ts_rank(to_tsvector('simple', c.content), plainto_tsquery('simple', $3)) DESC) AS rank
       FROM memory_facts f
       JOIN memory_fact_chunks c ON c.fact_id = f.id
       LEFT JOIN memory_episodes te ON te.id = f.source_episode_id AND te.user_id = f.user_id
       WHERE f.user_id = $2 AND f.invalid_at IS NULL
         AND f.partition = ANY($5::text[])
         AND ($6::text[] IS NULL OR te.source_type = ANY($6::text[]))
         AND to_tsvector('simple', c.content) @@ plainto_tsquery('simple', $3)
     ),
     entity_hits AS (
       SELECT mef.fact_id,
              ROW_NUMBER() OVER (ORDER BY ts_rank(
                to_tsvector('simple', COALESCE(me.entity_key, '') || ' ' || COALESCE(me.summary, '')),
                plainto_tsquery('simple', $3)
              ) DESC) AS rank
       FROM memory_entity_facts mef
       JOIN memory_entities me ON me.id = mef.entity_id AND me.user_id = $2
       JOIN memory_facts ef ON ef.id = mef.fact_id AND ef.user_id = $2
       LEFT JOIN memory_episodes ee ON ee.id = ef.source_episode_id AND ee.user_id = ef.user_id
       WHERE ef.invalid_at IS NULL
         AND ef.partition = ANY($5::text[])
         AND ($6::text[] IS NULL OR ee.source_type = ANY($6::text[]))
         AND to_tsvector('simple', COALESCE(me.entity_key, '') || ' ' || COALESCE(me.summary, ''))
           @@ plainto_tsquery('simple', $3)
     ),
     fusion AS (
       SELECT fact_id, SUM(1.0 / (60 + rank)) AS score FROM (
         SELECT fact_id, rank FROM (SELECT fact_id, rank FROM vector_hits LIMIT $4) vector_limited
         UNION ALL
         SELECT fact_id, rank FROM (SELECT fact_id, rank FROM text_hits LIMIT $4) text_limited
         UNION ALL
         SELECT fact_id, rank FROM (SELECT fact_id, rank FROM entity_hits LIMIT $4) entity_limited
       ) combined GROUP BY fact_id
     ),
     entity_fusion AS (
       SELECT fact_id, MAX(1.0 / (60 + rank)) AS entity_score
       FROM entity_hits
       GROUP BY fact_id
     )
     SELECT fusion.fact_id, fusion.score, COALESCE(entity_fusion.entity_score, 0) AS entity_score,
            f.canonical_text, f.confidence, f.importance, f.valid_at,
            e.source_type, e.source_id
     FROM fusion
     JOIN memory_facts f ON f.id = fusion.fact_id
     LEFT JOIN memory_episodes e ON e.id = f.source_episode_id AND e.user_id = f.user_id
     LEFT JOIN entity_fusion ON entity_fusion.fact_id = fusion.fact_id
     WHERE f.user_id = $2 AND f.invalid_at IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM memory_erasure_suppressions s
         JOIN memory_erasure_requests r ON r.id = s.request_id AND r.user_id = s.user_id
         WHERE s.user_id = f.user_id AND s.lifted_at IS NULL
           AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(r.scope_json->'factIds') id WHERE id = f.id::text)
       )
     ORDER BY fusion.score DESC
     LIMIT $4`,
    [vector, principal.userId, input.queryText, limit * 3, readablePartitions, input.sourceTypes?.length ? input.sourceTypes : null],
  );
  return result.rows.map((row) => ({
    factId: Number(row.fact_id),
    canonicalText: String(row.canonical_text),
    score: Number(row.score),
    entityScore: Number(row.entity_score || 0),
    confidence: Number(row.confidence || 0),
    importance: Number(row.importance || 0),
    validAt: new Date(row.valid_at),
    sourceType: row.source_type == null ? null : String(row.source_type),
    sourceId: row.source_id == null ? null : String(row.source_id),
  }));
}

// ── Profile blocks (structured, never vectorized) ──

export async function upsertProfileBlock(
  principal: ExecutionPrincipal,
  input: { topic: string; subTopic: string; value: Record<string, unknown>; label?: string; confidence?: number; source?: string; agentId?: string; factIds?: number[]; reviewDueAt?: string | Date | null },
): Promise<void> {
  assertPrincipal(principal);
  await assertMemoryWriteGateOpen();
  const source = input.source?.trim();
  if (!source || source === "agent" || source === "unknown") throw new Error("Profile blocks require a provenance source");
  const factIds = Array.from(new Set((input.factIds || []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)));
  if (!factIds.length) throw new Error("Profile blocks require confirmed fact provenance");
  const agentId = input.agentId || "user";
  await assertFactWritableForPrincipal(principal, "private", agentId);
  const pool = getPostgresPool();
  const factCheck = await pool.query(
    `SELECT id FROM memory_facts
     WHERE user_id=$1 AND invalid_at IS NULL AND id=ANY($2::bigint[]) AND partition='private'`,
    [principal.userId, factIds],
  );
  if (factCheck.rowCount !== factIds.length) throw new Error("Profile block facts must be active private facts");
  const reviewDueAt = input.reviewDueAt === undefined
    ? isVolatileProfileField(input.topic, input.subTopic) ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) : null
    : input.reviewDueAt;
  await pool.query(
    `INSERT INTO profile_blocks (user_id, topic, sub_topic, value_json, label, confidence, source, review_due_at, last_confirmed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (user_id, topic, sub_topic)
     DO UPDATE SET value_json = EXCLUDED.value_json,
       label = EXCLUDED.label,
       confidence = EXCLUDED.confidence,
       review_due_at = EXCLUDED.review_due_at,
       last_confirmed_at = NOW(),
       updated_at = NOW()`,
    [
      principal.userId,
      input.topic,
      input.subTopic,
      JSON.stringify(input.value),
      input.label ?? null,
      clamp01(input.confidence ?? 0.6),
      source,
      reviewDueAt,
    ],
  );
  if (factIds.length) {
    const profileBlock = await pool.query(
      "SELECT id FROM profile_blocks WHERE user_id = $1 AND topic = $2 AND sub_topic = $3",
      [principal.userId, input.topic, input.subTopic],
    );
    for (const factId of factIds) {
      await pool.query(
        `INSERT INTO memory_profile_block_facts (profile_block_id, fact_id)
         SELECT $1, id FROM memory_facts WHERE id = $2 AND user_id = $3
         ON CONFLICT DO NOTHING`,
        [profileBlock.rows[0]?.id, factId, principal.userId],
      );
    }
  }
}

export async function getProfileBlocks(
  principal: ExecutionPrincipal,
  topic?: string,
  agentId = "user",
  options: { includeReviewDue?: boolean } = {},
): Promise<Array<{ topic: string; subTopic: string; value: Record<string, unknown>; label: string | null; source: string; factIds: number[]; lastConfirmedAt: string | null; reviewDueAt: string | null; reviewDue: boolean }>> {
  assertPrincipal(principal);
  await assertMemoryGateOpen("read");
  await assertFactReadableForPrincipal(principal, "private", agentId);
  const pool = getPostgresPool();
  const result = await pool.query(
    `SELECT pb.topic, pb.sub_topic, pb.value_json, pb.label, pb.source, pb.review_due_at, pb.last_confirmed_at,
            COALESCE(array_agg(pbf.fact_id) FILTER (WHERE pbf.fact_id IS NOT NULL AND pf.id IS NOT NULL), '{}') AS fact_ids
     FROM profile_blocks pb
     LEFT JOIN memory_profile_block_facts pbf ON pbf.profile_block_id = pb.id
     LEFT JOIN memory_facts pf ON pf.id = pbf.fact_id
       AND pf.user_id = pb.user_id AND pf.invalid_at IS NULL
     WHERE pb.user_id = $1 AND ($2::text IS NULL OR pb.topic = $2)
       AND ($3::boolean OR pb.review_due_at IS NULL OR pb.review_due_at > NOW())
       AND NOT EXISTS (
         SELECT 1
         FROM memory_profile_block_facts pbf
         JOIN memory_erasure_suppressions s ON s.user_id = $1 AND s.lifted_at IS NULL
         JOIN memory_erasure_requests r ON r.id = s.request_id AND r.user_id = s.user_id
         WHERE pbf.profile_block_id = pb.id
           AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(r.scope_json->'factIds') id WHERE id = pbf.fact_id::text)
       )
     GROUP BY pb.id
     HAVING COUNT(pf.id) > 0
     ORDER BY pb.topic, pb.sub_topic`,
    [principal.userId, topic ?? null, options.includeReviewDue === true],
  );
  return result.rows.map((row) => ({
    topic: String(row.topic),
    subTopic: String(row.sub_topic),
      value: row.value_json as Record<string, unknown>,
      label: row.label ? String(row.label) : null,
      source: String(row.source || ""),
      factIds: Array.isArray(row.fact_ids) ? row.fact_ids.map(Number) : [],
      lastConfirmedAt: row.last_confirmed_at ? new Date(row.last_confirmed_at).toISOString() : null,
      reviewDueAt: row.review_due_at ? new Date(row.review_due_at).toISOString() : null,
      reviewDue: Boolean(row.review_due_at && new Date(row.review_due_at).getTime() <= Date.now()),
    }));
}

function isVolatileProfileField(topic: string, subTopic: string): boolean {
  return /(?:city|location|salary|compensation|薪资|城市|地点|工作许可|work\s*authorization)/i.test(`${topic}:${subTopic}`);
}

// ── Partitions (MemCube-style permissions) ──

export interface PartitionAccess {
  readable: boolean;
  writable: boolean;
}

const DEFAULT_PARTITIONS: Record<string, { readable: string[]; writable: string[] }> = {
  core: {
    readable: ["user", "general", "resume", "evaluate", "offer", "interview", "profile"],
    writable: ["user", "profile", "interview", "general"],
  },
  evaluation: {
    readable: ["user", "general", "evaluate", "offer", "interview"],
    writable: ["evaluate", "offer"],
  },
  research: {
    readable: ["user", "general", "evaluate"],
    writable: ["general"],
  },
  private: {
    readable: ["user", "profile"],
    writable: ["user", "profile"],
  },
};

export function resolvePartitionAccess(
  partition: string,
  agentId: string,
): PartitionAccess {
  const defaults = DEFAULT_PARTITIONS[partition];
  if (!defaults || !agentId.trim()) return { readable: false, writable: false };
  return {
    readable: defaults.readable.includes(agentId),
    writable: defaults.writable.includes(agentId),
  };
}

type PartitionRow = {
  partition: string;
  readable_agents: unknown;
  writable_agents: unknown;
};

function normalizeAgentList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

/**
 * Resolve partition ACLs from the per-user memory_partitions table. The
 * static map remains a compatibility fallback for databases created before
 * the M5 partition rows were provisioned; once a user has any explicit row,
 * missing partitions fail closed.
 */
async function loadPartitionAccessForPrincipal(
  principal: ExecutionPrincipal,
  partition: string,
  agentId: string,
): Promise<PartitionAccess> {
  assertPrincipal(principal);
  if (!agentId.trim()) return { readable: false, writable: false };
  await ensureUserPartitionRows(principal);
  let rows: PartitionRow[];
  try {
    const result = await getPostgresPool().query(
      `SELECT partition, readable_agents, writable_agents
       FROM memory_partitions WHERE user_id = $1`,
      [principal.userId],
    );
    rows = result.rows as PartitionRow[];
  } catch (error) {
    if ((error as { code?: string })?.code === "42P01") return resolvePartitionAccess(partition, agentId);
    throw error;
  }
  if (rows.length === 0) return resolvePartitionAccess(partition, agentId);
  const row = rows.find((item) => String(item.partition) === partition);
  if (!row) return { readable: false, writable: false };
  const readable = normalizeAgentList(row.readable_agents);
  const writable = normalizeAgentList(row.writable_agents);
  return { readable: readable.includes(agentId), writable: writable.includes(agentId) };
}

async function listReadablePartitionsForPrincipal(
  principal: ExecutionPrincipal,
  agentId: string,
): Promise<string[]> {
  assertPrincipal(principal);
  if (!agentId.trim()) return [];
  await ensureUserPartitionRows(principal);
  try {
    const result = await getPostgresPool().query(
      `SELECT partition, readable_agents FROM memory_partitions WHERE user_id = $1`,
      [principal.userId],
    );
    const rows = result.rows as PartitionRow[];
    if (rows.length > 0) {
      return rows
        .filter((row) => normalizeAgentList(row.readable_agents).includes(agentId))
        .map((row) => String(row.partition));
    }
  } catch (error) {
    if ((error as { code?: string })?.code !== "42P01") throw error;
  }
  return listReadablePartitions(agentId);
}

async function ensureUserPartitionRows(principal: ExecutionPrincipal): Promise<void> {
  const defaults = Object.entries(DEFAULT_PARTITIONS).map(([partition, access]) => ({
    partition,
    readable_agents: access.readable,
    writable_agents: access.writable,
  }));
  try {
    await getPostgresPool().query(
      `INSERT INTO memory_partitions (user_id, partition, description, readable_agents, writable_agents)
       SELECT $1, item.partition, 'M5 default partition', item.readable_agents, item.writable_agents
       FROM jsonb_to_recordset($2::jsonb) AS item(partition text, readable_agents text[], writable_agents text[])
       ON CONFLICT (user_id, partition) DO NOTHING`,
      [principal.userId, JSON.stringify(defaults)],
    );
  } catch (error) {
    if ((error as { code?: string })?.code !== "42P01") throw error;
  }
}

async function assertFactReadableForPrincipal(
  principal: ExecutionPrincipal,
  partition: string,
  agentId: string,
): Promise<void> {
  const access = await loadPartitionAccessForPrincipal(principal, partition, agentId);
  if (!access.readable) throw new Error(`Agent ${agentId} 不可读取记忆分区 ${partition}`);
}

async function assertFactWritableForPrincipal(
  principal: ExecutionPrincipal,
  partition: string,
  agentId: string,
): Promise<void> {
  const access = await loadPartitionAccessForPrincipal(principal, partition, agentId);
  if (!access.writable) throw new Error(`Agent ${agentId} 不可写入记忆分区 ${partition}`);
}

export function assertFactReadable(partition: string, agentId: string): void {
  if (!resolvePartitionAccess(partition, agentId).readable) {
    throw new Error(`Agent ${agentId} 不可读取记忆分区 ${partition}`);
  }
}

export function listReadablePartitions(agentId: string): string[] {
  return Object.keys(DEFAULT_PARTITIONS).filter((partition) => resolvePartitionAccess(partition, agentId).readable);
}

export async function getReadableMemoryPartitions(
  principal: ExecutionPrincipal,
  agentId = "user",
): Promise<string[]> {
  assertPrincipal(principal);
  return listReadablePartitionsForPrincipal(principal, agentId);
}

/** Assert a delegation/agent may write into a partition before recording. */
export function assertFactWritable(partition: string, agentId: string): void {
  if (!resolvePartitionAccess(partition, agentId).writable) {
    throw new Error(`Agent ${agentId} 不可写入记忆分区 ${partition}`);
  }
}

// Re-export for repository-style consumers.
export { getDataRepositories };
