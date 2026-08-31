import { createHash } from "node:crypto";

export const MEMORY_EMBEDDING_DIMENSION = 1536;

export const MEMORY_SOURCE_TYPES = [
  "cv",
  "reference_resume",
  "jd",
  "jd_report",
  "offer",
  "offer_report",
  "interview",
  "session",
  "story",
  "profile",
  "profile_signal",
] as const;

export type MemorySourceType = (typeof MEMORY_SOURCE_TYPES)[number];
export type MemorySourceCategory = "resume" | "jd" | "offer" | "interview" | "report" | "profile";
export type MemorySourceFilter = MemorySourceCategory | MemorySourceType;
export type EmbeddingStatus = "pending" | "embedded" | "failed" | "skipped";
export type MemoryEmbeddingProviderName = "disabled" | "mock" | "openai-compatible";

export interface MemorySourceInput {
  userId: string;
  sourceType: MemorySourceType;
  sourceId: string | number;
  text: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryChunkInput {
  userId: string;
  sourceType: MemorySourceType;
  sourceId: string;
  chunkIndex: number;
  chunkText: string;
  contentHash: string;
  metadata: Record<string, unknown>;
}

export interface MemoryEmbeddingConfig {
  provider: MemoryEmbeddingProviderName;
  apiUrl: string;
  apiKey: string;
  model: string;
  apiDimension: number;
  dimension: number;
  maxRetries: number;
}

export interface EmbeddingProvider {
  model: string;
  dimension: number;
  embed(texts: string[]): Promise<number[][]>;
}

export interface EmbeddedMemoryChunk {
  chunk: MemoryChunkInput;
  embeddingModel: string;
  embeddingDimension: number;
  embedding: number[] | null;
  embeddingStatus: EmbeddingStatus;
  failureReason: string;
  retryCount: number;
}

export interface MemoryRetrievalRow {
  id: number;
  user_id: string;
  source_type: MemorySourceType;
  source_id: string;
  chunk_index: number;
  chunk_text: string;
  embedding_model: string;
  metadata_json?: string | Record<string, unknown>;
  similarity?: number | string | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
  embedded_at?: string | Date | null;
}

export interface MemorySnippet {
  id: number;
  sourceType: MemorySourceType;
  sourceId: string;
  snippet: string;
  similarity: number;
  score: number;
  metadata: Record<string, unknown>;
}

const SOURCE_RULES: Record<MemorySourceType, { maxChars: number; overlap: number }> = {
  cv: { maxChars: 1200, overlap: 160 },
  reference_resume: { maxChars: 1200, overlap: 160 },
  jd: { maxChars: 1000, overlap: 120 },
  jd_report: { maxChars: 1400, overlap: 180 },
  offer: { maxChars: 900, overlap: 120 },
  offer_report: { maxChars: 1200, overlap: 160 },
  interview: { maxChars: 1000, overlap: 150 },
  session: { maxChars: 1000, overlap: 150 },
  story: { maxChars: 900, overlap: 120 },
  profile: { maxChars: 800, overlap: 100 },
  profile_signal: { maxChars: 800, overlap: 100 },
};

const SOURCE_FILTER_MAP: Record<MemorySourceCategory, MemorySourceType[]> = {
  resume: ["cv", "reference_resume"],
  jd: ["jd"],
  offer: ["offer", "offer_report"],
  interview: ["interview", "session", "story"],
  report: ["jd_report", "offer_report"],
  profile: ["profile", "profile_signal"],
};

const SOURCE_RERANK_WEIGHT: Partial<Record<MemorySourceType, number>> = {
  profile: 1,
  cv: 0.95,
  reference_resume: 0.9,
  jd_report: 0.85,
  offer_report: 0.85,
  story: 0.8,
  interview: 0.78,
  jd: 0.72,
  offer: 0.72,
  session: 0.68,
  profile_signal: 0.65,
};

export function resolveMemoryEmbeddingConfig(
  env: Record<string, string | undefined> = process.env,
): MemoryEmbeddingConfig {
  const provider = normalizeProvider(env.MEMORY_EMBEDDING_PROVIDER || (env.NODE_ENV === "test" ? "mock" : "disabled"));
  const dimension = Number(env.MEMORY_EMBEDDING_DIMENSION || MEMORY_EMBEDDING_DIMENSION);
  const apiDimension = Number(env.MEMORY_EMBEDDING_API_DIMENSION || dimension);

  if (!Number.isInteger(dimension) || dimension <= 0) {
    throw new Error(`Invalid MEMORY_EMBEDDING_DIMENSION: ${env.MEMORY_EMBEDDING_DIMENSION}`);
  }
  if (dimension !== MEMORY_EMBEDDING_DIMENSION) {
    throw new Error(`Memory embedding dimension mismatch: expected ${MEMORY_EMBEDDING_DIMENSION}, got ${dimension}`);
  }
  if (!Number.isInteger(apiDimension) || apiDimension <= 0 || apiDimension > dimension) {
    throw new Error(`Invalid MEMORY_EMBEDDING_API_DIMENSION: ${env.MEMORY_EMBEDDING_API_DIMENSION}`);
  }

  return {
    provider,
    apiUrl: env.MEMORY_EMBEDDING_API_URL?.trim() || "",
    apiKey: env.MEMORY_EMBEDDING_API_KEY?.trim() || env.DASHSCOPE_API_KEY?.trim() || "",
    model: env.MEMORY_EMBEDDING_MODEL?.trim() || (provider === "mock" ? "mock-embedding-1536" : ""),
    apiDimension,
    dimension,
    maxRetries: clampInteger(Number(env.MEMORY_EMBEDDING_MAX_RETRIES || 2), 0, 5),
  };
}

export function createEmbeddingProvider(
  config = resolveMemoryEmbeddingConfig(),
  fetchImpl: typeof fetch = fetch,
): EmbeddingProvider {
  if (config.provider === "mock") {
    return {
      model: config.model || "mock-embedding-1536",
      dimension: config.dimension,
      async embed(texts) {
        return texts.map((text) => createDeterministicEmbedding(text, config.dimension));
      },
    };
  }

  if (config.provider === "disabled") {
    throw new Error("Memory embedding provider is disabled");
  }

  if (!config.apiUrl || !config.apiKey || !config.model) {
    throw new Error("MEMORY_EMBEDDING_API_URL, MEMORY_EMBEDDING_API_KEY, and MEMORY_EMBEDDING_MODEL are required");
  }

  return {
    model: config.model,
    dimension: config.dimension,
    async embed(texts) {
      const response = await fetchImpl(config.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          input: texts,
          dimensions: config.apiDimension,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Embedding API ${response.status}: ${errorText.slice(0, 300)}`);
      }

      const payload = await response.json() as { data?: Array<{ embedding?: number[] }> };
      const embeddings = payload.data?.map((item) => item.embedding || []) || [];
      if (embeddings.length !== texts.length) {
        throw new Error(`Embedding API returned ${embeddings.length} vectors for ${texts.length} inputs`);
      }
      for (const embedding of embeddings) validateEmbeddingDimension(embedding, config.apiDimension);
      return embeddings.map((embedding) => padEmbeddingDimension(embedding, config.dimension));
    },
  };
}

function padEmbeddingDimension(embedding: number[], dimension: number): number[] {
  if (embedding.length === dimension) return embedding;
  return [...embedding, ...Array.from({ length: dimension - embedding.length }, () => 0)];
}

export function chunkMemorySource(input: MemorySourceInput): MemoryChunkInput[] {
  const rule = SOURCE_RULES[input.sourceType];
  const text = normalizeWhitespace(input.text);
  if (!text) return [];

  const titlePrefix = input.title ? `${normalizeWhitespace(input.title)}\n` : "";
  const segments = splitSourceText(text);
  const rawChunks: string[] = [];
  let current = "";

  for (const segment of segments) {
    if (!segment) continue;
    if (segment.length > rule.maxChars) {
      if (current) {
        rawChunks.push(current);
        current = "";
      }
      rawChunks.push(...splitLongSegment(segment, rule.maxChars, rule.overlap));
      continue;
    }

    const next = current ? `${current}\n\n${segment}` : segment;
    if (next.length <= rule.maxChars) {
      current = next;
    } else {
      if (current) rawChunks.push(current);
      current = segment;
    }
  }
  if (current) rawChunks.push(current);

  return rawChunks.map((chunkText, index) => {
    const textWithTitle = titlePrefix && !chunkText.startsWith(titlePrefix) ? `${titlePrefix}${chunkText}` : chunkText;
    return {
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId: String(input.sourceId),
      chunkIndex: index,
      chunkText: textWithTitle,
      contentHash: stableHash(`${input.userId}:${input.sourceType}:${input.sourceId}:${index}:${textWithTitle}`),
      metadata: {
        ...(input.metadata || {}),
        title: input.title || "",
        chunkChars: textWithTitle.length,
      },
    };
  });
}

export async function embedChunksWithRetry(
  chunks: MemoryChunkInput[],
  provider: EmbeddingProvider,
  options: { maxRetries?: number } = {},
): Promise<EmbeddedMemoryChunk[]> {
  const maxRetries = clampInteger(options.maxRetries ?? 2, 0, 5);
  const results: EmbeddedMemoryChunk[] = [];

  for (const chunk of chunks) {
    let lastError = "";
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const [embedding] = await provider.embed([chunk.chunkText]);
        validateEmbeddingDimension(embedding, provider.dimension);
        results.push({
          chunk,
          embeddingModel: provider.model,
          embeddingDimension: provider.dimension,
          embedding,
          embeddingStatus: "embedded",
          failureReason: "",
          retryCount: attempt,
        });
        lastError = "";
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    if (lastError) {
      results.push({
        chunk,
        embeddingModel: provider.model,
        embeddingDimension: provider.dimension,
        embedding: null,
        embeddingStatus: "failed",
        failureReason: lastError.slice(0, 500),
        retryCount: maxRetries,
      });
    }
  }

  return results;
}

export function createDeterministicEmbedding(text: string, dimension = MEMORY_EMBEDDING_DIMENSION): number[] {
  if (dimension !== MEMORY_EMBEDDING_DIMENSION) {
    throw new Error(`Memory embedding dimension mismatch: expected ${MEMORY_EMBEDDING_DIMENSION}, got ${dimension}`);
  }

  const seed = stableHash(normalizeWhitespace(text).slice(0, 4000));
  const vector = Array.from({ length: dimension }, (_, index) => {
    const block = createHash("sha256").update(`${seed}:${Math.floor(index / 32)}`).digest();
    const byte = block[index % 32];
    return (byte / 127.5) - 1;
  });
  return normalizeVector(vector);
}

export function validateEmbeddingDimension(embedding: number[], expected = MEMORY_EMBEDDING_DIMENSION): void {
  if (!Array.isArray(embedding) || embedding.length !== expected) {
    throw new Error(`Embedding dimension mismatch: expected ${expected}, got ${Array.isArray(embedding) ? embedding.length : "non-array"}`);
  }
  for (const value of embedding) {
    if (!Number.isFinite(value)) throw new Error("Embedding contains non-finite values");
  }
}

export function vectorToSql(embedding: number[]): string {
  validateEmbeddingDimension(embedding);
  return `[${embedding.map((value) => Number(value.toFixed(8))).join(",")}]`;
}

export function normalizeMemorySourceFilters(filters: MemorySourceFilter[] = []): MemorySourceType[] {
  const out = new Set<MemorySourceType>();
  for (const filter of filters) {
    if (isMemorySourceCategory(filter)) {
      for (const sourceType of SOURCE_FILTER_MAP[filter]) out.add(sourceType);
    } else if (isMemorySourceType(filter)) {
      out.add(filter);
    }
  }
  return Array.from(out);
}

export function buildMemoryRetrievalQuery(input: {
  userId: string;
  queryEmbedding: number[];
  sourceTypes?: MemorySourceFilter[];
  limit?: number;
}) {
  const sourceTypes = normalizeMemorySourceFilters(input.sourceTypes || []);
  const params: unknown[] = [vectorToSql(input.queryEmbedding), input.userId];
  const clauses = [
    "user_id = $2",
    "embedding_status = 'embedded'",
    "embedding IS NOT NULL",
  ];

  if (sourceTypes.length) {
    params.push(sourceTypes);
    clauses.push(`source_type = ANY($${params.length}::text[])`);
  }

  const limit = clampInteger(input.limit ?? 8, 1, 20);
  params.push(limit);

  return {
    sql: `
      SELECT id, user_id, source_type, source_id, chunk_index, chunk_text, embedding_model,
        metadata_json, created_at, updated_at, embedded_at,
        1 - (embedding <=> $1::vector) AS similarity
      FROM memory_chunks
      WHERE ${clauses.join(" AND ")}
      ORDER BY embedding <=> $1::vector ASC, updated_at DESC
      LIMIT $${params.length}
    `,
    params,
    sourceTypes,
  };
}

export function rerankMemoryRows(rows: MemoryRetrievalRow[], userId: string, limit = 8): MemorySnippet[] {
  return rows
    .filter((row) => row.user_id === userId)
    .map((row) => {
      const metadata = parseMetadata(row.metadata_json);
      const similarity = normalizeScore(Number(row.similarity ?? 0));
      const confidence = normalizeScore(Number(metadata.confidence ?? 0.6));
      const importance = normalizeScore(Number(metadata.importance ?? 0.5));
      const sourceWeight = SOURCE_RERANK_WEIGHT[row.source_type] ?? 0.6;
      const recency = recencyScore(row.updated_at || row.embedded_at || row.created_at);
      const score = (similarity * 0.72) + (recency * 0.12) + (confidence * 0.06) + (importance * 0.06) + (sourceWeight * 0.04);

      return {
        id: Number(row.id),
        sourceType: row.source_type,
        sourceId: String(row.source_id),
        snippet: compactSnippet(row.chunk_text),
        similarity,
        score,
        metadata,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, clampInteger(limit, 1, 20));
}

export function extractTextFromUnknown(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(extractTextFromUnknown).filter(Boolean).join("\n");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => {
        const text = extractTextFromUnknown(nested);
        return text ? `${key}: ${text}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export function stableHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function normalizeProvider(value: string): MemoryEmbeddingProviderName {
  const provider = value.trim().toLowerCase();
  if (provider === "mock" || provider === "openai-compatible" || provider === "disabled") return provider;
  throw new Error(`Unsupported MEMORY_EMBEDDING_PROVIDER: ${value}`);
}

function splitSourceText(text: string): string[] {
  return text
    .split(/\n{2,}|(?=^#{1,4}\s+)/m)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function splitLongSegment(segment: string, maxChars: number, overlap: number): string[] {
  const chunks: string[] = [];
  const stride = Math.max(1, maxChars - overlap);
  for (let start = 0; start < segment.length; start += stride) {
    chunks.push(segment.slice(start, start + maxChars).trim());
    if (start + maxChars >= segment.length) break;
  }
  return chunks.filter(Boolean);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeVector(vector: number[]): number[] {
  const norm = Math.hypot(...vector);
  if (!norm) return vector.map((_, index) => index === 0 ? 1 : 0);
  return vector.map((value) => Number((value / norm).toFixed(8)));
}

function compactSnippet(text: string, maxChars = 420): string {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1).trim()}...`;
}

function parseMetadata(value: string | Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) return {};
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function recencyScore(value: string | Date | null | undefined): number {
  if (!value) return 0.4;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(timestamp)) return 0.4;
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);
  return normalizeScore(1 / (1 + (ageDays / 45)));
}

function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function isMemorySourceType(value: string): value is MemorySourceType {
  return (MEMORY_SOURCE_TYPES as readonly string[]).includes(value);
}

function isMemorySourceCategory(value: string): value is MemorySourceCategory {
  return Object.prototype.hasOwnProperty.call(SOURCE_FILTER_MAP, value);
}
