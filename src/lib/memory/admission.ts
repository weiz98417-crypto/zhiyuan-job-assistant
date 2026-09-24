import { getPostgresPool } from "@/lib/postgres";
import { getReadableMemoryPartitions, recordEpisode, recordFact, type FactCandidate, type RecordedFact } from "@/lib/memory/fact-ledger";
import { hasExplicitMemoryErasureIntent, isMemorySuppressed, liftMemorySuppression } from "@/lib/memory/erasure";
import { assertMemoryExtractionGateOpen, assertMemoryGateOpen } from "@/lib/memory/runtime-gates";

export { hasExplicitMemoryErasureIntent } from "@/lib/memory/erasure";

const CANDIDATE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export type MemoryAdmissionKind =
  | "conversation"
  | "session_observation"
  | "remember_request"
  | "current_preference"
  | "verified_task"
  | "source_document"
  | "behavior"
  | "team_review";

export type MemoryCandidateKind = "conversation" | "remember_request" | "behavior";

export interface MemoryAdmissionEvidence {
  quote: string;
  extractionMethod?: string;
  metadata?: Record<string, unknown>;
  directCurrentIntent?: boolean;
  confirmedJobUse?: boolean;
  verifiedReadBack?: boolean;
  artifactId?: string;
  resultEvidence?: string;
  isQuotation?: boolean;
  isHypothetical?: boolean;
  isHistorical?: boolean;
  isInterviewAnswer?: boolean;
  isDocument?: boolean;
  isDerived?: boolean;
  consistentBehaviorCount?: number;
}

export interface MemoryAdmissionInput {
  userId: string;
  agentId: string;
  kind: MemoryAdmissionKind;
  sourceType: string;
  sourceId: string;
  fact: FactCandidate;
  evidence: MemoryAdmissionEvidence;
}

export interface MemoryAdmissionDecision {
  outcome: "active" | "candidate" | "clarify" | "rejected" | "behavior_signal";
  reason: string;
  candidateKind?: MemoryCandidateKind;
}

export interface MemoryCandidate {
  id: number;
  kind: MemoryCandidateKind;
  fact: FactCandidate;
  sourceType: string;
  sourceId: string;
  evidence: MemoryAdmissionEvidence;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "confirmed" | "rejected";
  sensitivity: "none" | "job_sensitive";
  factId: number | null;
}

export interface MemoryDiscoveryState {
  enabled: boolean;
  noticeAcknowledged: boolean;
}

export interface ActiveMemoryFact {
  id: number;
  status: "active";
  partition: string;
  subject: string;
  predicate: string;
  canonicalText: string;
  confidence: number;
  importance: number;
  validAt: string;
  sourceType: string | null;
  sourceId: string | null;
}

export interface MemoryAdmissionResult extends MemoryAdmissionDecision {
  candidate?: MemoryCandidate;
  recorded?: RecordedFact[];
}

const HISTORICAL_OR_HYPOTHETICAL = /(?:忘记了?(?:我)?曾|忘掉了?(?:我)?曾|曾经|以前|过去|假设|假如|如果|比如|举例|面试回答|岗位描述|职位描述|\bJD\b|\bresume\b)/i;
const SENSITIVE_JOB_CONTENT = /(?:薪资底线|最低薪资|最低工资|期望薪资|工作许可|工作签证|签证限制|健康限制|疾病|病史|残疾|salary\s*(?:floor|minimum)|work\s*(?:authorization|permit)|medical|health\s*(?:condition|restriction))/i;
const FORBIDDEN_SECRET = /(?:密码|password|passcode|api[\s_-]*key|密钥|secret|access[\s_-]*token)\s*["']?\s*(?:是|为|[:：=])\s*["']?[^\s,，。;；"'}]{4,}|\b(?:sk-[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16}|Bearer\s+[A-Za-z0-9._~-]{16,})\b|(?:身份证(?:号|号码)?|identity\s*(?:card|number|no\.?))\s*["']?\s*(?:是|为|[:：=])?\s*["']?\d{17}[\dXx]|\b\d{17}[\dXx]\b/i;

export function containsForbiddenMemoryContent(text: string): boolean {
  return FORBIDDEN_SECRET.test(text);
}

export function resolveAdmissionPartition(fact: FactCandidate): string {
  return SENSITIVE_JOB_CONTENT.test(`${fact.predicate}\n${fact.canonicalText}\n${JSON.stringify(fact.object)}`)
    ? "private"
    : fact.partition;
}

export function classifyMemoryAdmission(
  input: MemoryAdmissionInput,
  state: { discoveryEnabled: boolean; suppressed?: boolean },
): MemoryAdmissionDecision {
  const { fact, evidence } = input;
  const content = `${fact.canonicalText}\n${JSON.stringify(fact.object)}\n${evidence.quote}`;
  if (!input.userId || !input.sourceType || !input.sourceId || !fact.canonicalText.trim()
    || !fact.subject.trim() || !fact.predicate.trim()) {
    return { outcome: "rejected", reason: "missing_source_or_fact" };
  }
  if (containsForbiddenMemoryContent(content)) {
    return { outcome: "rejected", reason: "forbidden_secret_or_identity_number" };
  }
  if (hasExplicitMemoryErasureIntent(content)) {
    return { outcome: "clarify", reason: "explicit_memory_erasure_requires_scope_confirmation" };
  }
  if (state.suppressed && input.kind !== "remember_request") {
    return { outcome: "rejected", reason: "erasure_suppression" };
  }
  if (input.kind === "source_document" || input.kind === "team_review") {
    return { outcome: "rejected", reason: "source_not_personal_admission" };
  }
  if (input.kind === "behavior") {
    return (evidence.consistentBehaviorCount ?? 0) >= 3 && state.discoveryEnabled
      ? { outcome: "candidate", candidateKind: "behavior", reason: "repeated_behavior_needs_user_confirmation" }
      : { outcome: "behavior_signal", reason: "single_or_disabled_behavior_not_preference" };
  }
  const sensitive = SENSITIVE_JOB_CONTENT.test(`${fact.predicate}\n${content}`);
  if (input.kind === "remember_request") {
    return { outcome: "candidate", candidateKind: "remember_request", reason: sensitive
      ? "explicit_request_requires_fact_and_job_use_confirmation"
      : "explicit_request_requires_exact_fact_confirmation" };
  }
  if (input.kind === "current_preference") {
    if (!evidence.directCurrentIntent || evidence.isQuotation || evidence.isHypothetical
      || evidence.isHistorical || evidence.isInterviewAnswer || evidence.isDocument
      || evidence.isDerived || HISTORICAL_OR_HYPOTHETICAL.test(content)) {
      return { outcome: "clarify", reason: "current_preference_intent_ambiguous" };
    }
    if (sensitive && !evidence.confirmedJobUse) {
      return { outcome: "clarify", reason: "sensitive_job_use_confirmation_required" };
    }
    return { outcome: "active", reason: "direct_current_user_preference" };
  }
  if (input.kind === "verified_task") {
    if (!evidence.verifiedReadBack || !evidence.artifactId || !evidence.resultEvidence) {
      return { outcome: "rejected", reason: "task_artifact_readback_required" };
    }
    if (sensitive) return { outcome: "clarify", reason: "sensitive_job_use_confirmation_required" };
    return { outcome: "active", reason: "verified_task_artifact" };
  }
  if (!state.discoveryEnabled) {
    return { outcome: "rejected", reason: "automatic_discovery_disabled" };
  }
  if (sensitive) {
    return { outcome: "clarify", reason: "sensitive_job_use_confirmation_required" };
  }
  return { outcome: "candidate", candidateKind: "conversation", reason: "incidental_personal_fact_needs_confirmation" };
}

export async function getMemoryDiscoveryState(userId: string): Promise<MemoryDiscoveryState> {
  const result = await getPostgresPool().query(
    "SELECT enabled, notice_acknowledged_at FROM memory_discovery_settings WHERE user_id = $1",
    [userId],
  );
  const row = result.rows[0] as { enabled?: boolean; notice_acknowledged_at?: Date | null } | undefined;
  return { enabled: row?.enabled !== false, noticeAcknowledged: Boolean(row?.notice_acknowledged_at) };
}

export async function setMemoryDiscoveryState(
  userId: string,
  input: { enabled?: boolean; acknowledgeNotice?: boolean },
): Promise<MemoryDiscoveryState> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO memory_discovery_settings (user_id, enabled, notice_acknowledged_at)
       VALUES ($1, COALESCE($2::boolean, true), CASE WHEN $3::boolean THEN NOW() ELSE NULL END)
       ON CONFLICT (user_id) DO UPDATE SET
         enabled = COALESCE($2::boolean, memory_discovery_settings.enabled),
         notice_acknowledged_at = CASE WHEN $3::boolean THEN COALESCE(memory_discovery_settings.notice_acknowledged_at, NOW()) ELSE memory_discovery_settings.notice_acknowledged_at END,
         updated_at = NOW()`,
      [userId, input.enabled ?? null, input.acknowledgeNotice === true],
    );
    if (input.enabled === false) {
      await client.query(
        "DELETE FROM memory_admission_candidates WHERE user_id = $1 AND kind IN ('conversation', 'behavior') AND status = 'pending'",
        [userId],
      );
    }
    const result = await client.query(
      "SELECT enabled, notice_acknowledged_at FROM memory_discovery_settings WHERE user_id = $1",
      [userId],
    );
    await client.query("COMMIT");
    return {
      enabled: result.rows[0]?.enabled === true,
      noticeAcknowledged: Boolean(result.rows[0]?.notice_acknowledged_at),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function expirePendingMemoryCandidates(userId?: string, now = new Date()): Promise<number> {
  const result = await getPostgresPool().query(
    `DELETE FROM memory_admission_candidates
     WHERE status = 'pending' AND expires_at <= $1
       AND ($2::text IS NULL OR user_id = $2)`,
    [now, userId ?? null],
  );
  return result.rowCount ?? 0;
}

export async function listMemoryCandidates(userId: string): Promise<MemoryCandidate[]> {
  await assertMemoryGateOpen("read");
  await expirePendingMemoryCandidates(userId);
  const result = await getPostgresPool().query(
    `SELECT * FROM memory_admission_candidates
     WHERE user_id = $1 AND status = 'pending'
     ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows.map(mapCandidate);
}

export async function listActiveMemoryFacts(userId: string, agentId = "user"): Promise<ActiveMemoryFact[]> {
  await assertMemoryGateOpen("read");
  const readablePartitions = await getReadableMemoryPartitions({ userId }, agentId);
  if (!readablePartitions.length) return [];
  const result = await getPostgresPool().query(
    `SELECT f.id, f.partition, f.subject, f.predicate, f.canonical_text,
            f.confidence, f.importance, f.valid_at,
            e.source_type, e.source_id
     FROM memory_facts f
     LEFT JOIN memory_episodes e ON e.id = f.source_episode_id
     WHERE f.user_id = $1 AND f.invalid_at IS NULL
       AND f.partition = ANY($2::text[])
       AND NOT EXISTS (
         SELECT 1
         FROM memory_erasure_suppressions s
         JOIN memory_erasure_requests r ON r.id = s.request_id AND r.user_id = s.user_id
         WHERE s.user_id = f.user_id AND s.lifted_at IS NULL
           AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(r.scope_json->'factIds') id WHERE id = f.id::text)
       )
     ORDER BY f.valid_at DESC, f.importance DESC`,
    [userId, readablePartitions],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    status: "active" as const,
    partition: String(row.partition),
    subject: String(row.subject),
    predicate: String(row.predicate),
    canonicalText: String(row.canonical_text),
    confidence: Number(row.confidence),
    importance: Number(row.importance),
    validAt: new Date(row.valid_at).toISOString(),
    sourceType: row.source_type == null ? null : String(row.source_type),
    sourceId: row.source_id == null ? null : String(row.source_id),
  }));
}

export async function admitMemory(input: MemoryAdmissionInput): Promise<MemoryAdmissionResult> {
  await assertMemoryExtractionGateOpen();
  await expirePendingMemoryCandidates(input.userId);
  const state = await getMemoryDiscoveryState(input.userId);
  const sensitive = SENSITIVE_JOB_CONTENT.test(
    `${input.fact.predicate}\n${input.fact.canonicalText}\n${JSON.stringify(input.fact.object)}\n${input.evidence.quote}`,
  );
  const admittedFact = {
    ...input.fact,
    partition: resolveAdmissionPartition(input.fact),
    currentPreference: input.kind === "current_preference",
  };
  const source = {
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    subject: input.fact.subject,
    predicate: input.fact.predicate,
  };
  const suppressed = await isMemorySuppressed(input.userId, admittedFact.canonicalText, source);
  const decision = classifyMemoryAdmission(input, { discoveryEnabled: state.enabled, suppressed });
  if (decision.outcome === "candidate" && decision.candidateKind) {
    const expiresAt = new Date(Date.now() + CANDIDATE_LIFETIME_MS);
    const pool = getPostgresPool();
    const existing = await pool.query(
      `SELECT * FROM memory_admission_candidates
       WHERE user_id = $1 AND kind = $2 AND canonical_text = $3 AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [input.userId, decision.candidateKind, admittedFact.canonicalText],
    );
    if (existing.rows[0]) {
      return { ...decision, candidate: mapCandidate(existing.rows[0]) };
    }
    const result = await pool.query(
      `INSERT INTO memory_admission_candidates
         (user_id, kind, partition, subject, predicate, object_json, canonical_text,
          source_type, source_id, evidence_json, sensitivity, confidence, importance, status, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11,$12,$13,'pending',$14)
       ON CONFLICT (user_id, kind, source_type, source_id, canonical_text)
       DO UPDATE SET source_id = EXCLUDED.source_id
       RETURNING *`,
      [
        input.userId, decision.candidateKind, admittedFact.partition, admittedFact.subject,
        admittedFact.predicate, JSON.stringify(admittedFact.object), admittedFact.canonicalText,
        input.sourceType, input.sourceId, JSON.stringify(input.evidence),
        sensitive ? "job_sensitive" : "none",
        admittedFact.confidence,
        admittedFact.importance,
        expiresAt,
      ],
    );
    const candidate = mapCandidate(result.rows[0]);
    return { ...decision, candidate, reason: candidate.status === "pending" ? decision.reason : "already_resolved" };
  }
  if (decision.outcome === "active") {
    const episodeId = await recordEpisode(
      { userId: input.userId },
      {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        content: { fact: input.fact.canonicalText, evidence: input.evidence, admissionReason: decision.reason },
      },
    );
    const recorded = await recordFact(
      { userId: input.userId }, admittedFact,
      { episodeId, agentId: input.agentId, useLlmDecision: false },
    );
    return { ...decision, recorded };
  }
  return decision;
}

export async function resolveMemoryCandidate(
  userId: string,
  id: number,
  action: "confirm" | "reject",
  options: { confirmedJobUse?: boolean } = {},
): Promise<{ candidate: MemoryCandidate; recorded?: RecordedFact[] }> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "SELECT * FROM memory_admission_candidates WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [id, userId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("memory candidate not found");
    const candidate = mapCandidate(row);
    if (candidate.status !== "pending") {
      await client.query("COMMIT");
      return { candidate };
    }
    if (Date.parse(candidate.expiresAt) <= Date.now()) {
      await client.query("DELETE FROM memory_admission_candidates WHERE id = $1 AND user_id = $2", [id, userId]);
      await client.query("COMMIT");
      throw new Error("memory candidate expired");
    }
    if (action === "reject") {
      const updated = await client.query(
        "UPDATE memory_admission_candidates SET status = 'rejected', resolved_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *",
        [id, userId],
      );
      await client.query("COMMIT");
      return { candidate: mapCandidate(updated.rows[0]) };
    }
    const sensitive = candidate.sensitivity === "job_sensitive"
      || SENSITIVE_JOB_CONTENT.test(
        `${candidate.fact.predicate}\n${candidate.fact.canonicalText}\n${JSON.stringify(candidate.fact.object)}\n${candidate.evidence.quote}`,
      );
    if (sensitive && !options.confirmedJobUse) throw new Error("job-seeking use confirmation required");
    const source = {
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      subject: candidate.fact.subject,
      predicate: candidate.fact.predicate,
    };
    const suppressed = await isMemorySuppressed(userId, candidate.fact.canonicalText, source, client);
    if (suppressed && candidate.kind !== "remember_request") throw new Error("memory source is suppressed");
    const episodeId = await recordEpisode(
      { userId },
      {
        sourceType: candidate.sourceType,
        sourceId: candidate.sourceId,
        content: { fact: candidate.fact.canonicalText, evidence: candidate.evidence, confirmedByUser: true },
      },
      client,
    );
    const recorded = await recordFact(
      { userId }, candidate.fact,
      { episodeId, agentId: "profile", useLlmDecision: false, client },
    );
    if (suppressed) await liftMemorySuppression(userId, candidate.fact.canonicalText, source, client);
    const updated = await client.query(
      `UPDATE memory_admission_candidates
       SET status = 'confirmed', fact_id = $3, resolved_at = NOW()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId, recorded.find((item) => item.factId > 0)?.factId ?? null],
    );
    await client.query("COMMIT");
    return { candidate: mapCandidate(updated.rows[0]), recorded };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function mapCandidate(row: Record<string, unknown>): MemoryCandidate {
  const object = typeof row.object_json === "string" ? JSON.parse(row.object_json) : row.object_json;
  const evidence = typeof row.evidence_json === "string" ? JSON.parse(row.evidence_json) : row.evidence_json;
  return {
    id: Number(row.id),
    kind: String(row.kind) as MemoryCandidateKind,
    fact: {
      partition: String(row.partition),
      subject: String(row.subject),
      predicate: String(row.predicate),
      object: object as Record<string, unknown>,
      canonicalText: String(row.canonical_text),
      confidence: Number(row.confidence ?? 0.8),
      importance: Number(row.importance ?? 0.5),
    },
    sourceType: String(row.source_type),
    sourceId: String(row.source_id),
    evidence: evidence as MemoryAdmissionEvidence,
    createdAt: new Date(row.created_at as string | Date).toISOString(),
    expiresAt: new Date(row.expires_at as string | Date).toISOString(),
    status: String(row.status) as MemoryCandidate["status"],
    sensitivity: String(row.sensitivity || "none") as MemoryCandidate["sensitivity"],
    factId: row.fact_id == null ? null : Number(row.fact_id),
  };
}
