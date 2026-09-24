import type { PoolClient } from "pg";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { isPostgresConfigured, withPostgresClient } from "../postgres";
import {
  buildMemoryRetrievalQuery,
  chunkMemorySource,
  createEmbeddingProvider,
  embedChunksWithRetry,
  rerankMemoryRows,
  vectorToSql,
  type EmbeddedMemoryChunk,
  type EmbeddingProvider,
  type MemoryRetrievalRow,
  type MemorySnippet,
  type MemorySourceFilter,
  type MemorySourceInput,
} from "./vector-memory";
import { createMastraSessionContract } from "@/lib/memory/mastra-adapter";
import { assertMemoryGateOpen, assertMemoryWriteGateOpen } from "@/lib/memory/runtime-gates";

export type MemoryItemStatus = "candidate" | "active" | "rejected" | "archived";

export interface MemoryItemInput {
  userId: string;
  memoryType: string;
  canonicalText: string;
  status?: MemoryItemStatus;
  confidence?: number;
  importance?: number;
  sourceCount?: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryEvidenceInput {
  userId: string;
  memoryItemId: number;
  sourceType: string;
  sourceId: string | number;
  quote: string;
  extractionMethod?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface RetrieveMemoryInput {
  userId: string;
  query?: string;
  queryEmbedding?: number[];
  sourceTypes?: MemorySourceFilter[];
  limit?: number;
  provider?: EmbeddingProvider;
}

export interface MemoryItemRecord {
  id: number;
  user_id: string;
  memory_type: string;
  canonical_text: string;
  status: MemoryItemStatus;
  confidence: number;
  importance: number;
  source_count: number;
  metadata_json?: string | Record<string, unknown>;
  last_seen_at?: string | Date;
  created_at?: string | Date;
  updated_at?: string | Date;
}

export async function createMemoryItem(input: MemoryItemInput): Promise<number> {
  await assertMemoryWriteGateOpen();
  return withPostgresClient(async (client) => {
    const expected = {
      status: input.status || "candidate",
      confidence: clamp01(input.confidence ?? 0.5),
      importance: clamp01(input.importance ?? 0.5),
      sourceCount: Math.max(0, Math.floor(input.sourceCount ?? 0)),
      metadata: input.metadata || {},
    };
    const result = await client.query(`
      INSERT INTO memory_items (
        user_id, memory_type, canonical_text, status, confidence, importance, source_count, metadata_json
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
      RETURNING id
    `, [
      input.userId,
      input.memoryType,
      input.canonicalText,
      expected.status,
      expected.confidence,
      expected.importance,
      expected.sourceCount,
      JSON.stringify(expected.metadata),
    ]);
    const id = Number(result.rows[0].id);
    const readBack = (await client.query(`
      SELECT id, user_id, memory_type, canonical_text, status, confidence, importance, source_count, metadata_json
      FROM memory_items
      WHERE id=$1 AND user_id=$2
    `, [id, input.userId])).rows[0] as Record<string, unknown> | undefined;
    if (!memoryItemReadBackMatches(readBack, input, expected, id)) {
      throw new Error("memory item read-back verification failed");
    }
    return id;
  });
}

export async function addMemoryEvidence(input: MemoryEvidenceInput): Promise<number> {
  await assertMemoryWriteGateOpen();
  return withPostgresClient(async (client) => {
    const expected = {
      sourceId: String(input.sourceId),
      extractionMethod: input.extractionMethod || "unknown",
      confidence: clamp01(input.confidence ?? 0.5),
      metadata: input.metadata || {},
    };
    const result = await client.query(`
      INSERT INTO memory_evidence (
        user_id, memory_item_id, source_type, source_id, quote, extraction_method, confidence, metadata_json
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
      RETURNING id
    `, [
      input.userId,
      input.memoryItemId,
      input.sourceType,
      expected.sourceId,
      input.quote,
      expected.extractionMethod,
      expected.confidence,
      JSON.stringify(expected.metadata),
    ]);
    const id = Number(result.rows[0].id);
    const readBack = (await client.query(`
      SELECT id, user_id, memory_item_id, source_type, source_id, quote, extraction_method, confidence, metadata_json
      FROM memory_evidence
      WHERE id=$1 AND user_id=$2
    `, [id, input.userId])).rows[0] as Record<string, unknown> | undefined;
    if (!memoryEvidenceReadBackMatches(readBack, input, expected, id)) {
      throw new Error("memory evidence read-back verification failed");
    }
    return id;
  });
}

export async function indexMemorySource(
  source: MemorySourceInput,
  provider: EmbeddingProvider = createEmbeddingProvider(),
  options: { maxRetries?: number } = {},
): Promise<EmbeddedMemoryChunk[]> {
  const chunks = chunkMemorySource(source);
  const embedded = await embedChunksWithRetry(chunks, provider, options);
  await upsertEmbeddedMemoryChunks(embedded);
  return embedded;
}

export async function indexMemorySourceBestEffort(
  source: MemorySourceInput,
  provider?: EmbeddingProvider,
  options: { maxRetries?: number; fallbackReason?: string } = {},
): Promise<EmbeddedMemoryChunk[]> {
  const chunks = chunkMemorySource(source);
  let activeProvider = provider;
  if (!activeProvider) {
    try {
      activeProvider = createEmbeddingProvider();
    } catch (error) {
      const reason = options.fallbackReason || (error instanceof Error ? error.message : String(error));
      activeProvider = {
        model: "embedding-unavailable",
        dimension: 1536,
        async embed() {
          throw new Error(reason);
        },
      };
    }
  }
  const embedded = await embedChunksWithRetry(chunks, activeProvider, options);
  await upsertEmbeddedMemoryChunks(embedded);
  return embedded;
}

export async function upsertEmbeddedMemoryChunks(chunks: EmbeddedMemoryChunk[]): Promise<number> {
  if (!chunks.length) return 0;
  await assertMemoryWriteGateOpen();

  return withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      let count = 0;
      for (const item of chunks) {
        const { chunk } = item;
        const embedding = item.embedding ? vectorToSql(item.embedding) : null;
        await client.query(`
          INSERT INTO memory_chunks (
            user_id, source_type, source_id, chunk_index, chunk_text, content_hash,
            embedding_model, embedding_dimension, embedding, embedding_status,
            failure_reason, retry_count, metadata_json, embedded_at, updated_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::vector,$10,$11,$12,$13::jsonb,$14,now())
          ON CONFLICT (user_id, source_type, source_id, chunk_index)
          DO UPDATE SET
            chunk_text = EXCLUDED.chunk_text,
            content_hash = EXCLUDED.content_hash,
            embedding_model = EXCLUDED.embedding_model,
            embedding_dimension = EXCLUDED.embedding_dimension,
            embedding = EXCLUDED.embedding,
            embedding_status = EXCLUDED.embedding_status,
            failure_reason = EXCLUDED.failure_reason,
            retry_count = EXCLUDED.retry_count,
            metadata_json = EXCLUDED.metadata_json,
            embedded_at = EXCLUDED.embedded_at,
            updated_at = now()
        `, [
          chunk.userId,
          chunk.sourceType,
          chunk.sourceId,
          chunk.chunkIndex,
          chunk.chunkText,
          chunk.contentHash,
          item.embeddingModel,
          item.embeddingDimension,
          embedding,
          item.embeddingStatus,
          item.failureReason,
          item.retryCount,
          JSON.stringify(chunk.metadata || {}),
          item.embeddingStatus === "embedded" ? new Date().toISOString() : null,
        ]);
        count += 1;
      }
      const readBackVerified = await memoryChunksReadBackMatch(client, chunks);
      if (!readBackVerified) throw new Error("memory chunks read-back verification failed");
      await client.query("COMMIT");
      return count;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function retrieveMemorySnippets(input: RetrieveMemoryInput): Promise<MemorySnippet[]> {
  await assertMemoryReadGateOpen();
  const embedding = input.queryEmbedding || await embedQuery(input.query || "", input.provider);
  const requestedLimit = input.limit ?? 8;
  const query = buildMemoryRetrievalQuery({
    userId: input.userId,
    queryEmbedding: embedding,
    sourceTypes: input.sourceTypes,
    limit: Math.min(20, Math.max(requestedLimit * 3, requestedLimit)),
  });

  const rows = await withPostgresClient(async (client) => {
    const result = await client.query(query.sql, query.params);
    return result.rows as MemoryRetrievalRow[];
  });

  return rerankMemoryRows(rows, input.userId, requestedLimit);
}

export async function listMemoryItems(input: {
  userId: string;
  statuses?: MemoryItemStatus[];
  memoryTypes?: string[];
  limit?: number;
}): Promise<MemoryItemRecord[]> {
  const statuses = input.statuses?.length ? input.statuses : ["active", "candidate"];
  const params: unknown[] = [input.userId, statuses, Math.max(1, Math.min(input.limit ?? 12, 30))];
  const clauses = ["user_id = $1", "status = ANY($2::text[])"];

  if (input.memoryTypes?.length) {
    params.splice(2, 0, input.memoryTypes);
    clauses.push("memory_type = ANY($3::text[])");
  }

  const limitParam = params.length;
  return withPostgresClient(async (client) => {
    const result = await client.query(`
      SELECT id, user_id, memory_type, canonical_text, status, confidence, importance,
        source_count, metadata_json, last_seen_at, created_at, updated_at
      FROM memory_items
      WHERE ${clauses.join(" AND ")}
      ORDER BY importance DESC, confidence DESC, last_seen_at DESC
      LIMIT $${limitParam}
    `, params);
    return result.rows as MemoryItemRecord[];
  });
}

async function embedQuery(query: string, provider?: EmbeddingProvider): Promise<number[]> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error("Memory retrieval requires query or queryEmbedding");
  const activeProvider = provider || createEmbeddingProvider();
  const [embedding] = await activeProvider.embed([trimmed]);
  return embedding;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((next, key) => {
      next[key] = sortJson((value as Record<string, unknown>)[key]);
      return next;
    }, {});
}

function canonicalJson(value: unknown, fallback: unknown): string {
  let parsed = value;
  if (parsed === undefined || parsed === null || parsed === "") parsed = fallback;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = fallback;
    }
  }
  return JSON.stringify(sortJson(parsed));
}

function numberValue(value: unknown, fallback = 0): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function memoryItemReadBackMatches(
  row: Record<string, unknown> | undefined,
  input: MemoryItemInput,
  expected: { status: MemoryItemStatus; confidence: number; importance: number; sourceCount: number; metadata: Record<string, unknown> },
  expectedId: number,
): boolean {
  return !!row &&
    Number(row.id) === Number(expectedId) &&
    String(row.user_id || "") === input.userId &&
    String(row.memory_type || "") === input.memoryType &&
    String(row.canonical_text || "") === input.canonicalText &&
    String(row.status || "") === expected.status &&
    numberValue(row.confidence) === expected.confidence &&
    numberValue(row.importance) === expected.importance &&
    numberValue(row.source_count) === expected.sourceCount &&
    canonicalJson(row.metadata_json, {}) === canonicalJson(expected.metadata, {});
}

function memoryEvidenceReadBackMatches(
  row: Record<string, unknown> | undefined,
  input: MemoryEvidenceInput,
  expected: { sourceId: string; extractionMethod: string; confidence: number; metadata: Record<string, unknown> },
  expectedId: number,
): boolean {
  return !!row &&
    Number(row.id) === Number(expectedId) &&
    String(row.user_id || "") === input.userId &&
    Number(row.memory_item_id) === Number(input.memoryItemId) &&
    String(row.source_type || "") === input.sourceType &&
    String(row.source_id || "") === expected.sourceId &&
    String(row.quote || "") === input.quote &&
    String(row.extraction_method || "") === expected.extractionMethod &&
    numberValue(row.confidence) === expected.confidence &&
    canonicalJson(row.metadata_json, {}) === canonicalJson(expected.metadata, {});
}

async function memoryChunksReadBackMatch(client: PoolClient, chunks: EmbeddedMemoryChunk[]): Promise<boolean> {
  const groups = new Map<string, EmbeddedMemoryChunk[]>();
  for (const chunk of chunks) {
    const key = [
      chunk.chunk.userId,
      chunk.chunk.sourceType,
      chunk.chunk.sourceId,
    ].join("\u001f");
    groups.set(key, [...(groups.get(key) || []), chunk]);
  }

  for (const group of groups.values()) {
    const first = group[0].chunk;
    const rows = (await client.query(`
      SELECT chunk_index, content_hash, embedding_status, retry_count
      FROM memory_chunks
      WHERE user_id=$1 AND source_type=$2 AND source_id=$3
    `, [first.userId, first.sourceType, first.sourceId])).rows as Array<Record<string, unknown>>;
    const byIndex = new Map(rows.map((row) => [Number(row.chunk_index), row]));
    for (const item of group) {
      const row = byIndex.get(item.chunk.chunkIndex);
      if (!row) return false;
      if (String(row.content_hash || "") !== item.chunk.contentHash) return false;
      if (String(row.embedding_status || "") !== item.embeddingStatus) return false;
      if (numberValue(row.retry_count) !== item.retryCount) return false;
    }
  }
  return true;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

export async function assertMemoryReadGateOpen(): Promise<void> {
  await assertMemoryGateOpen("read");
}

export interface SessionMemoryMessage { id?: string; role: string; content: string; createdAt?: string; metadata?: Record<string, unknown> }
export interface SessionMemoryIdentity { userId: string; conversationId: number }
export interface SessionMemoryAdapter { readonly provider: "postgres" | "mastra"; append(identity: SessionMemoryIdentity, messages: SessionMemoryMessage[], requestId?: string): Promise<void>; load(identity: SessionMemoryIdentity): Promise<SessionMemoryMessage[]>; eraseTarget(identity: SessionMemoryIdentity, targetText: string): Promise<{ redactedCount: number }> }
export class SessionMemoryConfigurationError extends Error { constructor(message: string) { super(message); this.name = "SessionMemoryConfigurationError"; } }

function assertSessionIdentity(identity: SessionMemoryIdentity): void {
  if (!identity.userId?.trim() || !Number.isInteger(identity.conversationId) || identity.conversationId <= 0) {
    throw new Error("Session memory requires a user and positive conversation id");
  }
}

function normalizeSessionMessage(message: SessionMemoryMessage): SessionMemoryMessage {
  if (!message.role?.trim() || typeof message.content !== "string") throw new Error("Session memory messages require role and content");
  return { ...message, role: message.role.trim(), createdAt: message.createdAt || new Date().toISOString() };
}

function parseSessionMessages(value: unknown): SessionMemoryMessage[] {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(value) ? value.filter((item): item is SessionMemoryMessage => Boolean(item && typeof item === "object")) : [];
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sessionMessageKey(message: SessionMemoryMessage): string {
  return message.id || `${message.role}:${message.createdAt || ""}:${message.content}`;
}

function sessionMessageKeys(message: SessionMemoryMessage): string[] {
  return [
    sessionMessageKey(message),
    `${message.role}:${message.createdAt || ""}:${message.content}`,
  ];
}

const POSTGRES_SESSION_MEMORY_TYPE = "execution_conversation";

function parseStoredSessionMessages(value: unknown): SessionMemoryMessage[] {
  if (typeof value !== "string") return parseSessionMessages(value);
  try { return parseSessionMessages(JSON.parse(value)); } catch { return []; }
}

function redactSessionValue(value: unknown, target: string): { value: unknown; redactedCount: number } {
  if (typeof value === "string") {
    const redactedCount = value.split(target).length - 1;
    return redactedCount ? { value: value.split(target).join("[已删除]"), redactedCount } : { value, redactedCount: 0 };
  }
  if (Array.isArray(value)) {
    let redactedCount = 0;
    const next = value.map((item) => {
      const result = redactSessionValue(item, target);
      redactedCount += result.redactedCount;
      return result.value;
    });
    return { value: next, redactedCount };
  }
  if (value && typeof value === "object") {
    let redactedCount = 0;
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const result = redactSessionValue(item, target);
      redactedCount += result.redactedCount;
      next[key] = result.value;
    }
    return { value: next, redactedCount };
  }
  return { value, redactedCount: 0 };
}

function containsSessionText(value: unknown, target: string): boolean {
  if (typeof value === "string") return value.includes(target);
  if (Array.isArray(value)) return value.some((item) => containsSessionText(item, target));
  if (value && typeof value === "object") return Object.values(value).some((item) => containsSessionText(item, target));
  return false;
}

export async function redactSessionMessagesForUser(
  client: PoolClient,
  userId: string,
  targetText: string,
): Promise<number> {
  const target = targetText.trim();
  if (!target) throw new Error("Target text is required for session source erasure");
  const rows = await client.query(
    "SELECT id, messages_json FROM sessions WHERE user_id=$1 AND deleted_at IS NULL FOR UPDATE",
    [userId],
  );
  let redactedCount = 0;
  for (const row of rows.rows) {
    const current = parseSessionMessages(row.messages_json);
    let rowRedactedCount = 0;
    const redacted = current.map((message) => {
      const result = redactSessionValue(message, target);
      rowRedactedCount += result.redactedCount;
      return result.value as SessionMemoryMessage;
    });
    if (!rowRedactedCount) continue;
    await client.query(
      "UPDATE sessions SET messages_json=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3 AND deleted_at IS NULL",
      [JSON.stringify(redacted), Number(row.id), userId],
    );
    redactedCount += rowRedactedCount;
  }
  const remaining = await client.query(
    "SELECT id, messages_json FROM sessions WHERE user_id=$1 AND deleted_at IS NULL FOR UPDATE",
    [userId],
  );
  if (remaining.rows.some((row) => containsSessionText(parseSessionMessages(row.messages_json), target))) {
    throw new Error("Session source erasure read-back still contains target");
  }
  return redactedCount;
}

export class PostgresSessionMemoryAdapter implements SessionMemoryAdapter {
  readonly provider = "postgres" as const;

  async append(identity: SessionMemoryIdentity, messages: SessionMemoryMessage[], requestId?: string): Promise<void> {
    assertSessionIdentity(identity);
    await assertMemoryWriteGateOpen();
    const normalized = messages.map(normalizeSessionMessage);
    if (!normalized.length && !requestId) return;
    await withPostgresClient(async (client) => {
      await client.query("BEGIN");
      try {
        const result = await client.query(
          "SELECT messages_json, agent_state_json FROM sessions WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL FOR UPDATE",
          [identity.conversationId, identity.userId],
        );
        if (!result.rows[0]) throw new Error("Conversation does not belong to memory principal");
        const derivedResult = await client.query(
          `SELECT id, content
           FROM session_memory
           WHERE user_id=$1 AND session_id=$2 AND summary_type=$3
           ORDER BY id DESC LIMIT 1 FOR UPDATE`,
          [identity.userId, identity.conversationId, POSTGRES_SESSION_MEMORY_TYPE],
        );
        const derivedRow = derivedResult.rows[0] as { id?: number; content?: unknown } | undefined;
        const current = derivedRow
          ? parseStoredSessionMessages(derivedRow.content)
          : parseSessionMessages(result.rows[0].messages_json);
        const state = parseJsonObject(result.rows[0].agent_state_json);
        const requestIds = Array.isArray(state.memoryRequestIds)
          ? state.memoryRequestIds.filter((value): value is string => typeof value === "string")
          : [];
        if (requestId && requestIds.includes(requestId)) {
          await client.query("COMMIT");
          return;
        }
        const keyToIndex = new Map<string, number>();
        current.forEach((message, index) => sessionMessageKeys(message).forEach((key) => keyToIndex.set(key, index)));
        const merged = [...current];
        let changed = false;
        for (const message of normalized) {
          const existingIndex = sessionMessageKeys(message).map((key) => keyToIndex.get(key)).find((index): index is number => index !== undefined);
          if (existingIndex === undefined) {
            sessionMessageKeys(message).forEach((key) => keyToIndex.set(key, merged.length));
            merged.push(message);
            changed = true;
            continue;
          }
          const existing = merged[existingIndex];
          if (JSON.stringify(existing) !== JSON.stringify(message)) {
            merged[existingIndex] = message;
            changed = true;
          }
        }
        if (changed && derivedRow?.id) {
          await client.query(
            "UPDATE session_memory SET content=$1, created_at=COALESCE(created_at,NOW()) WHERE id=$2 AND user_id=$3",
            [JSON.stringify(merged), derivedRow.id, identity.userId],
          );
        } else if (changed) {
          await client.query(
            `INSERT INTO session_memory (user_id, session_id, summary_type, content)
             VALUES ($1,$2,$3,$4)`,
            [identity.userId, identity.conversationId, POSTGRES_SESSION_MEMORY_TYPE, JSON.stringify(merged)],
          );
        }
        if (requestId) {
          const nextRequestIds = [...requestIds.filter((value) => value !== requestId), requestId].slice(-128);
          await client.query(
            "UPDATE sessions SET agent_state_json=$1::jsonb, updated_at=NOW() WHERE id=$2 AND user_id=$3 AND deleted_at IS NULL",
            [JSON.stringify({ ...state, memoryLastRequestId: requestId, memoryRequestIds: nextRequestIds }), identity.conversationId, identity.userId],
          );
        }
        const check = await client.query(
          `SELECT content FROM session_memory
           WHERE user_id=$1 AND session_id=$2 AND summary_type=$3
           ORDER BY id DESC LIMIT 1`,
          [identity.userId, identity.conversationId, POSTGRES_SESSION_MEMORY_TYPE],
        );
        const stored = parseStoredSessionMessages(check.rows[0]?.content);
        for (const message of normalized) {
          const matches = stored.some((candidate) => sessionMessageKeys(candidate).some((key) => sessionMessageKeys(message).includes(key)) && JSON.stringify(candidate) === JSON.stringify(message));
          if (!matches) throw new Error("Session memory read-back verification failed");
        }
        const stateCheck = await client.query(
          "SELECT agent_state_json FROM sessions WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
          [identity.conversationId, identity.userId],
        );
        const checkedRequestIds = parseJsonObject(stateCheck.rows[0]?.agent_state_json).memoryRequestIds;
        if (requestId && (!Array.isArray(checkedRequestIds) || !checkedRequestIds.includes(requestId))) throw new Error("Session memory request id read-back verification failed");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async load(identity: SessionMemoryIdentity): Promise<SessionMemoryMessage[]> {
    assertSessionIdentity(identity);
    await assertMemoryGateOpen("read");
    return withPostgresClient(async (client) => {
      const result = await client.query(
        "SELECT messages_json FROM sessions WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
        [identity.conversationId, identity.userId],
      );
      if (!result.rows[0]) throw new Error("Conversation does not belong to memory principal");
      const derived = await client.query(
        `SELECT content FROM session_memory
         WHERE user_id=$1 AND session_id=$2 AND summary_type=$3
         ORDER BY id DESC LIMIT 1`,
        [identity.userId, identity.conversationId, POSTGRES_SESSION_MEMORY_TYPE],
      );
      const stored = parseStoredSessionMessages(derived.rows[0]?.content);
      if (derived.rows[0]) return stored;
      const legacy = parseSessionMessages(result.rows[0].messages_json);
      if (!legacy.length) return [];
      return legacy;
    });
  }

  async eraseTarget(identity: SessionMemoryIdentity, targetText: string): Promise<{ redactedCount: number }> {
    assertSessionIdentity(identity);
    const target = targetText.trim();
    if (!target) throw new Error("Target text is required for targeted session erasure");
    return withPostgresClient(async (client) => {
      await client.query("BEGIN");
      try {
        const conversation = await client.query(
          "SELECT id, messages_json FROM sessions WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL FOR UPDATE",
          [identity.conversationId, identity.userId],
        );
        if (!conversation.rows[0]) throw new Error("Conversation does not belong to memory principal");
        let redactedCount = 0;
        const rawMessages = parseSessionMessages(conversation.rows[0].messages_json);
        const redactedRaw = rawMessages.map((message) => {
          const result = redactSessionValue(message, target);
          redactedCount += result.redactedCount;
          return result.value as SessionMemoryMessage;
        });
        const derivedRows = await client.query(
          `SELECT id, content FROM session_memory
           WHERE session_id=$1 AND user_id=$2 AND summary_type=$3
           ORDER BY id DESC LIMIT 1 FOR UPDATE`,
          [identity.conversationId, identity.userId, POSTGRES_SESSION_MEMORY_TYPE],
        );
        let current = parseStoredSessionMessages(derivedRows.rows[0]?.content);
        if (!derivedRows.rows[0]) current = rawMessages;
        let derivedRedactedCount = 0;
        const redacted = current.map((message) => {
          const result = redactSessionValue(message, target);
          derivedRedactedCount += result.redactedCount;
          return result.value as SessionMemoryMessage;
        });
        if (derivedRedactedCount) redactedCount += derivedRedactedCount;
        if (redactedCount && JSON.stringify(redactedRaw) !== JSON.stringify(rawMessages)) {
          await client.query(
            "UPDATE sessions SET messages_json=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3 AND deleted_at IS NULL",
            [JSON.stringify(redactedRaw), identity.conversationId, identity.userId],
          );
        }
        if (derivedRedactedCount && derivedRows.rows[0]?.id) {
          await client.query(
            "UPDATE session_memory SET content=$1 WHERE id=$2 AND user_id=$3",
            [JSON.stringify(redacted), derivedRows.rows[0].id, identity.userId],
          );
        } else if (derivedRedactedCount) {
          await client.query(
            `INSERT INTO session_memory (user_id, session_id, summary_type, content)
             VALUES ($1,$2,$3,$4)`,
            [identity.userId, identity.conversationId, POSTGRES_SESSION_MEMORY_TYPE, JSON.stringify(redactedRaw)],
          );
        }
        const derivedCheck = await client.query(
          `SELECT content FROM session_memory
           WHERE session_id=$1 AND user_id=$2 AND summary_type=$3
           ORDER BY id DESC LIMIT 1`,
          [identity.conversationId, identity.userId, POSTGRES_SESSION_MEMORY_TYPE],
        );
        if (containsSessionText(parseStoredSessionMessages(derivedCheck.rows[0]?.content), target)) {
          throw new Error("Session memory erasure read-back still contains target");
        }
        const rawCheck = await client.query(
          "SELECT messages_json FROM sessions WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
          [identity.conversationId, identity.userId],
        );
        if (containsSessionText(parseSessionMessages(rawCheck.rows[0]?.messages_json), target)) {
          throw new Error("Session raw message erasure read-back still contains target");
        }
        await client.query("COMMIT");
        return { redactedCount };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }
}

export interface MastraMemoryContract { append(input: { resourceId: string; threadId: string; messages: SessionMemoryMessage[]; requestId?: string }): Promise<void>; load(input: { resourceId: string; threadId: string }): Promise<SessionMemoryMessage[]>; eraseTarget?(input: { resourceId: string; threadId: string; targetText: string }): Promise<{ redactedCount: number }> }
export class MastraSessionMemoryAdapter implements SessionMemoryAdapter {
  readonly provider = "mastra" as const;
  constructor(private readonly memory: MastraMemoryContract) {}
  private map(identity: SessionMemoryIdentity): { resourceId: string; threadId: string } {
    assertSessionIdentity(identity);
    return { resourceId: identity.userId, threadId: `conversation:${identity.conversationId}` };
  }
  async append(identity: SessionMemoryIdentity, messages: SessionMemoryMessage[], requestId?: string): Promise<void> {
    const mapped = this.map(identity);
    if (isPostgresConfigured()) await assertMemoryWriteGateOpen();
    await this.memory.append({ ...mapped, messages: messages.map(normalizeSessionMessage), requestId });
  }
  async load(identity: SessionMemoryIdentity): Promise<SessionMemoryMessage[]> {
    if (isPostgresConfigured()) await assertMemoryGateOpen("read");
    return this.memory.load(this.map(identity));
  }
  async eraseTarget(identity: SessionMemoryIdentity, targetText: string): Promise<{ redactedCount: number }> {
    if (!this.memory.eraseTarget) throw new SessionMemoryConfigurationError("Mastra memory adapter does not support targeted erasure");
    return this.memory.eraseTarget({ ...this.map(identity), targetText });
  }
}
let configuredSessionMemoryAdapter: SessionMemoryAdapter | null = null;
export function configureSessionMemoryAdapter(adapter: SessionMemoryAdapter | null): void { configuredSessionMemoryAdapter = adapter; }
export function getSessionMemoryAdapter(): SessionMemoryAdapter {
  if (configuredSessionMemoryAdapter) return configuredSessionMemoryAdapter;
  const provider = (process.env.MEMORY_SESSION_PROVIDER || "postgres").trim().toLowerCase();
  if (provider === "mastra") {
    const adapter = new MastraSessionMemoryAdapter(createMastraSessionContract());
    configuredSessionMemoryAdapter = adapter;
    return adapter;
  }
  return new PostgresSessionMemoryAdapter();
}
export async function eraseConversationMemory(principal: ExecutionPrincipal, input: { conversationId: number; targetText: string }): Promise<{ provider: SessionMemoryAdapter["provider"]; redactedCount: number }> { const adapter = getSessionMemoryAdapter(); const result = await adapter.eraseTarget({ userId: principal.userId, conversationId: input.conversationId }, input.targetText); return { provider: adapter.provider, redactedCount: result.redactedCount }; }
