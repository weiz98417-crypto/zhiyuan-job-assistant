import { getDataRepositories } from "@/lib/data-repositories";
import { getDatabaseDriver, isPostgresConfigured, withPostgresClient } from "@/lib/postgres";
import { redactReferenceResumeText } from "@/lib/reference-resume-vector";
import { getDb, type ReferenceResumeRow } from "@/lib/server-db";

export interface MemoryGovernanceFilters {
  roleCategory?: string;
  sourceType?: string;
  visibility?: string;
  status?: string;
  owner?: string;
}

export interface ReferenceUsageSummary {
  total: number;
  accepted: number;
  rejected: number;
  lastUsedAt: string | null;
  recent: Array<{
    id: number;
    taskType: string;
    accepted: boolean | null;
    feedback: string;
    metadata: Record<string, unknown>;
    createdAt: string | null;
  }>;
}

export interface GovernanceReference {
  id: number;
  ownerUserId: string | null;
  ownerLabel: string;
  name: string;
  source: string;
  roleCategory: string;
  visibility: string;
  status: string;
  qualityScore: number;
  anonymized: boolean;
  tags: string[];
  notes: string;
  previewText: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  usage: ReferenceUsageSummary;
  riskReasons: string[];
}

export interface EmbeddingHealthItem {
  id: number;
  sourceKind: "reference_resume" | "memory";
  sourceId: string;
  name: string;
  ownerUserId: string | null;
  roleCategory: string;
  visibility: string;
  embeddingStatus: string;
  failureReason: string;
  retryCount: number;
  embeddingModel: string;
  updatedAt: string | null;
}

export interface CandidateMemoryItem {
  id: number;
  userId: string;
  memoryType: string;
  canonicalText: string;
  status: string;
  confidence: number;
  importance: number;
  sourceCount: number;
  evidence: Array<{
    id: number;
    sourceType: string;
    sourceId: string;
    quote: string;
    confidence: number;
    extractionMethod: string;
  }>;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MemoryGovernanceOverview {
  driver: string;
  vectorStoreAvailable: boolean;
  filters: MemoryGovernanceFilters;
  health: {
    referencesTotal: number;
    teamShared: number;
    pending: number;
    disabled: number;
    indexFailed: number;
    lowQuality: number;
    averageQuality: number;
    memoryItems: Record<string, number>;
    referenceChunks: Record<string, number>;
    memoryChunks: Record<string, number>;
  };
  references: GovernanceReference[];
  queues: {
    pendingTeamReferences: GovernanceReference[];
    embeddingHealth: EmbeddingHealthItem[];
    candidatePatterns: CandidateMemoryItem[];
    riskyReferences: GovernanceReference[];
  };
}

type ReferenceRow = ReferenceResumeRow & {
  owner_label?: string | null;
  owner_username?: string | null;
};

type UsageRow = {
  reference_resume_id: number | string;
  total_usage: number | string;
  accepted_count: number | string;
  rejected_count: number | string;
  last_used_at?: string | Date | null;
  recent_usage?: unknown;
};

const EMPTY_USAGE: ReferenceUsageSummary = {
  total: 0,
  accepted: 0,
  rejected: 0,
  lastUsedAt: null,
  recent: [],
};

export async function listMemoryGovernanceOverview(
  filters: MemoryGovernanceFilters = {},
): Promise<MemoryGovernanceOverview> {
  const [referenceRows, usageRows, vectorData] = await Promise.all([
    listReferenceRows(),
    listReferenceUsageRows(),
    listVectorGovernanceData(),
  ]);

  const usageByReference = new Map<number, ReferenceUsageSummary>();
  for (const row of usageRows) {
    usageByReference.set(Number(row.reference_resume_id), {
      total: Number(row.total_usage || 0),
      accepted: Number(row.accepted_count || 0),
      rejected: Number(row.rejected_count || 0),
      lastUsedAt: toIsoString(row.last_used_at),
      recent: normalizeRecentUsage(row.recent_usage),
    });
  }

  const references = referenceRows
    .map((row) => toGovernanceReference(row, usageByReference.get(Number(row.id)) || EMPTY_USAGE))
    .filter((item) => matchesReferenceFilters(item, filters));

  const qualityScores = references
    .map((item) => item.qualityScore)
    .filter((score) => Number.isFinite(score) && score > 0);

  const pendingTeamReferences = references.filter(
    (item) => item.visibility === "team_pending" || item.status === "pending",
  );
  const riskyReferences = references.filter((item) => item.riskReasons.length > 0);

  return {
    driver: getDatabaseDriver(),
    vectorStoreAvailable: vectorData.available,
    filters,
    health: {
      referencesTotal: references.length,
      teamShared: references.filter((item) => item.visibility === "team" && item.status !== "disabled").length,
      pending: pendingTeamReferences.length,
      disabled: references.filter((item) => item.status === "disabled" || item.visibility === "disabled").length,
      indexFailed: references.filter((item) => item.status === "index_failed").length,
      lowQuality: references.filter((item) => item.qualityScore > 0 && item.qualityScore < 0.55).length,
      averageQuality: qualityScores.length
        ? Number((qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length).toFixed(3))
        : 0,
      memoryItems: vectorData.memoryItemStats,
      referenceChunks: vectorData.referenceChunkStats,
      memoryChunks: vectorData.memoryChunkStats,
    },
    references,
    queues: {
      pendingTeamReferences,
      embeddingHealth: vectorData.embeddingHealth,
      candidatePatterns: vectorData.candidatePatterns,
      riskyReferences,
    },
  };
}

export async function referenceHasUsage(referenceResumeId: number): Promise<boolean> {
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) return false;
  return withPostgresClient(async (client) => Boolean((await client.query(
    "SELECT 1 FROM reference_resume_usage WHERE reference_resume_id=$1 LIMIT 1",
    [referenceResumeId],
  )).rowCount));
}

export async function updateMemoryItemStatus(
  id: number,
  status: "candidate" | "active" | "rejected" | "archived",
): Promise<boolean> {
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) return false;
  return withPostgresClient(async (client) => Boolean((await client.query(
    "UPDATE memory_items SET status=$1, updated_at=now() WHERE id=$2",
    [status, id],
  )).rowCount));
}

export async function deleteMemoryItem(id: number): Promise<boolean> {
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) return false;
  return withPostgresClient(async (client) => Boolean((await client.query(
    "DELETE FROM memory_items WHERE id=$1",
    [id],
  )).rowCount));
}

async function listReferenceRows(): Promise<ReferenceRow[]> {
  if (getDatabaseDriver() === "postgres") {
    if (!isPostgresConfigured()) return [];
    return withPostgresClient(async (client) => {
      const result = await client.query(`
        SELECT
          rr.id, rr.user_id, rr.name, rr.source, rr.sections_json, rr.raw_text,
          rr.tags, rr.notes, rr.role_category, rr.industry_tags, rr.seniority,
          rr.visibility, rr.status, rr.quality_score, rr.anonymized,
          rr.shared_text_redacted, rr.source_hash, rr.metadata_json,
          rr.approved_by, rr.approved_at, rr.updated_at, rr.created_at,
          COALESCE(u.display_name, u.username, rr.user_id, '未归属') AS owner_label,
          u.username AS owner_username
        FROM reference_resumes rr
        LEFT JOIN users u ON u.id = rr.user_id
        ORDER BY rr.created_at DESC
        LIMIT 500
      `);
      return result.rows as ReferenceRow[];
    });
  }

  return getDb().prepare(`
    SELECT
      rr.*,
      COALESCE(u.display_name, u.username, rr.user_id, '未归属') AS owner_label,
      u.username AS owner_username
    FROM reference_resumes rr
    LEFT JOIN users u ON u.id = rr.user_id
    ORDER BY rr.created_at DESC
    LIMIT 500
  `).all() as ReferenceRow[];
}

async function listReferenceUsageRows(): Promise<UsageRow[]> {
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) return [];
  return withPostgresClient(async (client) => {
    const result = await client.query(`
      WITH usage_summary AS (
        SELECT
          reference_resume_id,
          COUNT(*) AS total_usage,
          COUNT(*) FILTER (WHERE accepted IS TRUE) AS accepted_count,
          COUNT(*) FILTER (WHERE accepted IS FALSE) AS rejected_count,
          MAX(created_at) AS last_used_at
        FROM reference_resume_usage
        GROUP BY reference_resume_id
      )
      SELECT
        s.*,
        COALESCE(recent.recent_usage, '[]'::json) AS recent_usage
      FROM usage_summary s
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', u.id,
            'taskType', u.task_type,
            'accepted', u.accepted,
            'feedback', u.feedback,
            'metadata', u.metadata_json,
            'createdAt', u.created_at
          )
          ORDER BY u.created_at DESC
        ) AS recent_usage
        FROM (
          SELECT id, task_type, accepted, feedback, metadata_json, created_at
          FROM reference_resume_usage
          WHERE reference_resume_id = s.reference_resume_id
          ORDER BY created_at DESC
          LIMIT 5
        ) u
      ) recent ON TRUE
    `);
    return result.rows as UsageRow[];
  });
}

async function listVectorGovernanceData(): Promise<{
  available: boolean;
  embeddingHealth: EmbeddingHealthItem[];
  candidatePatterns: CandidateMemoryItem[];
  memoryItemStats: Record<string, number>;
  referenceChunkStats: Record<string, number>;
  memoryChunkStats: Record<string, number>;
}> {
  const empty = {
    available: false,
    embeddingHealth: [] as EmbeddingHealthItem[],
    candidatePatterns: [] as CandidateMemoryItem[],
    memoryItemStats: {} as Record<string, number>,
    referenceChunkStats: {} as Record<string, number>,
    memoryChunkStats: {} as Record<string, number>,
  };
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) return empty;

  return withPostgresClient(async (client) => {
    const [referenceChunkStats, memoryChunkStats, memoryItemStats, referenceHealth, memoryHealth, candidatePatterns] = await Promise.all([
      client.query("SELECT embedding_status, COUNT(*) AS count FROM reference_resume_chunks GROUP BY embedding_status"),
      client.query("SELECT embedding_status, COUNT(*) AS count FROM memory_chunks GROUP BY embedding_status"),
      client.query("SELECT status, COUNT(*) AS count FROM memory_items GROUP BY status"),
      client.query(`
        SELECT
          c.id, c.reference_resume_id AS source_id, r.name, c.owner_user_id,
          c.role_category, c.visibility, c.embedding_status, c.failure_reason,
          c.retry_count, c.embedding_model, c.updated_at
        FROM reference_resume_chunks c
        JOIN reference_resumes r ON r.id = c.reference_resume_id
        WHERE c.embedding_status = 'failed'
           OR (c.embedding_status = 'pending' AND c.updated_at < now() - interval '10 minutes')
        ORDER BY c.updated_at DESC
        LIMIT 80
      `),
      client.query(`
        SELECT
          c.id, c.source_id, c.source_type, c.user_id, c.embedding_status,
          c.failure_reason, c.retry_count, c.embedding_model, c.updated_at
        FROM memory_chunks c
        WHERE c.embedding_status = 'failed'
           OR (c.embedding_status = 'pending' AND c.updated_at < now() - interval '10 minutes')
        ORDER BY c.updated_at DESC
        LIMIT 80
      `),
      client.query(`
        SELECT
          mi.id, mi.user_id, mi.memory_type, mi.canonical_text, mi.status,
          mi.confidence, mi.importance, mi.source_count, mi.created_at, mi.updated_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', me.id,
                'sourceType', me.source_type,
                'sourceId', me.source_id,
                'quote', me.quote,
                'confidence', me.confidence,
                'extractionMethod', me.extraction_method
              )
              ORDER BY me.created_at DESC
            ) FILTER (WHERE me.id IS NOT NULL),
            '[]'::json
          ) AS evidence
        FROM memory_items mi
        LEFT JOIN memory_evidence me ON me.memory_item_id = mi.id
        WHERE mi.status = 'candidate'
        GROUP BY mi.id
        ORDER BY
          mi.importance DESC,
          mi.confidence DESC,
          mi.updated_at DESC
        LIMIT 80
      `),
    ]);

    return {
      available: true,
      embeddingHealth: [
        ...referenceHealth.rows.map((row) => ({
          id: Number(row.id),
          sourceKind: "reference_resume" as const,
          sourceId: String(row.source_id || ""),
          name: String(row.name || ""),
          ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
          roleCategory: String(row.role_category || ""),
          visibility: String(row.visibility || ""),
          embeddingStatus: String(row.embedding_status || ""),
          failureReason: String(row.failure_reason || ""),
          retryCount: Number(row.retry_count || 0),
          embeddingModel: String(row.embedding_model || ""),
          updatedAt: toIsoString(row.updated_at),
        })),
        ...memoryHealth.rows.map((row) => ({
          id: Number(row.id),
          sourceKind: "memory" as const,
          sourceId: String(row.source_id || ""),
          name: String(row.source_type || "memory"),
          ownerUserId: row.user_id ? String(row.user_id) : null,
          roleCategory: "",
          visibility: "",
          embeddingStatus: String(row.embedding_status || ""),
          failureReason: String(row.failure_reason || ""),
          retryCount: Number(row.retry_count || 0),
          embeddingModel: String(row.embedding_model || ""),
          updatedAt: toIsoString(row.updated_at),
        })),
      ],
      candidatePatterns: candidatePatterns.rows.map((row) => ({
        id: Number(row.id),
        userId: String(row.user_id || ""),
        memoryType: String(row.memory_type || ""),
        canonicalText: compactText(String(row.canonical_text || ""), 320),
        status: String(row.status || ""),
        confidence: Number(row.confidence || 0),
        importance: Number(row.importance || 0),
        sourceCount: Number(row.source_count || 0),
        evidence: normalizeEvidence(row.evidence),
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at),
      })),
      memoryItemStats: rowsToCountMap(memoryItemStats.rows, "status"),
      referenceChunkStats: rowsToCountMap(referenceChunkStats.rows, "embedding_status"),
      memoryChunkStats: rowsToCountMap(memoryChunkStats.rows, "embedding_status"),
    };
  });
}

function toGovernanceReference(row: ReferenceRow, usage: ReferenceUsageSummary): GovernanceReference {
  const visibility = String(row.visibility || "private");
  const status = String(row.status || "active");
  const qualityScore = Number(row.quality_score || 0);
  const riskReasons: string[] = [];
  if (qualityScore > 0 && qualityScore < 0.55) riskReasons.push("quality_low");
  if (status === "index_failed") riskReasons.push("index_failed");
  if (usage.total >= 3 && usage.rejected > usage.accepted) riskReasons.push("high_rejection");

  const sharedText = String(row.shared_text_redacted || "");
  const rawPreview = visibility === "private"
    ? redactReferenceResumeText(String(row.raw_text || ""))
    : sharedText || redactReferenceResumeText(String(row.raw_text || ""));

  return {
    id: Number(row.id),
    ownerUserId: row.user_id ? String(row.user_id) : null,
    ownerLabel: String(row.owner_label || row.owner_username || row.user_id || "未归属"),
    name: String(row.name || ""),
    source: String(row.source || ""),
    roleCategory: String(row.role_category || ""),
    visibility,
    status,
    qualityScore,
    anonymized: Boolean(row.anonymized),
    tags: parseStringArray(row.tags),
    notes: String(row.notes || ""),
    previewText: compactText(rawPreview, 280),
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    approvedAt: toIsoString(row.approved_at),
    createdAt: toIsoString(row.created_at) || "",
    updatedAt: toIsoString(row.updated_at),
    usage,
    riskReasons,
  };
}

function matchesReferenceFilters(item: GovernanceReference, filters: MemoryGovernanceFilters): boolean {
  if (filters.roleCategory && item.roleCategory !== filters.roleCategory) return false;
  if (filters.sourceType && item.source !== filters.sourceType) return false;
  if (filters.visibility && item.visibility !== filters.visibility) return false;
  if (filters.status && item.status !== filters.status) return false;
  if (filters.owner) {
    const needle = filters.owner.toLowerCase();
    const haystack = `${item.ownerUserId || ""} ${item.ownerLabel}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function normalizeEvidence(value: unknown): CandidateMemoryItem["evidence"] {
  let raw: unknown = [];
  if (Array.isArray(value)) {
    raw = value;
  } else if (typeof value === "string") {
    try {
      raw = JSON.parse(value || "[]");
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 5).map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      id: Number(row.id || 0),
      sourceType: String(row.sourceType || row.source_type || ""),
      sourceId: String(row.sourceId || row.source_id || ""),
      quote: compactText(String(row.quote || ""), 240),
      confidence: Number(row.confidence || 0),
      extractionMethod: String(row.extractionMethod || row.extraction_method || ""),
    };
  });
}

function normalizeRecentUsage(value: unknown): ReferenceUsageSummary["recent"] {
  let raw: unknown = [];
  if (Array.isArray(value)) {
    raw = value;
  } else if (typeof value === "string") {
    try {
      raw = JSON.parse(value || "[]");
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 5).map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      id: Number(row.id || 0),
      taskType: String(row.taskType || row.task_type || ""),
      accepted: typeof row.accepted === "boolean" ? row.accepted : null,
      feedback: String(row.feedback || ""),
      metadata: normalizeRecord(row.metadata),
      createdAt: toIsoString(row.createdAt || row.created_at),
    };
  });
}

function normalizeRecord(value: unknown): Record<string, unknown> {
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

function rowsToCountMap(rows: Array<Record<string, unknown>>, key: string): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    const name = String(row[key] || "unknown");
    map[name] = Number(row.count || 0);
  }
  return map;
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function compactText(text: string, maxChars: number): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1).trim()}...`;
}

export async function deleteReferenceResumePreferDisable(id: number): Promise<{
  deleted: boolean;
  disabled: boolean;
  reason?: string;
}> {
  const repos = getDataRepositories();
  if (await referenceHasUsage(id)) {
    const ok = await repos.referenceResumes.update(id, {
      visibility: "disabled",
      status: "disabled",
    });
    return {
      deleted: false,
      disabled: ok,
      reason: "historical_usage",
    };
  }
  const deleted = await repos.referenceResumes.delete(id);
  return { deleted, disabled: false };
}
