import { getDatabaseDriver, isPostgresConfigured, withPostgresClient } from "@/lib/postgres";
import {
  createEmbeddingProvider,
  embedChunksWithRetry,
  stableHash,
  vectorToSql,
  type EmbeddingProvider,
} from "@/lib/memory/vector-memory";
import type { ReferenceResumeRow } from "@/lib/server-db";

export type ReferenceResumeVisibility = "private" | "team_pending" | "team" | "disabled";
export type ReferenceResumeStatus = "active" | "pending" | "disabled" | "index_failed";

export interface ReferenceResumeSection {
  id: string;
  title: string;
  content: string;
}

export interface ReferenceResumeSnippet {
  id: number;
  referenceResumeId: number;
  name: string;
  roleCategory: string;
  sectionType: string;
  snippet: string;
  similarity: number;
  score: number;
  visibility: ReferenceResumeVisibility;
  metadata: Record<string, unknown>;
  ranking: {
    similarity: number;
    quality: number;
    roleScore: number;
    feedbackTrustScore: number;
    acceptedCount: number;
    rejectedCount: number;
  };
}

export interface ReferenceResumeIndexResult {
  status: "skipped" | "indexed" | "failed";
  chunks: number;
  embedded: number;
  failed: number;
  reason?: string;
}

export interface ReferenceResumeRetrievalQuery {
  sql: string;
  params: unknown[];
  roleCategory: string;
  limit: number;
}

const ROLE_ALIASES: Array<[RegExp, string]> = [
  [/(ai|artificial intelligence|人工智能|大模型|智能).{0,24}(product|产品|pm)|ai[\s_-]*product|ai产品|aipm/i, "ai_product_manager"],
  [/(ai|人工智能|大模型|智能).{0,8}运营|ai运营|增长运营|用户运营/i, "ai_operations"],
  [/(ai|人工智能|大模型|智能).{0,8}(售前|解决方案)|ai售前|pre.?sales/i, "ai_presales"],
  [/数据产品|bi|business intelligence|数仓|数据经营|主数据/i, "data_product_manager"],
  [/产品经理|product manager|\bpm\b/i, "product_manager"],
];

const RESUME_HINT_RE = /简历|履历|resume|curriculum vitae|\bcv\b|教育经历|项目经历|工作经历|实习经历|专业技能|个人优势|求职意向/i;
const SAVE_EXCELLENT_RE = /(保存|存|沉淀|加入|放到).{0,12}(优秀|参考|标杆|样例|范例).{0,12}(简历|履历|resume|cv)|(优秀|参考|标杆|样例|范例).{0,12}(简历|履历|resume|cv).{0,12}(保存|存|沉淀|加入|放到)/i;

export function detectSaveExcellentResumeIntent(text: string): boolean {
  return SAVE_EXCELLENT_RE.test(text || "");
}

export function looksLikeResumeText(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  if (normalized.length < 120) return false;
  const hits = [
    /教育经历|education/i,
    /项目经历|projects?/i,
    /工作经历|experience|employment/i,
    /实习经历|intern/i,
    /专业技能|skills?/i,
    /个人优势|summary|profile/i,
  ].filter((pattern) => pattern.test(normalized)).length;
  return hits >= 2 || (RESUME_HINT_RE.test(normalized) && normalized.length >= 300);
}

export function normalizeRoleCategory(input: string | undefined, fallbackText = ""): string {
  const raw = normalizeWhitespace([input || "", fallbackText].filter(Boolean).join("\n"));
  for (const [pattern, role] of ROLE_ALIASES) {
    if (pattern.test(raw)) return role;
  }
  const cleaned = normalizeWhitespace(input || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "general";
}

export function normalizeReferenceVisibility(input: string | undefined): ReferenceResumeVisibility {
  const raw = (input || "private").trim().toLowerCase();
  if (raw === "team" || raw === "shared" || raw === "public" || raw === "lan") return "team";
  if (raw === "team_pending" || raw === "pending") return "team_pending";
  if (raw === "disabled") return "disabled";
  return "private";
}

export function buildReferenceResumeRawText(sections: ReferenceResumeSection[], fallback = ""): string {
  const text = sections
    .filter((section) => section.content?.trim())
    .map((section) => `[${section.title || section.id}]\n${section.content}`)
    .join("\n\n");
  return normalizeWhitespace(text || fallback);
}

export function redactReferenceResumeText(text: string): string {
  return normalizeWhitespace(text)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/(?:\+?86[-\s]?)?1[3-9]\d{9}/g, "[REDACTED_PHONE]")
    .replace(/\b\d{17}[\dXx]\b/g, "[REDACTED_ID]")
    .replace(/(微信|WeChat|wechat|wx|QQ|qq)[:：\s]*[A-Za-z0-9_-]{4,}/g, "$1: [REDACTED_CONTACT]")
    .replace(/(现居|地址|住址)[:：][^\n]{3,80}/g, "$1: [REDACTED_ADDRESS]");
}

export function scoreReferenceResumeQuality(input: {
  rawText: string;
  sections?: ReferenceResumeSection[];
}): number {
  const text = normalizeWhitespace(input.rawText);
  const sections = input.sections || [];
  let score = 0.2;
  if (text.length >= 800) score += 0.18;
  if (text.length >= 1800) score += 0.12;
  if (sections.length >= 4) score += 0.15;
  if (sections.some((s) => /experience|工作|实习/i.test(`${s.id} ${s.title}`))) score += 0.1;
  if (sections.some((s) => /project|项目/i.test(`${s.id} ${s.title}`))) score += 0.1;
  if (sections.some((s) => /skill|技能/i.test(`${s.id} ${s.title}`))) score += 0.08;
  if (/[0-9]+%|提升|增长|降低|优化|用户|收入|转化|留存|准确率|效率/i.test(text)) score += 0.12;
  if (looksLikeResumeText(text)) score += 0.05;
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

export async function indexReferenceResumeBestEffort(input: {
  referenceResumeId: number;
  ownerUserId: string;
  name: string;
  sections: ReferenceResumeSection[];
  rawText: string;
  roleCategory: string;
  visibility: ReferenceResumeVisibility;
  status: ReferenceResumeStatus;
  qualityScore: number;
  provider?: EmbeddingProvider;
}): Promise<ReferenceResumeIndexResult> {
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) {
    return { status: "skipped", chunks: 0, embedded: 0, failed: 0, reason: "PostgreSQL is not configured" };
  }

  const chunks = buildReferenceChunks(input);
  if (!chunks.length) {
    return { status: "skipped", chunks: 0, embedded: 0, failed: 0, reason: "No reference chunks to index" };
  }

  let provider = input.provider;
  if (!provider) {
    try {
      provider = createEmbeddingProvider();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      provider = {
        model: "embedding-unavailable",
        dimension: 1536,
        async embed() {
          throw new Error(reason);
        },
      };
    }
  }

  const embedded = await embedChunksWithRetry(chunks.map((chunk) => ({
    userId: input.ownerUserId,
    sourceType: "reference_resume",
    sourceId: String(input.referenceResumeId),
    chunkIndex: chunk.chunkIndex,
    chunkText: chunk.chunkText,
    contentHash: chunk.contentHash,
    metadata: chunk.metadata,
  })), provider);

  await withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("DELETE FROM reference_resume_chunks WHERE reference_resume_id=$1", [input.referenceResumeId]);
      for (const item of embedded) {
        const metadata = item.chunk.metadata as ReferenceChunkMetadata;
        const embedding = item.embedding ? vectorToSql(item.embedding) : null;
        await client.query(`
          INSERT INTO reference_resume_chunks (
            reference_resume_id, owner_user_id, visibility, status, role_category,
            section_type, chunk_index, chunk_text, content_hash, embedding_model,
            embedding_dimension, embedding, embedding_status, failure_reason,
            retry_count, quality_score, metadata_json, embedded_at, updated_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::vector,$13,$14,$15,$16,$17::jsonb,$18,now())
        `, [
          input.referenceResumeId,
          input.ownerUserId,
          input.visibility,
          input.status,
          input.roleCategory,
          metadata.sectionType || "",
          item.chunk.chunkIndex,
          item.chunk.chunkText,
          item.chunk.contentHash,
          item.embeddingModel,
          item.embeddingDimension,
          embedding,
          item.embeddingStatus,
          item.failureReason,
          item.retryCount,
          input.qualityScore,
          JSON.stringify(item.chunk.metadata || {}),
          item.embeddingStatus === "embedded" ? new Date().toISOString() : null,
        ]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  const embeddedCount = embedded.filter((item) => item.embeddingStatus === "embedded").length;
  const failed = embedded.length - embeddedCount;
  return {
    status: embeddedCount > 0 ? "indexed" : "failed",
    chunks: embedded.length,
    embedded: embeddedCount,
    failed,
    reason: failed ? embedded.find((item) => item.failureReason)?.failureReason : undefined,
  };
}

export async function reindexReferenceResumeRecord(
  resume: ReferenceResumeRow,
  ownerUserId?: string,
): Promise<ReferenceResumeIndexResult> {
  const resolvedOwner = resume.user_id || ownerUserId;
  if (!resolvedOwner) {
    return {
      status: "failed",
      chunks: 0,
      embedded: 0,
      failed: 0,
      reason: "Reference resume owner is missing",
    };
  }

  const sections = parseReferenceResumeSections(resume.sections_json);
  const visibility = normalizeReferenceVisibility(resume.visibility);
  const status = resume.status === "pending"
    ? "pending"
    : resume.status === "disabled" || visibility === "disabled"
      ? "disabled"
      : "active";
  const rawText = visibility === "private"
    ? resume.raw_text
    : resume.shared_text_redacted || redactReferenceResumeText(resume.raw_text);

  return indexReferenceResumeBestEffort({
    referenceResumeId: Number(resume.id),
    ownerUserId: resolvedOwner,
    name: resume.name,
    sections,
    rawText,
    roleCategory: resume.role_category || "general",
    visibility,
    status,
    qualityScore: Number(resume.quality_score || 0),
  });
}

export async function retrieveReferenceResumeSnippets(input: {
  userId: string;
  query: string;
  roleCategory?: string;
  sectionType?: string;
  limit?: number;
  provider?: EmbeddingProvider;
}): Promise<ReferenceResumeSnippet[]> {
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) return [];
  const trimmed = normalizeWhitespace(input.query);
  if (!trimmed) return [];

  let queryEmbedding: number[];
  try {
    const provider = input.provider || createEmbeddingProvider();
    [queryEmbedding] = await provider.embed([trimmed]);
  } catch {
    return [];
  }

  const query = buildReferenceResumeRetrievalQuery({
    queryEmbedding,
    userId: input.userId,
    roleCategory: input.roleCategory,
    fallbackText: trimmed,
    sectionType: input.sectionType,
    limit: input.limit,
  });

  const result = await withPostgresClient(async (client) => client.query(query.sql, query.params));

  return result.rows
    .map((row) => toReferenceSnippet(row as Record<string, unknown>, query.roleCategory))
    .sort((a, b) => b.score - a.score)
    .slice(0, query.limit);
}

export function buildReferenceResumeRetrievalQuery(input: {
  queryEmbedding: number[];
  userId: string;
  roleCategory?: string;
  fallbackText?: string;
  sectionType?: string;
  limit?: number;
}): ReferenceResumeRetrievalQuery {
  const roleCategory = normalizeRoleCategory(input.roleCategory, input.fallbackText || "");
  const limit = Math.max(1, Math.min(input.limit || 5, 12));
  const params: unknown[] = [vectorToSql(input.queryEmbedding), input.userId];
  const clauses = [
    "c.embedding_status = 'embedded'",
    "c.embedding IS NOT NULL",
    "c.status = 'active'",
    "((c.owner_user_id = $2 AND c.visibility IN ('private','team_pending','team')) OR c.visibility = 'team')",
  ];
  if (roleCategory && roleCategory !== "general") {
    params.push([roleCategory, "general", ""]);
    clauses.push(`c.role_category = ANY($${params.length}::text[])`);
  }
  if (input.sectionType) {
    params.push(input.sectionType);
    clauses.push(`(c.section_type = $${params.length} OR c.section_type = '')`);
  }
  params.push(Math.min(limit * 3, 30));

  return {
    sql: `
    SELECT c.id, c.reference_resume_id, c.owner_user_id, c.visibility, c.role_category,
      c.section_type, c.chunk_text, c.quality_score, c.metadata_json,
      r.name, r.tags, 1 - (c.embedding <=> $1::vector) AS similarity
      , COALESCE(usage.accepted_count, 0) AS accepted_count
      , COALESCE(usage.rejected_count, 0) AS rejected_count
    FROM reference_resume_chunks c
    JOIN reference_resumes r ON r.id = c.reference_resume_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE accepted IS TRUE) AS accepted_count,
        COUNT(*) FILTER (WHERE accepted IS FALSE) AS rejected_count
      FROM reference_resume_usage
      WHERE reference_resume_id = c.reference_resume_id
        AND (
          COALESCE(metadata_json->'snippetIds', '[]'::jsonb) = '[]'::jsonb
          OR COALESCE(metadata_json->'snippetIds', '[]'::jsonb) @> to_jsonb(c.id)
        )
        AND (
          task_type = 'cv_optimize'
          OR COALESCE(metadata_json->>'taskType', '') = 'cv_optimize'
          OR COALESCE(task_type, '') = ''
        )
        AND (
          COALESCE(metadata_json->>'roleCategory', '') = ''
          OR COALESCE(metadata_json->>'roleCategory', '') = c.role_category
          OR c.role_category = ''
        )
        AND (
          COALESCE(metadata_json->>'sectionId', '') = ''
          OR COALESCE(metadata_json->>'sectionId', '') = c.section_type
          OR c.section_type = ''
        )
    ) usage ON TRUE
    WHERE ${clauses.join(" AND ")}
    ORDER BY c.embedding <=> $1::vector ASC, c.updated_at DESC
    LIMIT $${params.length}
  `,
    params,
    roleCategory,
    limit,
  };
}

export async function recordReferenceResumeUsage(input: {
  referenceResumeId: number;
  userId: string;
  taskType?: string;
  targetJdId?: number;
  accepted?: boolean;
  feedback?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) return;
  await withPostgresClient(async (client) => {
    await client.query(`
      INSERT INTO reference_resume_usage (
        reference_resume_id, user_id, task_type, target_jd_id, accepted, feedback, metadata_json
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
    `, [
      input.referenceResumeId,
      input.userId,
      input.taskType || "cv_optimize",
      input.targetJdId || null,
      input.accepted ?? null,
      input.feedback || "",
      JSON.stringify(input.metadata || {}),
    ]);
  });
}

type ReferenceChunkMetadata = Record<string, unknown> & {
  sectionType?: string;
  sectionTitle?: string;
  roleCategory?: string;
  visibility?: string;
  referenceName?: string;
};

function buildReferenceChunks(input: {
  referenceResumeId: number;
  name: string;
  sections: ReferenceResumeSection[];
  rawText: string;
  roleCategory: string;
  visibility: ReferenceResumeVisibility;
  qualityScore: number;
}) {
  const sections = input.sections.length
    ? input.sections
    : [{ id: "raw", title: "Raw resume", content: input.rawText }];
  const chunks: Array<{ chunkIndex: number; chunkText: string; contentHash: string; metadata: ReferenceChunkMetadata }> = [];

  for (const section of sections) {
    const content = normalizeWhitespace(section.content || "");
    if (!content) continue;
    const sectionType = normalizeSectionType(section.id || section.title);
    const parts = splitReferenceSection(content);
    for (const part of parts) {
      const chunkText = normalizeWhitespace(`${input.name}\n[${section.title || sectionType}]\n${part}`);
      chunks.push({
        chunkIndex: chunks.length,
        chunkText,
        contentHash: stableHash(`${input.referenceResumeId}:${chunks.length}:${chunkText}`),
        metadata: {
          sectionType,
          sectionTitle: section.title || section.id,
          roleCategory: input.roleCategory,
          visibility: input.visibility,
          referenceName: input.name,
        },
      });
    }
  }

  return chunks;
}

function splitReferenceSection(text: string, maxChars = 1200): string[] {
  if (text.length <= maxChars) return [text];
  const paragraphs = text.split(/\n{2,}|(?=^[*-]\s+)/m).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n${paragraph}` : paragraph;
    if (next.length <= maxChars) current = next;
    else {
      if (current) chunks.push(current);
      current = paragraph.length > maxChars ? paragraph.slice(0, maxChars) : paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function normalizeSectionType(value: string): string {
  const raw = value.toLowerCase();
  if (/summary|profile|个人|概述/.test(raw)) return "summary";
  if (/experience|工作|实习/.test(raw)) return "experience";
  if (/project|项目/.test(raw)) return "projects";
  if (/skill|技能/.test(raw)) return "skills";
  if (/education|教育/.test(raw)) return "education";
  return raw.replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "other";
}

function toReferenceSnippet(row: Record<string, unknown>, roleCategory: string): ReferenceResumeSnippet {
  const similarity = normalizeScore(Number(row.similarity ?? 0));
  const quality = normalizeScore(Number(row.quality_score ?? 0));
  const rowRole = String(row.role_category || "");
  const roleScore = rowRole === roleCategory ? 1 : rowRole === "general" || !rowRole ? 0.65 : 0.35;
  const acceptedCount = Number(row.accepted_count || 0);
  const rejectedCount = Number(row.rejected_count || 0);
  const feedbackTrustScore = computeFeedbackTrustScore(acceptedCount, rejectedCount);
  const score = computeReferenceSnippetScore({
    similarity,
    quality,
    roleScore,
    acceptedCount,
    rejectedCount,
  });
  const metadata = parseMetadata(row.metadata_json);
  return {
    id: Number(row.id),
    referenceResumeId: Number(row.reference_resume_id),
    name: String(row.name || ""),
    roleCategory: rowRole,
    sectionType: String(row.section_type || ""),
    snippet: compactSnippet(String(row.chunk_text || "")),
    similarity,
    score,
    visibility: normalizeReferenceVisibility(String(row.visibility || "private")),
    metadata: {
      ...metadata,
      ranking: {
        similarity,
        quality,
        roleScore,
        feedbackTrustScore,
        acceptedCount,
        rejectedCount,
      },
    },
    ranking: {
      similarity,
      quality,
      roleScore,
      feedbackTrustScore,
      acceptedCount,
      rejectedCount,
    },
  };
}

export function computeReferenceSnippetScore(input: {
  similarity: number;
  quality: number;
  roleScore: number;
  acceptedCount?: number;
  rejectedCount?: number;
}): number {
  const accepted = Math.max(0, Number(input.acceptedCount || 0));
  const rejected = Math.max(0, Number(input.rejectedCount || 0));
  const feedbackScore = computeFeedbackTrustScore(accepted, rejected);
  const score = (normalizeScore(input.similarity) * 0.68)
    + (normalizeScore(input.quality) * 0.18)
    + (normalizeScore(input.roleScore) * 0.1)
    + (feedbackScore * 0.04);
  return Number(score.toFixed(4));
}

function computeFeedbackTrustScore(accepted: number, rejected: number): number {
  const total = accepted + rejected;
  return total > 0 ? (accepted + 1) / (total + 2) : 0.5;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function compactSnippet(text: string, maxChars = 520): string {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1).trim()}...`;
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return {};
}

function parseReferenceResumeSections(value: string | undefined): ReferenceResumeSection[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        return {
          id: String(row.id || ""),
          title: String(row.title || row.id || ""),
          content: String(row.content || ""),
        };
      })
      .filter((item): item is ReferenceResumeSection => Boolean(item?.content.trim()));
  } catch {
    return [];
  }
}

function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
