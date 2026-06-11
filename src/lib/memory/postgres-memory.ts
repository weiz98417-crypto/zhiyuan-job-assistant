import type { PoolClient } from "pg";
import { withPostgresClient } from "../postgres";
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
