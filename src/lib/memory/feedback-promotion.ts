import { getDatabaseDriver, isPostgresConfigured, withPostgresClient } from "@/lib/postgres";
import { EXCELLENT_RESUME_PATTERN_MEMORY_TYPE } from "@/lib/excellent-resume-patterns";
import { recordReferenceResumeUsage } from "@/lib/reference-resume-vector";

export type MemoryFeedbackAction = "accepted" | "saved" | "rejected" | "dismissed" | "heavily_edited";
export type PromotionMemoryStatus = "candidate" | "active" | "rejected" | "archived";
export type TransitionActorRole = "owner" | "admin" | "system";

export interface ReferenceMemoryFeedbackInput {
  snippetIds?: number[];
  referenceResumeIds?: number[];
  patternMemoryIds?: number[];
}

export interface RecordOptimizationMemoryFeedbackInput {
  userId: string;
  action: string;
  referenceMemory?: ReferenceMemoryFeedbackInput | null;
  taskType?: string;
  roleCategory?: string;
  sectionId?: string;
  operation?: string;
  variantType?: string;
  targetJdId?: number;
  originalText?: string;
  optimizedText?: string;
  editedText?: string;
  feedbackText?: string;
}

export interface MemoryFeedbackStats {
  positive: number;
  negative: number;
  accepted: number;
  saved: number;
  rejected: number;
  dismissed: number;
  heavilyEdited: number;
  lastAction: MemoryFeedbackAction | null;
  lastActionAt: string | null;
  scopes: Record<string, {
    positive: number;
    negative: number;
    lastAction: MemoryFeedbackAction;
    lastActionAt: string;
  }>;
}

export interface PromotionDecision {
  nextStatus: PromotionMemoryStatus;
  reason: string;
  trustScore: number;
  changed: boolean;
  needsAdminApproval: boolean;
}

const POSITIVE_ACTIONS = new Set<MemoryFeedbackAction>(["accepted", "saved"]);
const NEGATIVE_ACTIONS = new Set<MemoryFeedbackAction>(["rejected", "dismissed", "heavily_edited"]);
const PROMOTION_POSITIVE_THRESHOLD = 3;
const DEMOTION_NEGATIVE_THRESHOLD = 3;
const GENERIC_PATTERN_TERMS = new Set([
  "\u4e1a\u52a1", // 业务
  "\u6280\u672f", // 技术
  "\u80fd\u529b", // 能力
  "\u6c9f\u901a", // 沟通
  "\u8d1f\u8d23", // 负责
  "\u53c2\u4e0e", // 参与
  "\u4f18\u79c0", // 优秀
  "\u7075\u6027", // 灵性
  "api",
]);

export function normalizeMemoryFeedbackAction(action: string): MemoryFeedbackAction {
  const raw = (action || "").trim().toLowerCase();
  if (raw === "accept" || raw === "accepted" || raw === "use" || raw === "used") return "accepted";
  if (raw === "save" || raw === "saved") return "saved";
  if (raw === "reject" || raw === "rejected") return "rejected";
  if (raw === "dismiss" || raw === "dismissed" || raw === "ignore" || raw === "ignored") return "dismissed";
  if (raw === "heavily_edit" || raw === "heavily_edited" || raw === "modified" || raw === "edit") return "heavily_edited";
  return "dismissed";
}

export function buildEmptyFeedbackStats(): MemoryFeedbackStats {
  return {
    positive: 0,
    negative: 0,
    accepted: 0,
    saved: 0,
    rejected: 0,
    dismissed: 0,
    heavilyEdited: 0,
    lastAction: null,
    lastActionAt: null,
    scopes: {},
  };
}

export function updateFeedbackStats(input: {
  previous?: unknown;
  action: MemoryFeedbackAction;
  scopeKey: string;
  timestamp?: string;
}): MemoryFeedbackStats {
  const stats = parseFeedbackStats(input.previous);
  const timestamp = input.timestamp || new Date().toISOString();
  if (POSITIVE_ACTIONS.has(input.action)) stats.positive += 1;
  if (NEGATIVE_ACTIONS.has(input.action)) stats.negative += 1;
  if (input.action === "accepted") stats.accepted += 1;
  if (input.action === "saved") stats.saved += 1;
  if (input.action === "rejected") stats.rejected += 1;
  if (input.action === "dismissed") stats.dismissed += 1;
  if (input.action === "heavily_edited") stats.heavilyEdited += 1;
  stats.lastAction = input.action;
  stats.lastActionAt = timestamp;

  const scoped = stats.scopes[input.scopeKey] || {
    positive: 0,
    negative: 0,
    lastAction: input.action,
    lastActionAt: timestamp,
  };
  if (POSITIVE_ACTIONS.has(input.action)) scoped.positive += 1;
  if (NEGATIVE_ACTIONS.has(input.action)) scoped.negative += 1;
  scoped.lastAction = input.action;
  scoped.lastActionAt = timestamp;
  stats.scopes[input.scopeKey] = scoped;

  return stats;
}

export function decideMemoryPromotion(input: {
  status: PromotionMemoryStatus | string;
  visibility?: string;
  confidence: number;
  importance: number;
  sourceCount: number;
  stats: MemoryFeedbackStats;
  policyEligible?: boolean;
  text?: string;
}): PromotionDecision {
  const status = normalizePromotionStatus(input.status);
  const confidence = clamp01(input.confidence);
  const importance = clamp01(input.importance);
  const trustScore = computeFeedbackTrustScore(input.stats);
  const text = normalizeText(input.text || "");
  const policyEligible = input.policyEligible !== false
    && text.length >= 32
    && !looksGenericPattern(text);

  if (status === "archived" || status === "rejected") {
    return {
      nextStatus: status,
      reason: `status_${status}_excluded`,
      trustScore,
      changed: false,
      needsAdminApproval: false,
    };
  }

  if (!policyEligible) {
    return {
      nextStatus: "rejected",
      reason: "policy_or_quality_ineligible",
      trustScore,
      changed: true,
      needsAdminApproval: false,
    };
  }

  if (
    input.stats.negative >= DEMOTION_NEGATIVE_THRESHOLD
    && input.stats.negative > input.stats.positive
  ) {
    return {
      nextStatus: "rejected",
      reason: "repeated_negative_feedback",
      trustScore,
      changed: true,
      needsAdminApproval: false,
    };
  }

  if (
    status === "candidate"
    && input.stats.positive >= PROMOTION_POSITIVE_THRESHOLD
    && input.stats.negative === 0
    && confidence >= 0.65
    && importance >= 0.55
    && input.sourceCount >= 1
  ) {
    const needsAdminApproval = input.visibility === "team";
    return {
      nextStatus: needsAdminApproval ? "candidate" : "active",
      reason: needsAdminApproval ? "awaiting_admin_approval" : "repeated_positive_feedback",
      trustScore,
      changed: !needsAdminApproval,
      needsAdminApproval,
    };
  }

  return {
    nextStatus: status,
    reason: "insufficient_feedback",
    trustScore,
    changed: false,
    needsAdminApproval: false,
  };
}

export function canTransitionMemoryStatus(input: {
  actorRole: TransitionActorRole;
  currentStatus: PromotionMemoryStatus | string;
  nextStatus: PromotionMemoryStatus | string;
  visibility?: string;
}): boolean {
  const current = normalizePromotionStatus(input.currentStatus);
  const next = normalizePromotionStatus(input.nextStatus);
  if (current === next) return true;
  if (input.actorRole === "admin") return true;
  if (input.actorRole === "system") {
    if (current === "candidate" && next === "active" && input.visibility !== "team") return true;
    if ((current === "candidate" || current === "active") && next === "rejected") return true;
    return false;
  }
  if (input.actorRole === "owner") {
    return next === "archived" || (current === "archived" && next === "candidate");
  }
  return false;
}

export function computeFeedbackTrustScore(stats: Pick<MemoryFeedbackStats, "positive" | "negative">): number {
  const positive = Math.max(0, Number(stats.positive || 0));
  const negative = Math.max(0, Number(stats.negative || 0));
  const total = positive + negative;
  if (!total) return 0.5;
  return Number(((positive + 1) / (total + 2)).toFixed(4));
}

export function computeEditDistanceRatio(a = "", b = ""): number {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left && !right) return 0;
  if (!left || !right) return 1;
  const maxLength = Math.max(left.length, right.length);
  const previous = new Array(right.length + 1).fill(0).map((_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const temp = previous[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + cost,
      );
      diagonal = temp;
    }
  }
  return Number((previous[right.length] / maxLength).toFixed(4));
}

export function buildFeedbackScopeKey(input: {
  taskType?: string;
  roleCategory?: string;
  sectionId?: string;
  operation?: string;
}): string {
  return [
    input.taskType || "cv_optimize",
    normalizeText(input.roleCategory || "general") || "general",
    normalizeText(input.sectionId || "general") || "general",
    normalizeText(input.operation || "general") || "general",
  ].join("|");
}

export async function recordOptimizationMemoryFeedback(
  input: RecordOptimizationMemoryFeedbackInput,
): Promise<{
  referenceUsageRecorded: number;
  patternFeedbackRecorded: number;
  promoted: number;
  rejected: number;
  skipped: boolean;
}> {
  const action = normalizeMemoryFeedbackAction(input.action);
  const referenceResumeIds = uniquePositiveIntegers(input.referenceMemory?.referenceResumeIds);
  const patternMemoryIds = uniquePositiveIntegers(input.referenceMemory?.patternMemoryIds);
  const snippetIds = uniquePositiveIntegers(input.referenceMemory?.snippetIds);
  const taskType = input.taskType || "cv_optimize";
  const editDistanceRatio = input.editedText
    ? computeEditDistanceRatio(input.optimizedText || "", input.editedText)
    : computeEditDistanceRatio(input.originalText || "", input.optimizedText || "");
  const feedbackMetadata = {
    action,
    taskType,
    roleCategory: input.roleCategory || "",
    sectionId: input.sectionId || "",
    operation: input.operation || "",
    variantType: input.variantType || "",
    snippetIds,
    patternMemoryIds,
    editDistanceRatio,
    feedbackText: input.feedbackText || "",
  };

  let referenceUsageRecorded = 0;
  for (const referenceResumeId of referenceResumeIds) {
    try {
      await recordReferenceResumeUsage({
        referenceResumeId,
        userId: input.userId,
        taskType,
        targetJdId: input.targetJdId,
        accepted: POSITIVE_ACTIONS.has(action),
        feedback: `${action}:${input.variantType || ""}`,
        metadata: feedbackMetadata,
      });
      referenceUsageRecorded += 1;
    } catch {
      // Reference feedback is best-effort; pattern feedback should still proceed.
    }
  }

  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured() || patternMemoryIds.length === 0) {
    return {
      referenceUsageRecorded,
      patternFeedbackRecorded: 0,
      promoted: 0,
      rejected: 0,
      skipped: patternMemoryIds.length > 0,
    };
  }

  const patternResult = await recordPatternMemoryFeedback({
    ...input,
    action,
    taskType,
    patternMemoryIds,
    metadata: feedbackMetadata,
  });

  return {
    referenceUsageRecorded,
    ...patternResult,
    skipped: false,
  };
}

async function recordPatternMemoryFeedback(input: RecordOptimizationMemoryFeedbackInput & {
  action: MemoryFeedbackAction;
  taskType: string;
  patternMemoryIds: number[];
  metadata: Record<string, unknown>;
}): Promise<{ patternFeedbackRecorded: number; promoted: number; rejected: number }> {
  return withPostgresClient(async (client) => {
    const result = await client.query(`
      SELECT id, user_id, status, canonical_text, confidence, importance, source_count, metadata_json
      FROM memory_items
      WHERE id = ANY($1::bigint[])
        AND user_id = $2
        AND memory_type = $3
    `, [input.patternMemoryIds, input.userId, EXCELLENT_RESUME_PATTERN_MEMORY_TYPE]);

    let patternFeedbackRecorded = 0;
    let promoted = 0;
    let rejected = 0;

    for (const row of result.rows as Array<Record<string, unknown>>) {
      const id = Number(row.id);
      const previousStatus = normalizePromotionStatus(String(row.status || "candidate"));
      const metadata = parseMetadata(row.metadata_json);
      const stats = updateFeedbackStats({
        previous: metadata.feedbackStats,
        action: input.action,
        scopeKey: buildFeedbackScopeKey({
          taskType: input.taskType,
          roleCategory: input.roleCategory,
          sectionId: input.sectionId,
          operation: input.operation,
        }),
      });
      const decision = decideMemoryPromotion({
        status: previousStatus,
        visibility: String(metadata.visibility || "private"),
        confidence: Number(row.confidence || 0),
        importance: Number(row.importance || 0),
        sourceCount: Number(row.source_count || 0),
        stats,
        text: String(row.canonical_text || ""),
      });
      const allowed = canTransitionMemoryStatus({
        actorRole: "system",
        currentStatus: previousStatus,
        nextStatus: decision.nextStatus,
        visibility: String(metadata.visibility || "private"),
      });
      const nextStatus = allowed ? decision.nextStatus : previousStatus;
      const statusChanged = nextStatus !== previousStatus;
      const nextMetadata = {
        ...metadata,
        feedbackStats: stats,
        feedbackTrustScore: decision.trustScore,
        promotionState: {
          reason: decision.reason,
          needsAdminApproval: decision.needsAdminApproval,
          lastEvaluatedAt: new Date().toISOString(),
        },
        lastFeedback: input.metadata,
      };

      await client.query("BEGIN");
      try {
        const evidenceInsert = await client.query(`
          INSERT INTO memory_evidence (
            user_id, memory_item_id, source_type, source_id, quote,
            extraction_method, confidence, metadata_json
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
          RETURNING id
        `, [
          input.userId,
          id,
          "optimization_feedback",
          `${input.taskType}:${input.sectionId || "unknown"}`,
          input.feedbackText || `${input.action}:${input.variantType || ""}`,
          "user_feedback_v1",
          POSITIVE_ACTIONS.has(input.action) ? 0.8 : 0.65,
          JSON.stringify(input.metadata),
        ]);
        const evidenceId = Number(evidenceInsert.rows[0]?.id || 0);

        if (statusChanged) {
          await client.query(`
            INSERT INTO memory_status_transitions (
              memory_item_id, user_id, actor_user_id, actor_role,
              previous_status, next_status, reason, metadata_json
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
          `, [
            id,
            input.userId,
            input.userId,
            "system",
            previousStatus,
            nextStatus,
            decision.reason,
            JSON.stringify(input.metadata),
          ]);
        }

        await client.query(`
          UPDATE memory_items
          SET status = $1,
              confidence = $2,
              importance = $3,
              metadata_json = $4::jsonb,
              updated_at = now(),
              last_seen_at = now()
          WHERE id = $5
        `, [
          nextStatus,
          adjustConfidence(Number(row.confidence || 0), input.action),
          adjustImportance(Number(row.importance || 0), input.action),
          JSON.stringify(nextMetadata),
          id,
        ]);

        const verified = await client.query(`
          SELECT status
          FROM memory_items
          WHERE id=$1 AND user_id=$2
        `, [id, input.userId]);
        const evidenceVerified = await client.query(`
          SELECT id
          FROM memory_evidence
          WHERE id=$1 AND user_id=$2 AND memory_item_id=$3
        `, [evidenceId, input.userId, id]);
        const transitionVerified = statusChanged
          ? await client.query(`
              SELECT id
              FROM memory_status_transitions
              WHERE memory_item_id=$1 AND user_id=$2 AND previous_status=$3 AND next_status=$4
              ORDER BY id DESC
              LIMIT 1
            `, [id, input.userId, previousStatus, nextStatus])
          : { rowCount: 1 };
        if (
          String(verified.rows[0]?.status || "") !== nextStatus ||
          !evidenceVerified.rowCount ||
          !transitionVerified.rowCount
        ) {
          throw new Error("memory promotion read-back verification failed");
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

      patternFeedbackRecorded += 1;
      if (statusChanged && nextStatus === "active") promoted += 1;
      if (statusChanged && nextStatus === "rejected") rejected += 1;
    }

    return { patternFeedbackRecorded, promoted, rejected };
  });
}

function parseFeedbackStats(value: unknown): MemoryFeedbackStats {
  const parsed = parseMetadata(value);
  const scopes = parsed.scopes && typeof parsed.scopes === "object" && !Array.isArray(parsed.scopes)
    ? parsed.scopes as MemoryFeedbackStats["scopes"]
    : {};
  return {
    positive: Math.max(0, Number(parsed.positive || 0)),
    negative: Math.max(0, Number(parsed.negative || 0)),
    accepted: Math.max(0, Number(parsed.accepted || 0)),
    saved: Math.max(0, Number(parsed.saved || 0)),
    rejected: Math.max(0, Number(parsed.rejected || 0)),
    dismissed: Math.max(0, Number(parsed.dismissed || 0)),
    heavilyEdited: Math.max(0, Number(parsed.heavilyEdited || 0)),
    lastAction: typeof parsed.lastAction === "string"
      ? normalizeMemoryFeedbackAction(parsed.lastAction)
      : null,
    lastActionAt: typeof parsed.lastActionAt === "string" ? parsed.lastActionAt : null,
    scopes,
  };
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

function normalizePromotionStatus(value: string): PromotionMemoryStatus {
  const raw = (value || "candidate").trim().toLowerCase();
  if (raw === "active") return "active";
  if (raw === "rejected") return "rejected";
  if (raw === "archived" || raw === "disabled" || raw === "deprecated") return "archived";
  return "candidate";
}

function adjustConfidence(value: number, action: MemoryFeedbackAction): number {
  const delta = POSITIVE_ACTIONS.has(action) ? 0.03 : -0.06;
  return Number(clamp01(Number(value || 0.5) + delta).toFixed(4));
}

function adjustImportance(value: number, action: MemoryFeedbackAction): number {
  const delta = POSITIVE_ACTIONS.has(action) ? 0.025 : -0.055;
  return Number(clamp01(Number(value || 0.5) + delta).toFixed(4));
}

function uniquePositiveIntegers(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(Number).filter((value) => Number.isInteger(value) && value > 0))];
}

function looksGenericPattern(text: string): boolean {
  const normalized = normalizeText(text)
    .replace(/[，。,.!！?？:：;；\s]+$/g, "")
    .toLowerCase();
  return GENERIC_PATTERN_TERMS.has(normalized);
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}
