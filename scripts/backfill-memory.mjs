#!/usr/bin/env node

import { createHash } from "node:crypto";
import { Pool } from "pg";

const DIMENSION = 1536;
const SOURCE_RULES = {
  cv: { maxChars: 1200, overlap: 160 },
  reference_resume: { maxChars: 1200, overlap: 160 },
  jd: { maxChars: 1000, overlap: 120 },
  jd_report: { maxChars: 1400, overlap: 180 },
  offer: { maxChars: 900, overlap: 120 },
  offer_report: { maxChars: 1200, overlap: 160 },
  session: { maxChars: 1000, overlap: 150 },
  story: { maxChars: 900, overlap: 120 },
  profile: { maxChars: 800, overlap: 100 },
  profile_signal: { maxChars: 800, overlap: 100 },
};
const FILTER_MAP = {
  resume: ["cv", "reference_resume"],
  jd: ["jd"],
  offer: ["offer", "offer_report"],
  report: ["jd_report", "offer_report"],
  interview: ["session", "story"],
  profile: ["profile", "profile_signal"],
};

const args = parseArgs(process.argv.slice(2));
const databaseUrl = (process.env.DATABASE_URL || "").trim();

if (!databaseUrl) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: Number(process.env.POSTGRES_MAX_CONNECTIONS || 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    const sources = await loadSources(client, args);
    const chunks = sources.flatMap(chunkSource);
    console.log(`Memory backfill sources: ${sources.length}`);
    console.log(`Memory backfill chunks: ${chunks.length}`);

    if (args.dryRun) {
      printDryRun(chunks);
      return;
    }

    const config = resolveEmbeddingConfig(process.env);
    let written = 0;
    let embedded = 0;
    let failed = 0;

    for (const chunk of chunks) {
      const result = await embedChunk(chunk, config);
      await upsertChunk(client, chunk, result);
      written += 1;
      if (result.status === "embedded") embedded += 1;
      if (result.status === "failed") failed += 1;
    }

    console.log(`Memory backfill written: ${written}`);
    console.log(`Memory backfill embedded: ${embedded}`);
    console.log(`Memory backfill failed: ${failed}`);
  } finally {
    client.release();
  }
}

async function loadSources(client, options) {
  const sourceTypes = expandSourceTypes(options.sources);
  const docs = [];
  const push = (doc) => {
    if (!doc.userId || !doc.text.trim()) return;
    if (options.limit && docs.length >= options.limit) return;
    docs.push(doc);
  };
  const canLoad = (type) => !sourceTypes.length || sourceTypes.includes(type);

  if (canLoad("cv")) {
    for (const row of await queryRows(client, "SELECT id, user_id, data_json, updated_at FROM cv_data ORDER BY updated_at DESC", options.userId)) {
      push({
        userId: row.user_id,
        sourceType: "cv",
        sourceId: row.id,
        title: "CV",
        text: extractText(parseJson(row.data_json)),
        metadata: { updatedAt: row.updated_at },
      });
    }
  }

  if (canLoad("reference_resume")) {
    for (const row of await queryRows(client, "SELECT id, user_id, name, raw_text, sections_json, tags, created_at FROM reference_resumes ORDER BY created_at DESC", options.userId)) {
      push({
        userId: row.user_id,
        sourceType: "reference_resume",
        sourceId: row.id,
        title: row.name,
        text: row.raw_text || extractText(parseJson(row.sections_json)),
        metadata: { tags: parseJson(row.tags), createdAt: row.created_at },
      });
    }
  }

  if (canLoad("jd")) {
    for (const row of await queryRows(client, "SELECT id, user_id, company, role, body, source_type, source_url, created_at FROM jds ORDER BY created_at DESC", options.userId)) {
      push({
        userId: row.user_id,
        sourceType: "jd",
        sourceId: row.id,
        title: [row.company, row.role].filter(Boolean).join(" - "),
        text: row.body,
        metadata: { sourceType: row.source_type, sourceUrl: row.source_url, createdAt: row.created_at },
      });
    }
  }

  if (canLoad("jd_report")) {
    for (const row of await queryRows(client, "SELECT id, user_id, report_num, company, role, blocks_json, keywords_json, created_at FROM reports ORDER BY created_at DESC", options.userId)) {
      push({
        userId: row.user_id,
        sourceType: "jd_report",
        sourceId: row.id,
        title: [row.company, row.role, `report ${row.report_num}`].filter(Boolean).join(" - "),
        text: extractText(parseJson(row.blocks_json)),
        metadata: { reportNum: row.report_num, keywords: parseJson(row.keywords_json), createdAt: row.created_at },
      });
    }
  }

  if (canLoad("offer")) {
    for (const row of await queryRows(client, "SELECT * FROM offers ORDER BY updated_at DESC", options.userId)) {
      push({
        userId: row.user_id,
        sourceType: "offer",
        sourceId: row.id,
        title: [row.company, row.role].filter(Boolean).join(" - "),
        text: extractText({ ...row, user_id: undefined, id: undefined }),
        metadata: { updatedAt: row.updated_at },
      });
    }
  }

  if (canLoad("offer_report")) {
    for (const row of await queryRows(client, "SELECT * FROM offer_reports ORDER BY created_at DESC", options.userId)) {
      push({
        userId: row.user_id,
        sourceType: "offer_report",
        sourceId: row.id,
        title: row.title || "Offer report",
        text: [row.summary, row.report_markdown, extractText(parseJson(row.modules_json)), extractText(parseJson(row.red_flags_json))].filter(Boolean).join("\n\n"),
        metadata: { offerId: row.offer_id, createdAt: row.created_at },
      });
    }
  }

  if (canLoad("session")) {
    for (const row of await queryRows(client, "SELECT id, user_id, title, messages_json, memory_digest, updated_at FROM sessions WHERE deleted_at IS NULL ORDER BY updated_at DESC", options.userId)) {
      push({
        userId: row.user_id,
        sourceType: "session",
        sourceId: row.id,
        title: row.title || "Session",
        text: [row.memory_digest, extractText(parseJson(row.messages_json))].filter(Boolean).join("\n\n"),
        metadata: { updatedAt: row.updated_at },
      });
    }
  }

  if (canLoad("story")) {
    for (const row of await queryRows(client, "SELECT id, user_id, title, situation, task, action, result, tags_json, created_at FROM stories ORDER BY created_at DESC", options.userId)) {
      push({
        userId: row.user_id,
        sourceType: "story",
        sourceId: row.id,
        title: row.title,
        text: [
          `Situation: ${row.situation || ""}`,
          `Task: ${row.task || ""}`,
          `Action: ${row.action || ""}`,
          `Result: ${row.result || ""}`,
        ].join("\n"),
        metadata: { tags: parseJson(row.tags_json), createdAt: row.created_at },
      });
    }
  }

  if (canLoad("profile")) {
    for (const row of await queryRows(client, "SELECT id, user_id, data_json, goals_json, history_json, last_updated FROM profiles ORDER BY last_updated DESC", options.userId)) {
      push({
        userId: row.user_id,
        sourceType: "profile",
        sourceId: row.id,
        title: "Profile",
        text: extractText({ data: parseJson(row.data_json), goals: parseJson(row.goals_json), history: parseJson(row.history_json) }),
        metadata: { lastUpdated: row.last_updated },
      });
    }
  }

  if (canLoad("profile_signal")) {
    for (const row of await queryRows(client, "SELECT id, user_id, source, signal_type, content_json, session_id, created_at FROM profile_signals ORDER BY created_at DESC", options.userId)) {
      push({
        userId: row.user_id,
        sourceType: "profile_signal",
        sourceId: row.id,
        title: [row.source, row.signal_type].filter(Boolean).join(" - "),
        text: extractText(parseJson(row.content_json)),
        metadata: { signalType: row.signal_type, sessionId: row.session_id, createdAt: row.created_at },
      });
    }
  }

  return docs.slice(0, options.limit || docs.length);
}

async function queryRows(client, sql, userId) {
  const scoped = userId ? addUserScope(sql) : sql;
  const result = userId ? await client.query(scoped, [userId]) : await client.query(sql);
  return result.rows;
}

function addUserScope(sql) {
  const joiner = /\sWHERE\s/i.test(sql) ? " AND user_id = $1 ORDER BY " : " WHERE user_id = $1 ORDER BY ";
  return sql.replace(/\sORDER BY\s/i, joiner);
}

function chunkSource(source) {
  const rule = SOURCE_RULES[source.sourceType];
  const text = normalizeWhitespace(source.text);
  if (!rule || !text) return [];
  const segments = text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const rawChunks = [];
  let current = "";

  for (const segment of segments) {
    if (segment.length > rule.maxChars) {
      if (current) rawChunks.push(current);
      current = "";
      for (let start = 0; start < segment.length; start += Math.max(1, rule.maxChars - rule.overlap)) {
        rawChunks.push(segment.slice(start, start + rule.maxChars).trim());
        if (start + rule.maxChars >= segment.length) break;
      }
      continue;
    }
    const next = current ? `${current}\n\n${segment}` : segment;
    if (next.length <= rule.maxChars) current = next;
    else {
      if (current) rawChunks.push(current);
      current = segment;
    }
  }
  if (current) rawChunks.push(current);

  return rawChunks.map((chunkText, chunkIndex) => {
    const titledText = source.title ? `${normalizeWhitespace(source.title)}\n${chunkText}` : chunkText;
    return {
      ...source,
      sourceId: String(source.sourceId),
      chunkIndex,
      chunkText: titledText,
      contentHash: stableHash(`${source.userId}:${source.sourceType}:${source.sourceId}:${chunkIndex}:${titledText}`),
      metadata: { ...(source.metadata || {}), title: source.title || "", chunkChars: titledText.length },
    };
  });
}

async function embedChunk(chunk, config) {
  let lastError = "";
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    try {
      const embedding = await createEmbedding(chunk.chunkText, config);
      return {
        status: "embedded",
        embedding,
        model: config.model,
        dimension: DIMENSION,
        failureReason: "",
        retryCount: attempt,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    status: "failed",
    embedding: null,
    model: config.model,
    dimension: DIMENSION,
    failureReason: lastError.slice(0, 500),
    retryCount: config.maxRetries,
  };
}

async function createEmbedding(text, config) {
  if (config.provider === "mock") return deterministicEmbedding(text);
  if (config.provider === "disabled") throw new Error("Memory embedding provider is disabled");
  if (!config.apiUrl || !config.apiKey || !config.model) {
    throw new Error("MEMORY_EMBEDDING_API_URL, MEMORY_EMBEDDING_API_KEY, and MEMORY_EMBEDDING_MODEL are required");
  }

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, input: [text] }),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Embedding API ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const payload = await response.json();
  const embedding = payload?.data?.[0]?.embedding;
  validateEmbedding(embedding);
  return embedding;
}

async function upsertChunk(client, chunk, result) {
  const embedding = result.embedding ? vectorSql(result.embedding) : null;
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
    result.model,
    result.dimension,
    embedding,
    result.status,
    result.failureReason,
    result.retryCount,
    JSON.stringify(chunk.metadata || {}),
    result.status === "embedded" ? new Date().toISOString() : null,
  ]);
}

function resolveEmbeddingConfig(env) {
  const provider = (env.MEMORY_EMBEDDING_PROVIDER || "disabled").trim().toLowerCase();
  if (!["disabled", "mock", "openai-compatible"].includes(provider)) {
    throw new Error(`Unsupported MEMORY_EMBEDDING_PROVIDER: ${provider}`);
  }
  const dimension = Number(env.MEMORY_EMBEDDING_DIMENSION || DIMENSION);
  if (dimension !== DIMENSION) {
    throw new Error(`Memory embedding dimension mismatch: expected ${DIMENSION}, got ${dimension}`);
  }
  return {
    provider,
    apiUrl: env.MEMORY_EMBEDDING_API_URL || "",
    apiKey: env.MEMORY_EMBEDDING_API_KEY || "",
    model: env.MEMORY_EMBEDDING_MODEL || (provider === "mock" ? "mock-embedding-1536" : ""),
    maxRetries: clampInteger(Number(env.MEMORY_EMBEDDING_MAX_RETRIES || 2), 0, 5),
  };
}

function expandSourceTypes(values) {
  if (!values.length) return [];
  const out = new Set();
  for (const value of values) {
    for (const item of String(value).split(",")) {
      const trimmed = item.trim();
      const mapped = FILTER_MAP[trimmed];
      if (mapped) mapped.forEach((source) => out.add(source));
      else if (SOURCE_RULES[trimmed]) out.add(trimmed);
    }
  }
  return Array.from(out);
}

function parseArgs(argv) {
  const parsed = { dryRun: false, limit: 0, userId: "", sources: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--limit") parsed.limit = Number(argv[++index] || 0);
    else if (arg.startsWith("--limit=")) parsed.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--user") parsed.userId = argv[++index] || "";
    else if (arg.startsWith("--user=")) parsed.userId = arg.slice("--user=".length);
    else if (arg === "--source") parsed.sources.push(argv[++index] || "");
    else if (arg.startsWith("--source=")) parsed.sources.push(arg.slice("--source=".length));
  }
  parsed.limit = clampInteger(parsed.limit, 0, 100000);
  return parsed;
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function extractText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join("\n");
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([, nested]) => nested !== undefined && nested !== null)
      .map(([key, nested]) => {
        const text = extractText(nested);
        return text ? `${key}: ${text}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function deterministicEmbedding(text) {
  const seed = stableHash(normalizeWhitespace(text).slice(0, 4000));
  const vector = Array.from({ length: DIMENSION }, (_, index) => {
    const block = createHash("sha256").update(`${seed}:${Math.floor(index / 32)}`).digest();
    return (block[index % 32] / 127.5) - 1;
  });
  const norm = Math.hypot(...vector) || 1;
  return vector.map((value) => Number((value / norm).toFixed(8)));
}

function validateEmbedding(embedding) {
  if (!Array.isArray(embedding) || embedding.length !== DIMENSION) {
    throw new Error(`Embedding dimension mismatch: expected ${DIMENSION}, got ${Array.isArray(embedding) ? embedding.length : "non-array"}`);
  }
  for (const value of embedding) {
    if (!Number.isFinite(value)) throw new Error("Embedding contains non-finite values");
  }
}

function vectorSql(embedding) {
  validateEmbedding(embedding);
  return `[${embedding.map((value) => Number(value.toFixed(8))).join(",")}]`;
}

function normalizeWhitespace(text) {
  return String(text || "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function stableHash(text) {
  return createHash("sha256").update(text).digest("hex");
}

function clampInteger(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function printDryRun(chunks) {
  const counts = new Map();
  for (const chunk of chunks) {
    counts.set(chunk.sourceType, (counts.get(chunk.sourceType) || 0) + 1);
  }
  for (const [sourceType, count] of Array.from(counts.entries()).sort()) {
    console.log(`${sourceType}: ${count} chunks`);
  }
}
