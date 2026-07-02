import { createHash } from "crypto";
import { withPostgresClient } from "@/lib/postgres";
import { getToolGovernance } from "@/lib/agent/tool-governance";
import type { AgentRunRecord, AgentRunStepRecord, AgentRunStatus } from "@/lib/agent/run-ledger";
import { planAgentRepair, serializeRepairPlanForLedger } from "@/lib/agent/repair-planner";

export const AGENT_RUN_REVIEWER_VERSION = "deterministic-v1";

export const AGENT_RUN_FAILURE_TYPES = [
  "routing_error",
  "tool_contract_mismatch",
  "missing_run",
  "wrong_task_routed",
  "tool_failed_but_message_success",
  "tool_succeeded_but_message_failure",
  "missing_readback",
  "partial_write",
  "image_intake_failure",
  "image_intake_not_called",
  "image_intake_conflict_ignored",
  "guided_task_drift",
  "context_loss",
  "bad_output_rendering",
  "admin_action_no_feedback",
  "resume_write_pollution",
  "profile_signal_noise",
  "interview_policy_violation",
  "memory_governance_failure",
  "user_intent_unresolved",
  "llm_judge_quality_warning",
  "system_error",
] as const;

export type AgentRunFailureType = typeof AGENT_RUN_FAILURE_TYPES[number];
export type AgentRunReviewVerdict = "pass" | "warning" | "fail";
export type AgentEvalCandidateStatus = "candidate" | "accepted" | "rejected" | "promoted";

export interface AgentRunReviewEvidence {
  code: string;
  failureType: AgentRunFailureType;
  severity: "warning" | "fail";
  message: string;
  stepId?: number;
  phase?: string;
  toolName?: string;
  snippet?: string;
  data?: unknown;
}

export interface AgentRunReviewRecord {
  id: number;
  run_id: string;
  user_id: string;
  session_id: number | null;
  task_type: string;
  agent_id: string;
  verdict: AgentRunReviewVerdict;
  score: number;
  primary_failure_type: AgentRunFailureType | "";
  failure_types: AgentRunFailureType[];
  evidence_json: AgentRunReviewEvidence[];
  suggested_fix: string;
  eval_candidate_json: unknown;
  reviewer_version: string;
  reviewed_at: string;
}

export interface AgentEvalCandidateRecord {
  id: number;
  review_id: number | null;
  run_id: string | null;
  name: string;
  task_type: string;
  failure_type: AgentRunFailureType;
  input_summary: string;
  expected_contract_json: unknown;
  fixture_json: unknown;
  status: AgentEvalCandidateStatus;
  admin_note: string;
  dedupe_key: string;
  created_at: string;
  updated_at: string;
}

export interface AgentEvalPromotionDraft {
  name: string;
  taskType: string;
  failureType: AgentRunFailureType;
  sourceCandidateId: number;
  sourceRunId: string | null;
  status: "draft";
  expectedContract: unknown;
  fixture: unknown;
  suggestedTestName: string;
  applyHint: string;
}

export interface AgentEvalCandidateLifecycleResult {
  candidate: AgentEvalCandidateRecord;
  lifecycle: {
    status: AgentEvalCandidateStatus;
    message: string;
    requiresExplicitDeveloperAction: boolean;
    nextAction: string;
    promotionDraft?: AgentEvalPromotionDraft;
  };
}

export interface AgentRunReviewSummary {
  total: number;
  pass: number;
  warning: number;
  fail: number;
  byFailureType: Record<string, number>;
  byTaskType: Record<string, number>;
  pendingCandidates: number;
}

export interface AgentSessionReviewMessage {
  role: "user" | "assistant" | "tool" | string;
  content?: string;
  images?: string[];
  toolName?: string;
  toolResult?: unknown;
  agent_id?: string;
}

export interface AgentSessionAnomalyInput {
  userId: string;
  sessionId?: number | null;
  messages: AgentSessionReviewMessage[];
  activeTask?: {
    taskType?: string;
    agentId?: string;
    phase?: string;
    taskId?: string;
  } | null;
  recentRuns?: Array<Pick<AgentRunRecord, "id" | "task_type" | "agent_id" | "status">>;
}

interface UpsertReviewInput {
  run: AgentRunRecord;
  verdict: AgentRunReviewVerdict;
  score: number;
  failureTypes: AgentRunFailureType[];
  primaryFailureType: AgentRunFailureType | "";
  evidence: AgentRunReviewEvidence[];
  suggestedFix: string;
  evalCandidate?: unknown;
  reviewerVersion?: string;
}

interface CreateEvalCandidateInput {
  reviewId?: number | null;
  runId?: string | null;
  name: string;
  taskType: string;
  failureType: AgentRunFailureType;
  inputSummary: string;
  expectedContract: unknown;
  fixture: unknown;
  dedupeKey?: string;
}

interface AgentRunLlmJudgeResult {
  qualityWarning: boolean;
  reason: string;
  failureType?: AgentRunFailureType;
}

const FAILURE_TYPE_SET = new Set<string>(AGENT_RUN_FAILURE_TYPES);
const TERMINAL_STATUSES = new Set<AgentRunStatus>(["succeeded", "failed", "rolled_back", "cancelled"]);
const MAX_REDACTED_TEXT = 240;
const LLM_JUDGE_TIMEOUT_MS = 4_000;

export function normalizeFailureType(value: unknown): AgentRunFailureType {
  const text = String(value || "").trim();
  return FAILURE_TYPE_SET.has(text) ? text as AgentRunFailureType : "system_error";
}

export function redactReviewText(value: unknown, maxLength = MAX_REDACTED_TEXT): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const redacted = raw
    .replace(/data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+/g, "[image]")
    .replace(/\b[A-Za-z0-9+/]{160,}={0,2}\b/g, "[base64]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[api-key]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]{20,}\b/gi, "Bearer [token]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(?:\+?86[-\s]?)?1[3-9]\d{9}/g, "[phone]")
    .replace(/\s+/g, " ")
    .trim();
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength)}...` : redacted;
}

export function sanitizeReviewJson(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactReviewText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeReviewJson(item, depth + 1));
  if (!isRecord(value)) return redactReviewText(value);

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 40)) {
    const lowered = key.toLowerCase();
    if (
      lowered.includes("apikey") ||
      lowered.includes("api_key") ||
      lowered.includes("authorization") ||
      lowered.includes("token") ||
      lowered.includes("base64") ||
      lowered.includes("image")
    ) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = sanitizeReviewJson(item, depth + 1);
  }
  return output;
}

export async function reviewAgentRunById(runId: string): Promise<AgentRunReviewRecord | null> {
  const run = await getAgentRunForReview(runId);
  if (!run || !TERMINAL_STATUSES.has(run.status)) return null;
  const steps = await listAgentRunStepsForReview(runId);
  let review = reviewAgentRun(run, steps);
  review = await applyOptionalLlmJudge(run, steps, review);
  const saved = await upsertAgentRunReview(review);
  const candidate = buildEvalCandidateInput(saved, run, steps);
  if (candidate) {
    const savedCandidate = await createAgentEvalCandidate(candidate);
    saved.eval_candidate_json = sanitizeReviewJson(savedCandidate);
  }
  return saved;
}

export function reviewAgentSessionAnomalies(input: AgentSessionAnomalyInput): CreateEvalCandidateInput[] {
  const messages = input.messages || [];
  const latestUser = [...messages].reverse().find((message) => message.role === "user");
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const toolMessages = messages.filter((message) => message.role === "tool");
  const hasImages = Array.isArray(latestUser?.images) && latestUser.images.length > 0;
  const latestUserText = `${latestUser?.content || ""} ${hasImages ? "图片" : ""}`;
  const recentRuns = input.recentRuns || [];
  const hasRecentRun = recentRuns.length > 0;
  const candidates: CreateEvalCandidateInput[] = [];

  if (hasImages && !hasRecentRun && !hasImageIntakeToolMessage(toolMessages)) {
    candidates.push(buildSessionCandidate({
      input,
      failureType: "image_intake_not_called",
      taskType: inferTaskTypeFromSessionText(latestUserText, input.activeTask?.taskType),
      code: "session.image_intake_missing_run",
      inputSummary: latestUserText || "uploaded image",
      expected: "Uploaded images must create a durable run and record recognize_document_image/image-intake before business tools.",
      actual: "No durable run or image intake tool message was observed for the image turn.",
    }));
  }

  const failedToolWithoutRun = toolMessages.find((message) => toolMessageIndicatesFailure(message));
  if (failedToolWithoutRun && !hasRecentRun) {
    candidates.push(buildSessionCandidate({
      input,
      failureType: firstKnownFailure(failedToolWithoutRun.toolResult) || "missing_run",
      taskType: inferTaskTypeFromToolName(failedToolWithoutRun.toolName) || inferTaskTypeFromSessionText(latestUserText, input.activeTask?.taskType),
      code: "session.tool_failed_without_run",
      inputSummary: `${latestUserText} ${failedToolWithoutRun.toolName || ""}`,
      expected: "Tool failures from business tasks must be represented by a failed durable run or review anomaly.",
      actual: redactReviewText(failedToolWithoutRun.toolResult || failedToolWithoutRun.content),
    }));
  }

  const assistantContradictsFailure = latestAssistant && toolMessages.some((message) => (
    toolMessageIndicatesFailure(message) && assistantClaimsSuccess(latestAssistant.content || "")
  ));
  if (assistantContradictsFailure) {
    candidates.push(buildSessionCandidate({
      input,
      failureType: "tool_failed_but_message_success",
      taskType: inferTaskTypeFromSessionText(latestUserText, input.activeTask?.taskType),
      code: "session.failed_tool_success_message",
      inputSummary: latestUserText || latestAssistant?.content || "assistant success after tool failure",
      expected: "Assistant must not claim completion when the latest tool result failed.",
      actual: latestAssistant?.content || "",
    }));
  }

  const activeTaskType = input.activeTask?.taskType || "";
  const activeAgentId = input.activeTask?.agentId || "";
  const latestAgentId = latestAssistant?.agent_id || "";
  if (activeTaskType && latestAgentId && activeAgentId && latestAgentId !== activeAgentId) {
    candidates.push(buildSessionCandidate({
      input,
      failureType: "guided_task_drift",
      taskType: activeTaskType,
      code: "session.guided_task_drift",
      inputSummary: latestUserText || latestAssistant?.content || activeTaskType,
      expected: `Active guided task must stay on ${activeTaskType}/${activeAgentId}.`,
      actual: `Latest assistant was produced by ${latestAgentId}.`,
    }));
  }

  return dedupeSessionCandidates(candidates);
}

export async function createSessionAnomalyEvalCandidates(
  input: AgentSessionAnomalyInput,
): Promise<AgentEvalCandidateRecord[]> {
  const candidates = reviewAgentSessionAnomalies(input);
  const saved: AgentEvalCandidateRecord[] = [];
  for (const candidate of candidates) {
    saved.push(await createAgentEvalCandidate(candidate));
  }
  return saved;
}

export function reviewAgentRun(run: AgentRunRecord, steps: AgentRunStepRecord[]): UpsertReviewInput {
  const evidence: AgentRunReviewEvidence[] = [];

  addContractCompletionEvidence(run, evidence);
  addReadBackEvidence(steps, evidence);
  addRouteEvidence(run, steps, evidence);
  addImageIntakeEvidence(run, steps, evidence);
  addResumePollutionEvidence(run, steps, evidence);
  addProfileSignalEvidence(run, steps, evidence);
  addMemoryGovernanceEvidence(run, steps, evidence);
  addInterviewPolicyEvidence(run, steps, evidence);
  addContextLossEvidence(run, steps, evidence);
  addRenderingEvidence(run, steps, evidence);

  if (run.status === "failed" || run.status === "rolled_back") {
    evidence.push({
      code: "run.terminal_failed",
      failureType: firstKnownFailure(run.error_json) || "system_error",
      severity: "fail",
      message: "Agent run ended in failed or rolled_back status.",
      snippet: redactReviewText(run.error_json),
    });
  }

  if (run.status === "cancelled") {
    evidence.push({
      code: "run.cancelled",
      failureType: "user_intent_unresolved",
      severity: "warning",
      message: "Agent run was cancelled before completion.",
      snippet: redactReviewText(lastStep(steps)?.output_summary || run.error_json),
    });
  }

  const dedupedEvidence = dedupeEvidence(evidence);
  const failureTypes = Array.from(new Set(dedupedEvidence.map((item) => item.failureType)));
  const failCount = dedupedEvidence.filter((item) => item.severity === "fail").length;
  const warningCount = dedupedEvidence.filter((item) => item.severity === "warning").length;
  const verdict: AgentRunReviewVerdict = failCount > 0 ? "fail" : warningCount > 0 ? "warning" : "pass";
  const score = verdict === "pass"
    ? 1
    : Math.max(0, Number((1 - failCount * 0.35 - warningCount * 0.12).toFixed(2)));
  const primaryFailureType = choosePrimaryFailureType(dedupedEvidence);

  return {
    run,
    verdict,
    score,
    failureTypes,
    primaryFailureType,
    evidence: dedupedEvidence,
    suggestedFix: buildSuggestedFix(primaryFailureType, dedupedEvidence),
    evalCandidate: verdict === "pass" ? {} : {
      primaryFailureType,
      failureTypes,
      evidenceCount: dedupedEvidence.length,
    },
    reviewerVersion: AGENT_RUN_REVIEWER_VERSION,
  };
}

export function isAgentRunReviewLlmJudgeEnabled(): boolean {
  return process.env.AGENT_RUN_REVIEW_LLM_JUDGE === "1";
}

export function buildAgentRunReviewJudgePrompt(
  run: AgentRunRecord,
  steps: AgentRunStepRecord[],
  review: UpsertReviewInput,
): string {
  return [
    "你是 Agent Run 质量复盘 judge。只判断用户请求是否被充分满足、输出是否有帮助、摘要是否完整。",
    "你不能覆盖 deterministic reviewer 的结论；如果已有确定性失败，只能补充 warning。",
    "只返回 JSON：{\"qualityWarning\":boolean,\"reason\":\"...\",\"failureType\":\"llm_judge_quality_warning\"}",
    "",
    `taskType: ${run.task_type}`,
    `agentId: ${run.agent_id}`,
    `status: ${run.status}`,
    `deterministicVerdict: ${review.verdict}`,
    `deterministicFailures: ${review.failureTypes.join(", ") || "none"}`,
    `contract: ${redactReviewText(run.contract_json, 700)}`,
    `result: ${redactReviewText(run.result_json, 700)}`,
    `error: ${redactReviewText(run.error_json, 400)}`,
    `steps: ${steps.slice(-8).map((step) => `[${step.phase}/${step.tool_name}/${step.status}] ${redactReviewText(step.output_summary, 180)}`).join(" | ")}`,
  ].join("\n");
}

export async function applyOptionalLlmJudge(
  run: AgentRunRecord,
  steps: AgentRunStepRecord[],
  review: UpsertReviewInput,
): Promise<UpsertReviewInput> {
  if (!isAgentRunReviewLlmJudgeEnabled()) return review;
  const judge = await callReviewLlmJudge(buildAgentRunReviewJudgePrompt(run, steps, review)).catch(() => null);
  if (!judge?.qualityWarning) return review;
  return withAdditionalEvidence(review, [{
    code: "llm_judge.quality_warning",
    failureType: judge.failureType || "llm_judge_quality_warning",
    severity: "warning",
    message: judge.reason || "LLM judge flagged a semantic quality warning.",
    snippet: judge.reason,
  }]);
}

export async function upsertAgentRunReview(input: UpsertReviewInput): Promise<AgentRunReviewRecord> {
  const reviewerVersion = input.reviewerVersion || AGENT_RUN_REVIEWER_VERSION;
  return withPostgresClient(async (client) => {
    const result = await client.query(`
      INSERT INTO agent_run_reviews
        (run_id, user_id, session_id, task_type, agent_id, verdict, score, primary_failure_type,
         failure_types, evidence_json, suggested_fix, eval_candidate_json, reviewer_version, reviewed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12::jsonb, $13, now())
      ON CONFLICT (run_id, reviewer_version)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        session_id = EXCLUDED.session_id,
        task_type = EXCLUDED.task_type,
        agent_id = EXCLUDED.agent_id,
        verdict = EXCLUDED.verdict,
        score = EXCLUDED.score,
        primary_failure_type = EXCLUDED.primary_failure_type,
        failure_types = EXCLUDED.failure_types,
        evidence_json = EXCLUDED.evidence_json,
        suggested_fix = EXCLUDED.suggested_fix,
        eval_candidate_json = EXCLUDED.eval_candidate_json,
        reviewed_at = now()
      RETURNING *
    `, [
      input.run.id,
      input.run.user_id,
      input.run.session_id,
      input.run.task_type,
      input.run.agent_id,
      input.verdict,
      input.score,
      input.primaryFailureType,
      JSON.stringify(input.failureTypes),
      JSON.stringify(sanitizeReviewJson(input.evidence)),
      input.suggestedFix,
      JSON.stringify(sanitizeReviewJson(input.evalCandidate || {})),
      reviewerVersion,
    ]);
    return normalizeReview(result.rows[0]);
  });
}

export async function listAgentRunReviews(input: {
  limit?: number;
  verdict?: AgentRunReviewVerdict | "all";
  failureType?: AgentRunFailureType | "all";
  taskType?: string;
} = {}): Promise<AgentRunReviewRecord[]> {
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit || 50)));
  const params: unknown[] = [];
  const where: string[] = [];
  if (input.verdict && input.verdict !== "all") {
    params.push(input.verdict);
    where.push(`verdict = $${params.length}`);
  }
  if (input.failureType && input.failureType !== "all") {
    params.push(input.failureType);
    where.push(`primary_failure_type = $${params.length}`);
  }
  if (input.taskType) {
    params.push(input.taskType);
    where.push(`task_type = $${params.length}`);
  }
  params.push(limit);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return withPostgresClient(async (client) => {
    const result = await client.query(`
      SELECT *
      FROM agent_run_reviews
      ${whereSql}
      ORDER BY reviewed_at DESC
      LIMIT $${params.length}
    `, params);
    return result.rows.map(normalizeReview);
  });
}

export async function getAgentRunReview(id: number): Promise<AgentRunReviewRecord | null> {
  return withPostgresClient(async (client) => {
    const result = await client.query("SELECT * FROM agent_run_reviews WHERE id = $1", [id]);
    return result.rows[0] ? normalizeReview(result.rows[0]) : null;
  });
}

export async function getAgentRunReviewDetail(id: number): Promise<{
  review: AgentRunReviewRecord;
  run: AgentRunRecord | null;
  steps: AgentRunStepRecord[];
  candidate: AgentEvalCandidateRecord | null;
} | null> {
  const review = await getAgentRunReview(id);
  if (!review) return null;
  const run = await getAgentRunForReview(review.run_id);
  const steps = await listAgentRunStepsForReview(review.run_id);
  const candidate = await getEvalCandidateForReview(review.id);
  return { review, run, steps, candidate };
}

export async function getAgentRunReviewSummary(days = 7): Promise<AgentRunReviewSummary> {
  const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
  return withPostgresClient(async (client) => {
    const result = await client.query(`
      SELECT verdict, task_type, primary_failure_type
      FROM agent_run_reviews
      WHERE reviewed_at >= now() - ($1::int * interval '1 day')
    `, [safeDays]);
    const candidateResult = await client.query(`
      SELECT count(*)::int AS count
      FROM agent_eval_candidates
      WHERE status = 'candidate'
    `);
    const summary: AgentRunReviewSummary = {
      total: result.rows.length,
      pass: 0,
      warning: 0,
      fail: 0,
      byFailureType: {},
      byTaskType: {},
      pendingCandidates: Number(candidateResult.rows[0]?.count || 0),
    };
    for (const row of result.rows) {
      const verdict = String(row.verdict || "warning");
      if (verdict === "pass") summary.pass += 1;
      if (verdict === "warning") summary.warning += 1;
      if (verdict === "fail") summary.fail += 1;
      const taskType = String(row.task_type || "unknown");
      const failureType = String(row.primary_failure_type || "");
      summary.byTaskType[taskType] = (summary.byTaskType[taskType] || 0) + 1;
      if (failureType) summary.byFailureType[failureType] = (summary.byFailureType[failureType] || 0) + 1;
    }
    return summary;
  });
}

export async function createAgentEvalCandidate(input: CreateEvalCandidateInput): Promise<AgentEvalCandidateRecord> {
  const failureType = normalizeFailureType(input.failureType);
  const dedupeKey = input.dedupeKey || buildEvalDedupeKey(input.taskType, failureType, input.inputSummary);
  return withPostgresClient(async (client) => {
    const result = await client.query(`
      INSERT INTO agent_eval_candidates
        (review_id, run_id, name, task_type, failure_type, input_summary, expected_contract_json, fixture_json, status, dedupe_key, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, 'candidate', $9, now())
      ON CONFLICT (dedupe_key) WHERE dedupe_key <> ''
      DO UPDATE SET
        review_id = COALESCE(agent_eval_candidates.review_id, EXCLUDED.review_id),
        run_id = COALESCE(agent_eval_candidates.run_id, EXCLUDED.run_id),
        updated_at = now()
      RETURNING *
    `, [
      input.reviewId ?? null,
      input.runId ?? null,
      input.name,
      input.taskType,
      failureType,
      redactReviewText(input.inputSummary),
      JSON.stringify(sanitizeReviewJson(input.expectedContract || {})),
      JSON.stringify(sanitizeReviewJson(input.fixture || {})),
      dedupeKey,
    ]);
    return normalizeCandidate(result.rows[0]);
  });
}

export async function listAgentEvalCandidates(input: {
  status?: AgentEvalCandidateStatus | "all";
  limit?: number;
} = {}): Promise<AgentEvalCandidateRecord[]> {
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit || 50)));
  const params: unknown[] = [];
  let where = "";
  if (input.status && input.status !== "all") {
    params.push(input.status);
    where = `WHERE status = $${params.length}`;
  }
  params.push(limit);
  return withPostgresClient(async (client) => {
    const result = await client.query(`
      SELECT *
      FROM agent_eval_candidates
      ${where}
      ORDER BY updated_at DESC
      LIMIT $${params.length}
    `, params);
    return result.rows.map(normalizeCandidate);
  });
}

export async function updateAgentEvalCandidateStatus(
  id: number,
  status: AgentEvalCandidateStatus,
  adminNote = "",
): Promise<AgentEvalCandidateRecord | null> {
  return withPostgresClient(async (client) => {
    const result = await client.query(`
      UPDATE agent_eval_candidates
      SET status = $2, admin_note = $3, updated_at = now()
      WHERE id = $1
      RETURNING *
    `, [id, status, redactReviewText(adminNote, 500)]);
    return result.rows[0] ? normalizeCandidate(result.rows[0]) : null;
  });
}

export async function transitionAgentEvalCandidate(
  id: number,
  status: AgentEvalCandidateStatus,
  adminNote = "",
): Promise<AgentEvalCandidateLifecycleResult | null> {
  const candidate = await updateAgentEvalCandidateStatus(id, status, adminNote);
  if (!candidate) return null;
  return buildAgentEvalCandidateLifecycleResult(candidate);
}

export function buildAgentEvalCandidateLifecycleResult(
  candidate: AgentEvalCandidateRecord,
): AgentEvalCandidateLifecycleResult {
  const safeCandidate = sanitizeAgentEvalCandidateRecord(candidate);
  const status = safeCandidate.status;
  if (status === "accepted") {
    return {
      candidate: safeCandidate,
      lifecycle: {
        status,
        message: `候选 #${safeCandidate.id} 已进入待实现改进队列。它会保留为回归 eval 输入，但不会自动修改代码。`,
        requiresExplicitDeveloperAction: true,
        nextAction: "让 Codex 根据已接受候选开 OpenSpec change 或补 regression eval，然后显式 apply。",
      },
    };
  }
  if (status === "promoted") {
    const promotionDraft = buildAgentEvalPromotionDraft(safeCandidate);
    return {
      candidate: safeCandidate,
      lifecycle: {
        status,
        message: `候选 #${safeCandidate.id} 已提升为 regression eval 草案。草案已生成，但仍需要开发者显式写入测试文件并运行验证。`,
        requiresExplicitDeveloperAction: true,
        nextAction: `把 ${promotionDraft.suggestedTestName} 写入对应 eval/test 文件，并运行相关回归测试。`,
        promotionDraft,
      },
    };
  }
  if (status === "rejected") {
    return {
      candidate: safeCandidate,
      lifecycle: {
        status,
        message: `候选 #${safeCandidate.id} 已拒绝，不会进入自迭代改进队列。`,
        requiresExplicitDeveloperAction: false,
        nextAction: "无需后续动作。",
      },
    };
  }
  return {
    candidate: safeCandidate,
    lifecycle: {
      status,
      message: `候选 #${safeCandidate.id} 仍在待审核队列。`,
      requiresExplicitDeveloperAction: false,
      nextAction: "管理员可以接受、拒绝或提升。",
    },
  };
}

function sanitizeAgentEvalCandidateRecord(candidate: AgentEvalCandidateRecord): AgentEvalCandidateRecord {
  return {
    ...candidate,
    name: redactReviewText(candidate.name, 160),
    input_summary: redactReviewText(candidate.input_summary, 300),
    expected_contract_json: sanitizeReviewJson(candidate.expected_contract_json || {}),
    fixture_json: sanitizeReviewJson(candidate.fixture_json || {}),
    admin_note: redactReviewText(candidate.admin_note || "", 500),
    dedupe_key: redactReviewText(candidate.dedupe_key || "", 160),
  };
}

export function buildAgentEvalPromotionDraft(candidate: AgentEvalCandidateRecord): AgentEvalPromotionDraft {
  const taskType = candidate.task_type || "unknown";
  const failureType = normalizeFailureType(candidate.failure_type);
  const baseName = normalizeEvalName(candidate.name || `${taskType}_${failureType}`);
  return {
    name: `${baseName}_regression`,
    taskType,
    failureType,
    sourceCandidateId: candidate.id,
    sourceRunId: candidate.run_id,
    status: "draft",
    expectedContract: sanitizeReviewJson(candidate.expected_contract_json || {}),
    fixture: sanitizeReviewJson({
      ...(isRecord(candidate.fixture_json) ? candidate.fixture_json : { value: candidate.fixture_json || {} }),
      inputSummary: candidate.input_summary,
      sourceCandidateId: candidate.id,
      sourceRunId: candidate.run_id,
    }),
    suggestedTestName: `${taskType}_${failureType}_${candidate.id}_regression`,
    applyHint: "此草案只作为红acted 回归素材返回给管理员；不会自动创建、修改、提交或部署代码。",
  };
}

function normalizeEvalName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-\u4e00-\u9fa5]+/gi, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "agent_eval_candidate";
}

export function generateAgentRunOpenSpecDraftSuggestions(reviews: AgentRunReviewRecord[]): string {
  const actionable = reviews.filter((review) => review.verdict !== "pass" && review.primary_failure_type);
  if (actionable.length === 0) {
    return "No repeated Agent Run failures are ready for an OpenSpec draft.";
  }
  const groups = new Map<string, AgentRunReviewRecord[]>();
  for (const review of actionable) {
    const key = `${review.task_type || "unknown"}:${review.primary_failure_type}`;
    groups.set(key, [...(groups.get(key) || []), review]);
  }
  const lines = [
    "# OpenSpec Draft Suggestions",
    "",
    "These are admin-only draft suggestions generated from redacted Agent Run reviews. They are not applied automatically.",
  ];
  for (const [key, items] of groups) {
    const [taskType, failureType] = key.split(":");
    const sample = items[0];
    lines.push(
      "",
      `## ${taskType} / ${failureType}`,
      "",
      `- Change idea: harden ${taskType} against ${failureType}.`,
      `- Evidence count: ${items.length}`,
      `- Suggested eval name: ${taskType}_${failureType}_regression`,
      `- Expected contract checks: ${redactReviewText(sample.suggested_fix, 500)}`,
      `- Sample evidence: ${sample.evidence_json.slice(0, 2).map((item) => redactReviewText(item.snippet || item.message, 180)).join(" | ") || "n/a"}`,
    );
  }
  return lines.join("\n");
}

export async function triggerAgentRunReview(runId: string): Promise<void> {
  try {
    const review = await reviewAgentRunById(runId);
    if (!review) return;
    await appendReviewStep(runId, review);
  } catch (err) {
    console.error("[agent-run-review]", err);
    await appendReviewErrorStep(runId, err).catch(() => undefined);
  }
}

function addContractCompletionEvidence(run: AgentRunRecord, evidence: AgentRunReviewEvidence[]): void {
  const result = isRecord(run.result_json) ? run.result_json : {};
  const contractResult = isRecord(result.contract) ? result.contract : {};
  const unmet = Array.isArray(contractResult.unmetCriteria) ? contractResult.unmetCriteria.map(String) : [];
  const canClaimSuccess = contractResult.canClaimSuccess;
  if (run.status === "succeeded" && (canClaimSuccess === false || unmet.length > 0)) {
    evidence.push({
      code: "contract.unmet_after_success",
      failureType: unmet.some((item) => /read-?back|读回|校验/i.test(item)) ? "missing_readback" : "tool_contract_mismatch",
      severity: "fail",
      message: "Run claimed success while task contract still has unmet criteria.",
      snippet: redactReviewText(unmet.join(", ")),
      data: { unmetCriteria: unmet.slice(0, 8) },
    });
  }
}

function addReadBackEvidence(steps: AgentRunStepRecord[], evidence: AgentRunReviewEvidence[]): void {
  for (const step of steps) {
    if (!step.tool_name || step.phase === "review") continue;
    const governance = getToolGovernance(step.tool_name);
    if (!governance?.requiresReadBack) continue;
    const verifier = isRecord(step.verifier_json) ? step.verifier_json : {};
    const readBackRequirement = isRecord(verifier.readBackRequirement) ? verifier.readBackRequirement : {};
    const verifiedAction = isRecord(verifier.verifiedAction) ? verifier.verifiedAction : {};
    const readBack = isRecord(verifiedAction.readBack) ? verifiedAction.readBack : {};
    const satisfied =
      readBackRequirement.satisfied === true ||
      readBack.ok === true ||
      containsText(step.output_summary, ["readBackVerified", "read-back verified", "读回"]);
    const required = readBackRequirement.required === true || governance.requiresReadBack;
    if (step.status === "succeeded" && required && !satisfied) {
      evidence.push({
        code: "readback.required_missing",
        failureType: "missing_readback",
        severity: "fail",
        message: `Tool ${step.tool_name} succeeded without read-back verification evidence.`,
        stepId: step.id,
        phase: step.phase,
        toolName: step.tool_name,
        snippet: redactReviewText(step.output_summary || verifier),
      });
    }
  }
}

function addRouteEvidence(run: AgentRunRecord, steps: AgentRunStepRecord[], evidence: AgentRunReviewEvidence[]): void {
  const contract = isRecord(run.contract_json) ? run.contract_json : {};
  const routing = isRecord(contract.routing) ? contract.routing : {};
  if (routing.requiresClarification === true || nonEmptyString(routing.blockedReason)) {
    evidence.push({
      code: "routing.needs_clarification",
      failureType: "routing_error",
      severity: run.status === "succeeded" ? "fail" : "warning",
      message: "Routing audit required clarification or had a blocked reason.",
      snippet: redactReviewText(routing.clarificationQuestion || routing.blockedReason || routing.auditSummary),
    });
  }
  if (routing.routeLocked === true) {
    const activeTaskType = typeof routing.activeTaskType === "string" ? routing.activeTaskType : "";
    const expectedAgentId = expectedAgentForTask(activeTaskType);
    if (activeTaskType && run.task_type !== activeTaskType) {
      evidence.push({
        code: "routing.active_task_type_mismatch",
        failureType: "guided_task_drift",
        severity: "fail",
        message: "Run task type did not match the active guided task lock.",
        snippet: redactReviewText(`active=${activeTaskType}, actual=${run.task_type}`),
      });
    }
    if (expectedAgentId && run.agent_id !== expectedAgentId) {
      evidence.push({
        code: "routing.active_task_agent_mismatch",
        failureType: "guided_task_drift",
        severity: "fail",
        message: "Run agent did not match the active guided task owner.",
        snippet: redactReviewText(`active=${activeTaskType}/${expectedAgentId}, actual=${run.task_type}/${run.agent_id}`),
      });
    }
  }
  for (const step of steps) {
    const combined = `${step.output_summary} ${redactReviewText(step.verifier_json)} ${redactReviewText(step.error_json)}`;
    if (/tool_governance|governanceBlocked|blockedBy|route blocked|路由阻断/i.test(combined)) {
      evidence.push({
        code: "routing.governance_blocked",
        failureType: combined.includes("tool_governance") || /governanceBlocked/i.test(combined)
          ? "tool_contract_mismatch"
          : "routing_error",
        severity: "fail",
        message: "Tool route was blocked by governance or route contract.",
        stepId: step.id,
        phase: step.phase,
        toolName: step.tool_name,
        snippet: redactReviewText(combined),
      });
    }
  }
}

function expectedAgentForTask(taskType: string): string {
  const map: Record<string, string> = {
    career_positioning_guidance: "profile",
    interview_coaching: "interview",
    reference_resume_save: "resume",
    resume_edit: "resume",
    jd_evaluation: "evaluate",
    offer_evaluation: "offer",
    profile_update: "profile",
  };
  return map[taskType] || "";
}

function addImageIntakeEvidence(run: AgentRunRecord, steps: AgentRunStepRecord[], evidence: AgentRunReviewEvidence[]): void {
  const taskText = `${run.task_type} ${redactReviewText(run.contract_json)} ${steps.map((step) => `${step.input_summary} ${step.output_summary}`).join(" ")}`;
  const wantsImage = /image|screenshot|截图|图片|JD截图|offer截图|简历截图/i.test(taskText);
  const imageTask = /jd_evaluation|offer_evaluation|resume_edit|reference_resume_save|profile_update/i.test(run.task_type);
  if (!wantsImage && !imageTask) return;
  const hasIntakeStep = steps.some((step) => (
    /image[-_ ]?intake|recognize_document_image|ocr|vision|classify/i.test(`${step.phase} ${step.tool_name}`)
  ));
  const hasBusinessTool = steps.some((step) => /evaluate_jd_full|evaluate_offer|save_reference_resume|import_resume|create_resume_edit_proposal/i.test(step.tool_name));
  const failedIntake = steps.find((step) => (
    /OCR API|图片输入格式|解析错误|未能从截图|429|image_intake|document type conflict|unknown document/i.test(`${step.output_summary} ${redactReviewText(step.error_json)} ${redactReviewText(step.verifier_json)}`)
  ));
  if (failedIntake) {
    evidence.push({
      code: "image_intake.failed",
      failureType: "image_intake_failure",
      severity: "fail",
      message: "Image intake failed or could not classify/extract the uploaded document.",
      stepId: failedIntake.id,
      phase: failedIntake.phase,
      toolName: failedIntake.tool_name,
      snippet: redactReviewText(`${failedIntake.output_summary} ${redactReviewText(failedIntake.error_json)}`),
    });
  } else if (wantsImage && imageTask && hasBusinessTool && !hasIntakeStep) {
    evidence.push({
      code: "image_intake.skipped",
      failureType: "image_intake_failure",
      severity: "fail",
      message: "Image-based business task reached business tools without a recorded image intake/classification step.",
      snippet: redactReviewText(taskText),
    });
  } else if (wantsImage && !hasIntakeStep && run.status !== "cancelled") {
    evidence.push({
      code: "image_intake.no_intake",
      failureType: "image_intake_failure",
      severity: "warning",
      message: "Run mentions uploaded images but has no image intake evidence.",
      snippet: redactReviewText(taskText),
    });
  }
}

function addResumePollutionEvidence(run: AgentRunRecord, steps: AgentRunStepRecord[], evidence: AgentRunReviewEvidence[]): void {
  if (!/resume_edit|reference_resume_save/i.test(run.task_type)) return;
  for (const step of steps) {
    const text = `${step.input_summary}\n${step.output_summary}`;
    if (hasResumePollution(text)) {
      evidence.push({
        code: "resume.polluted_output",
        failureType: "resume_write_pollution",
        severity: "fail",
        message: "Resume write/output contains markdown control text, placeholders, or partial replacement markers.",
        stepId: step.id,
        phase: step.phase,
        toolName: step.tool_name,
        snippet: redactReviewText(text),
      });
    }
  }
  if (hasResumePollution(redactReviewText(run.result_json))) {
    evidence.push({
      code: "resume.polluted_result",
      failureType: "resume_write_pollution",
      severity: "fail",
      message: "Run result contains resume pollution markers.",
      snippet: redactReviewText(run.result_json),
    });
  }
}

function addProfileSignalEvidence(run: AgentRunRecord, steps: AgentRunStepRecord[], evidence: AgentRunReviewEvidence[]): void {
  if (!/profile_update|career_positioning_guidance/i.test(run.task_type)) return;
  const noiseTerms = [
    "业务",
    "技术",
    "灵性",
    "去寻",
    "野蛮",
    "先解",
    "优先邀你下午茶",
    "带你直接进入",
    "的技术方案",
  ];
  for (const step of steps) {
    const text = `${step.input_summary} ${step.output_summary} ${redactReviewText(step.verifier_json)} ${redactReviewText(step.error_json)}`;
    if (/signal validator|low-quality|rejected signal|profile_signal_noise|无效信息|低价值/i.test(text) || noiseTerms.some((term) => text.includes(term))) {
      evidence.push({
        code: "profile.signal_noise",
        failureType: "profile_signal_noise",
        severity: "warning",
        message: "Profile extraction surfaced low-value or noisy candidate signals.",
        stepId: step.id,
        phase: step.phase,
        toolName: step.tool_name,
        snippet: redactReviewText(text),
      });
    }
  }
}

function addMemoryGovernanceEvidence(run: AgentRunRecord, steps: AgentRunStepRecord[], evidence: AgentRunReviewEvidence[]): void {
  const taskText = `${run.task_type} ${redactReviewText(run.contract_json)}`;
  if (!/memory|reference_resume_save|profile_update/i.test(taskText)) return;
  for (const step of steps) {
    const text = `${step.tool_name} ${step.output_summary} ${redactReviewText(step.verifier_json)} ${redactReviewText(step.error_json)}`;
    if (/candidate memory|memory governance|approve|reject|delete|not found|status transition|候选记忆|记忆治理/i.test(text) && step.status !== "succeeded") {
      evidence.push({
        code: "memory.governance_failed",
        failureType: "memory_governance_failure",
        severity: "fail",
        message: "Memory governance action did not complete a valid status transition.",
        stepId: step.id,
        phase: step.phase,
        toolName: step.tool_name,
        snippet: redactReviewText(text),
      });
    }
  }
}

function addInterviewPolicyEvidence(run: AgentRunRecord, steps: AgentRunStepRecord[], evidence: AgentRunReviewEvidence[]): void {
  if (!/interview_coaching/i.test(run.task_type)) return;
  for (const step of steps) {
    const text = step.output_summary || step.input_summary;
    const questionMarks = (text.match(/[?？]/g) || []).length;
    const numberedQuestions = (text.match(/(?:第\s*\d+\s*[题問问]|^\s*\d+[.、])/gm) || []).length;
    if (questionMarks >= 3 || numberedQuestions >= 2 || /8\s*道题|八道题|一次性.*题/.test(text)) {
      evidence.push({
        code: "interview.multiple_questions",
        failureType: "interview_policy_violation",
        severity: "fail",
        message: "Interview coach appears to ask multiple questions in one turn.",
        stepId: step.id,
        phase: step.phase,
        toolName: step.tool_name,
        snippet: redactReviewText(text),
      });
    }
    if (/你是准备面什么公司|什么岗位的面试|请告诉我.*岗位/i.test(text)) {
      evidence.push({
        code: "interview.context_binding_lost",
        failureType: "interview_policy_violation",
        severity: "warning",
        message: "Interview coach asked for JD/role again after context should have been bound.",
        stepId: step.id,
        phase: step.phase,
        toolName: step.tool_name,
        snippet: redactReviewText(text),
      });
    }
  }
}

function addContextLossEvidence(run: AgentRunRecord, steps: AgentRunStepRecord[], evidence: AgentRunReviewEvidence[]): void {
  const text = `${redactReviewText(run.result_json)} ${steps.map((step) => step.output_summary).join(" ")}`;
  if (/继续.*什么岗位|请重新上传|请把.*发给我|我目前无法直接读取图片|你方便贴文字|重新告诉我/i.test(text)) {
    evidence.push({
      code: "context.lost_active_task",
      failureType: "context_loss",
      severity: "warning",
      message: "Final output asks for information that the active task likely already provided.",
      snippet: redactReviewText(text),
    });
  }
}

function addRenderingEvidence(run: AgentRunRecord, steps: AgentRunStepRecord[], evidence: AgentRunReviewEvidence[]): void {
  const text = `${redactReviewText(run.result_json)} ${steps.map((step) => step.output_summary).join(" ")}`;
  const repeatedReadChatter = (text.match(/好的[，,]?(我先读取|你的简历刚才被截断|简历被截断|我读了)/g) || []).length;
  if (
    repeatedReadChatter >= 2 ||
    /已读取文件|达到处理上限|评估结果似乎没有完整返回|作为AI求职评估引擎|^\s*\| 修改前 \| 修改后 \| 原因 \|/m.test(text)
  ) {
    evidence.push({
      code: "output.rendering_noise",
      failureType: "bad_output_rendering",
      severity: "warning",
      message: "Assistant output exposes internal chatter, raw tool fragments, or incomplete summary structure.",
      snippet: redactReviewText(text),
    });
  }
}

function buildEvalCandidateInput(
  review: AgentRunReviewRecord,
  run: AgentRunRecord,
  steps: AgentRunStepRecord[],
): CreateEvalCandidateInput | null {
  if (review.verdict === "pass" || !review.primary_failure_type) return null;
  const firstEvidence = review.evidence_json[0];
  const inputSummary = firstEvidence?.snippet || steps.find((step) => step.input_summary)?.input_summary || run.task_type;
  const repairPlan = planAgentRepair({
    failureType: review.primary_failure_type,
    taskType: run.task_type,
    agentId: run.agent_id,
    hasOriginalImage: /image|\[image\]|截图|图片/i.test(inputSummary),
    imageQuality: inferImageQualityFromEvidence(review.evidence_json),
    hasReadBackEvidence: hasReadBackEvidence(steps),
    hasPartialWrite: review.failure_types.includes("partial_write"),
    assistantClaimedSuccess: assistantClaimsSuccess(redactReviewText(run.result_json, 800)),
    activeTaskType: readRoutingField(run.contract_json, "activeTaskType"),
    activeAgentId: expectedAgentForTask(readRoutingField(run.contract_json, "activeTaskType")),
  });
  return {
    reviewId: review.id,
    runId: run.id,
    name: `${run.task_type || "agent"}_${review.primary_failure_type}`,
    taskType: run.task_type || "unknown",
    failureType: review.primary_failure_type,
    inputSummary,
    expectedContract: {
      taskType: run.task_type,
      contract: sanitizeReviewJson(run.contract_json),
      mustNotRepeatFailure: review.primary_failure_type,
      repairPlan: serializeRepairPlanForLedger(repairPlan),
    },
    fixture: {
      runStatus: run.status,
      agentId: run.agent_id,
      evidence: review.evidence_json.slice(0, 3),
      repairPlan: serializeRepairPlanForLedger(repairPlan),
      steps: steps.slice(-5).map((step) => ({
        phase: step.phase,
        toolName: step.tool_name,
        status: step.status,
        inputSummary: redactReviewText(step.input_summary),
        outputSummary: redactReviewText(step.output_summary),
      })),
    },
  };
}

function withAdditionalEvidence(input: UpsertReviewInput, extraEvidence: AgentRunReviewEvidence[]): UpsertReviewInput {
  const evidence = dedupeEvidence([...input.evidence, ...extraEvidence]);
  const failureTypes = Array.from(new Set(evidence.map((item) => item.failureType)));
  const failCount = evidence.filter((item) => item.severity === "fail").length;
  const warningCount = evidence.filter((item) => item.severity === "warning").length;
  const verdict: AgentRunReviewVerdict = failCount > 0 ? "fail" : warningCount > 0 ? "warning" : "pass";
  const primaryFailureType = choosePrimaryFailureType(evidence);
  const score = verdict === "pass"
    ? 1
    : Math.max(0, Number((1 - failCount * 0.35 - warningCount * 0.12).toFixed(2)));
  return {
    ...input,
    verdict,
    score,
    failureTypes,
    primaryFailureType,
    evidence,
    suggestedFix: buildSuggestedFix(primaryFailureType, evidence),
    evalCandidate: verdict === "pass" ? {} : {
      primaryFailureType,
      failureTypes,
      evidenceCount: evidence.length,
    },
  };
}

async function callReviewLlmJudge(prompt: string): Promise<AgentRunLlmJudgeResult | null> {
  const apiKey = process.env.AGENT_RUN_REVIEW_LLM_API_KEY || process.env.DEEPSEEK_API_KEY || "";
  if (!apiKey) return null;
  const apiUrl = process.env.AGENT_RUN_REVIEW_LLM_API_URL || "https://api.deepseek.com/chat/completions";
  const model = process.env.AGENT_RUN_REVIEW_LLM_MODEL || "deepseek-v4-flash";
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LLM_JUDGE_TIMEOUT_MS);
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Return only compact JSON for Agent Run review quality judgment." },
            { role: "user", content: prompt },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        lastError = new Error(`LLM judge HTTP ${response.status}`);
        continue;
      }
      const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return parseLlmJudgeResult(json.choices?.[0]?.message?.content || "");
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.warn("[agent-run-review/llm-judge]", lastError);
  }
  return null;
}

function parseLlmJudgeResult(content: string): AgentRunLlmJudgeResult | null {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    return {
      qualityWarning: parsed.qualityWarning === true,
      reason: redactReviewText(parsed.reason || "", 300),
      failureType: parsed.failureType ? normalizeFailureType(parsed.failureType) : "llm_judge_quality_warning",
    };
  } catch {
    return null;
  }
}

function buildSuggestedFix(failureType: AgentRunFailureType | "", evidence: AgentRunReviewEvidence[]): string {
  if (!failureType) return "No deterministic failure detected. Keep monitoring similar runs.";
  const base = {
    routing_error: "Check task routing and clarification gates before allowing business tools to run.",
    tool_contract_mismatch: "Align tool governance, task contract, and allowed tool route; add a regression eval for the blocked route.",
    missing_run: "Create a durable run or session anomaly for every tool-capable business turn before executing tools.",
    wrong_task_routed: "Compare latest user intent, active guided task, selected task, and selected agent before claiming success.",
    tool_failed_but_message_success: "If a tool fails, the final assistant message must surface the failure and keep the task failed or waiting_user.",
    tool_succeeded_but_message_failure: "When tools succeed, verify final user-facing summary generation instead of returning a generic failure.",
    missing_readback: "Require verified read-back evidence before claiming success for write/export/admin tools.",
    partial_write: "Wrap multi-table writes in transactions and repair/rollback partial artifacts before claiming completion.",
    image_intake_failure: "Route uploaded images through image intake/classification/OCR before JD, offer, resume, or memory agents.",
    image_intake_not_called: "Always record recognize_document_image/image-intake for uploaded images before business routing.",
    image_intake_conflict_ignored: "Stop business tools when image type and user text disagree; ask one clarification question.",
    guided_task_drift: "Keep active guided sessions locked to their owning agent until completion, cancellation, or confirmed switch.",
    context_loss: "Persist active task context and resume state; avoid asking for already-provided JD/resume/offer material.",
    bad_output_rendering: "Strip internal tool chatter and render a structured, user-facing summary only.",
    admin_action_no_feedback: "Return visible admin action feedback and refresh the affected queue item after every governance action.",
    resume_write_pollution: "Use proposal/apply flow and document validators before writing resume sections.",
    profile_signal_noise: "Tighten profile signal filters with entity/type/length/source-evidence checks.",
    interview_policy_violation: "Enforce one-question-at-a-time policy and keep JD/resume binding in interview state.",
    memory_governance_failure: "Verify memory candidate status transitions and surface action feedback to admins.",
    user_intent_unresolved: "Ask one targeted clarification and keep the run waiting_user instead of claiming completion.",
    llm_judge_quality_warning: "Review semantic quality warning and promote to deterministic check if repeated.",
    system_error: "Inspect terminal error and add a narrower failure label if the pattern repeats.",
  } satisfies Record<AgentRunFailureType, string>;
  return `${base[failureType]} Evidence: ${evidence.slice(0, 2).map((item) => item.code).join(", ")}`;
}

function choosePrimaryFailureType(evidence: AgentRunReviewEvidence[]): AgentRunFailureType | "" {
  const firstFail = evidence.find((item) => item.severity === "fail");
  if (firstFail) return firstFail.failureType;
  return evidence[0]?.failureType || "";
}

function dedupeEvidence(evidence: AgentRunReviewEvidence[]): AgentRunReviewEvidence[] {
  const seen = new Set<string>();
  const output: AgentRunReviewEvidence[] = [];
  for (const item of evidence) {
    const safeItem = {
      ...item,
      failureType: normalizeFailureType(item.failureType),
      message: redactReviewText(item.message, 300),
      snippet: item.snippet ? redactReviewText(item.snippet) : undefined,
      data: sanitizeReviewJson(item.data),
    };
    const key = `${safeItem.code}:${safeItem.failureType}:${safeItem.stepId || 0}:${safeItem.toolName || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(safeItem);
  }
  return output.slice(0, 20);
}

function firstKnownFailure(value: unknown): AgentRunFailureType | "" {
  const text = redactReviewText(value, 800);
  for (const type of AGENT_RUN_FAILURE_TYPES) {
    if (text.includes(type)) return type;
  }
  if (/read-?back|读回|校验/i.test(text)) return "missing_readback";
  if (/image|ocr|截图|图片/i.test(text)) return "image_intake_failure";
  return "";
}

function buildEvalDedupeKey(taskType: string, failureType: AgentRunFailureType, inputSummary: string): string {
  const normalized = redactReviewText(inputSummary, 120)
    .toLowerCase()
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim();
  const hash = createHash("sha256").update(`${taskType}:${failureType}:${normalized}`).digest("hex").slice(0, 16);
  return `${taskType}:${failureType}:${hash}`;
}

function buildSessionCandidate(input: {
  input: AgentSessionAnomalyInput;
  failureType: AgentRunFailureType;
  taskType: string;
  code: string;
  inputSummary: string;
  expected: string;
  actual: string;
}): CreateEvalCandidateInput {
  const taskType = input.taskType || "unknown";
  const failureType = normalizeFailureType(input.failureType);
  const repairPlan = planAgentRepair({
    failureType,
    taskType,
    hasOriginalImage: input.input.messages.some((message) => Array.isArray(message.images) && message.images.length > 0),
    activeTaskType: input.input.activeTask?.taskType,
    activeAgentId: input.input.activeTask?.agentId,
    assistantClaimedSuccess: assistantClaimsSuccess(input.actual),
  });
  return {
    reviewId: null,
    runId: null,
    name: `${taskType}_${failureType}_session_anomaly`,
    taskType,
    failureType,
    inputSummary: input.inputSummary,
    expectedContract: {
      source: "session_anomaly",
      sessionId: input.input.sessionId ?? null,
      activeTask: sanitizeReviewJson(input.input.activeTask || {}),
      expected: input.expected,
      mustNotRepeatFailure: failureType,
      repairPlan: serializeRepairPlanForLedger(repairPlan),
    },
    fixture: {
      code: input.code,
      userId: redactReviewText(input.input.userId),
      sessionId: input.input.sessionId ?? null,
      activeTask: sanitizeReviewJson(input.input.activeTask || {}),
      recentRuns: sanitizeReviewJson(input.input.recentRuns || []),
      actual: redactReviewText(input.actual, 500),
      repairPlan: serializeRepairPlanForLedger(repairPlan),
      messages: input.input.messages.slice(-6).map((message) => ({
        role: message.role,
        agentId: message.agent_id,
        toolName: message.toolName,
        hasImages: Array.isArray(message.images) && message.images.length > 0,
        content: redactReviewText(message.content || "", 260),
        toolResult: sanitizeReviewJson(message.toolResult || {}),
      })),
    },
    dedupeKey: buildEvalDedupeKey(taskType, failureType, `${input.code}:${input.inputSummary}`),
  };
}

function dedupeSessionCandidates(candidates: CreateEvalCandidateInput[]): CreateEvalCandidateInput[] {
  const seen = new Set<string>();
  const output: CreateEvalCandidateInput[] = [];
  for (const candidate of candidates) {
    const key = candidate.dedupeKey || `${candidate.taskType}:${candidate.failureType}:${candidate.inputSummary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
  }
  return output;
}

function hasImageIntakeToolMessage(messages: AgentSessionReviewMessage[]): boolean {
  return messages.some((message) => (
    /recognize_document_image|image[-_ ]?intake|ocr|vision/i.test(`${message.toolName || ""} ${message.content || ""}`)
  ));
}

function toolMessageIndicatesFailure(message: AgentSessionReviewMessage): boolean {
  const result = isRecord(message.toolResult) ? message.toolResult : {};
  if (result.success === false) return true;
  const text = `${message.content || ""} ${redactReviewText(message.toolResult)}`;
  return /失败|报错|error|failed|HTTP 500|HTTP 400|401|429|read-?back mismatch|未完成|未能|无法|不能|OCR API|图片输入格式/i.test(text);
}

function assistantClaimsSuccess(content: string): boolean {
  return /已完成|已经完成|已保存|保存成功|已写入|评估完成|完整报告已保存|操作完成|done|success/i.test(content);
}

function inferTaskTypeFromToolName(toolName?: string): string {
  if (!toolName) return "";
  if (/evaluate_jd/.test(toolName)) return "jd_evaluation";
  if (/evaluate_offer|offer/.test(toolName)) return "offer_evaluation";
  if (/resume|cv/.test(toolName)) return "resume_edit";
  if (/interview/.test(toolName)) return "interview_coaching";
  if (/profile|mine_profile/.test(toolName)) return "profile_update";
  return "";
}

function inferTaskTypeFromSessionText(text: string, fallback?: string): string {
  if (fallback) return fallback;
  if (/(JD|jd|职位|岗位|招聘|job description)/i.test(text)) return "jd_evaluation";
  if (/(offer|录用|薪资|待遇)/i.test(text)) return "offer_evaluation";
  if (/(简历|resume|cv)/i.test(text)) return "resume_edit";
  if (/(面试|下一题|追问)/i.test(text)) return "interview_coaching";
  if (/(自我定位|职业方向|画像)/i.test(text)) return "career_positioning_guidance";
  return "general_chat";
}

function inferImageQualityFromEvidence(evidence: AgentRunReviewEvidence[]): string | undefined {
  const text = evidence.map((item) => `${item.snippet || ""} ${redactReviewText(item.data)}`).join(" ");
  if (/thumbnail|缩略|小图/.test(text)) return "thumbnail";
  if (/unreadable|无法识别|读不清/.test(text)) return "unreadable";
  if (/blurred|模糊/.test(text)) return "blurred";
  if (/clear|清晰/.test(text)) return "clear";
  return undefined;
}

function hasReadBackEvidence(steps: AgentRunStepRecord[]): boolean {
  return steps.some((step) => {
    const text = `${step.output_summary} ${redactReviewText(step.verifier_json)}`;
    return /readBackVerified|read-back verified|readBack.*true|读回.*通过|hash matches/i.test(text);
  });
}

function readRoutingField(contractJson: unknown, field: string): string {
  const contract = isRecord(contractJson) ? contractJson : {};
  const routing = isRecord(contract.routing) ? contract.routing : {};
  return typeof routing[field] === "string" ? routing[field] : "";
}

function hasResumePollution(text: string): boolean {
  return (
    /\|\s*修改前\s*\|\s*修改后\s*\|\s*原因\s*\|/.test(text) ||
    /```/.test(text) ||
    /替换为[:：]/.test(text) ||
    /保持原有详细描述不动/.test(text) ||
    /简历.*被截断|被截断.*补读完整/.test(text) ||
    /项目经验\s*[→-]\s*替换为[:：]\s*$/.test(text)
  );
}

function containsText(value: unknown, needles: string[]): boolean {
  const text = redactReviewText(value, 1200).toLowerCase();
  return needles.some((needle) => text.includes(needle.toLowerCase()));
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function lastStep(steps: AgentRunStepRecord[]): AgentRunStepRecord | undefined {
  return steps[steps.length - 1];
}

async function getAgentRunForReview(runId: string): Promise<AgentRunRecord | null> {
  return withPostgresClient(async (client) => {
    const result = await client.query("SELECT * FROM agent_runs WHERE id = $1", [runId]);
    return result.rows[0] ? normalizeRun(result.rows[0]) : null;
  });
}

async function listAgentRunStepsForReview(runId: string): Promise<AgentRunStepRecord[]> {
  return withPostgresClient(async (client) => {
    const result = await client.query("SELECT * FROM agent_run_steps WHERE run_id = $1 ORDER BY created_at ASC", [runId]);
    return result.rows.map(normalizeStep);
  });
}

async function appendReviewStep(runId: string, review: AgentRunReviewRecord): Promise<void> {
  await withPostgresClient(async (client) => {
    await client.query(
      "DELETE FROM agent_run_steps WHERE run_id = $1 AND phase = 'review' AND tool_name = 'agent_run_review'",
      [runId],
    );
    await client.query(`
      INSERT INTO agent_run_steps
        (run_id, phase, tool_name, status, input_summary, output_summary, verifier_json, error_json)
      VALUES ($1, 'review', 'agent_run_review', $2, $3, $4, $5::jsonb, '{}'::jsonb)
    `, [
      runId,
      review.verdict === "fail" ? "failed" : "succeeded",
      `reviewer=${review.reviewer_version}`,
      `verdict=${review.verdict}; primary=${review.primary_failure_type || "none"}; score=${review.score}`,
      JSON.stringify({
        reviewId: review.id,
        verdict: review.verdict,
        score: review.score,
        primaryFailureType: review.primary_failure_type,
        failureTypes: review.failure_types,
      }),
    ]);
  });
}

async function appendReviewErrorStep(runId: string, err: unknown): Promise<void> {
  await withPostgresClient(async (client) => {
    await client.query(`
      INSERT INTO agent_run_steps
        (run_id, phase, tool_name, status, input_summary, output_summary, verifier_json, error_json)
      VALUES ($1, 'review', 'agent_run_review', 'failed', 'review trigger failed', $2, '{}'::jsonb, $3::jsonb)
    `, [
      runId,
      redactReviewText(err instanceof Error ? err.message : err),
      JSON.stringify({ message: redactReviewText(err instanceof Error ? err.message : err) }),
    ]);
  });
}

async function getEvalCandidateForReview(reviewId: number): Promise<AgentEvalCandidateRecord | null> {
  return withPostgresClient(async (client) => {
    const result = await client.query(`
      SELECT *
      FROM agent_eval_candidates
      WHERE review_id = $1
      ORDER BY updated_at DESC
      LIMIT 1
    `, [reviewId]);
    return result.rows[0] ? normalizeCandidate(result.rows[0]) : null;
  });
}

function normalizeReview(row: Record<string, unknown>): AgentRunReviewRecord {
  const failureTypes = Array.isArray(row.failure_types) ? row.failure_types.map(normalizeFailureType) : [];
  const evidence = Array.isArray(row.evidence_json)
    ? row.evidence_json.map(normalizeEvidence)
    : [];
  return {
    id: Number(row.id),
    run_id: String(row.run_id),
    user_id: String(row.user_id),
    session_id: row.session_id === null || row.session_id === undefined ? null : Number(row.session_id),
    task_type: String(row.task_type || ""),
    agent_id: String(row.agent_id || ""),
    verdict: normalizeVerdict(row.verdict),
    score: Number(row.score || 0),
    primary_failure_type: row.primary_failure_type ? normalizeFailureType(row.primary_failure_type) : "",
    failure_types: failureTypes,
    evidence_json: evidence,
    suggested_fix: String(row.suggested_fix || ""),
    eval_candidate_json: sanitizeReviewJson(row.eval_candidate_json || {}),
    reviewer_version: String(row.reviewer_version || ""),
    reviewed_at: toIso(row.reviewed_at),
  };
}

function normalizeEvidence(value: unknown): AgentRunReviewEvidence {
  const item = isRecord(value) ? value : {};
  return {
    code: String(item.code || "unknown"),
    failureType: normalizeFailureType(item.failureType),
    severity: item.severity === "fail" ? "fail" : "warning",
    message: redactReviewText(item.message || ""),
    stepId: item.stepId === undefined ? undefined : Number(item.stepId),
    phase: item.phase === undefined ? undefined : String(item.phase),
    toolName: item.toolName === undefined ? undefined : String(item.toolName),
    snippet: item.snippet === undefined ? undefined : redactReviewText(item.snippet),
    data: sanitizeReviewJson(item.data),
  };
}

function normalizeCandidate(row: Record<string, unknown>): AgentEvalCandidateRecord {
  return {
    id: Number(row.id),
    review_id: row.review_id === null || row.review_id === undefined ? null : Number(row.review_id),
    run_id: row.run_id === null || row.run_id === undefined ? null : String(row.run_id),
    name: String(row.name || ""),
    task_type: String(row.task_type || ""),
    failure_type: normalizeFailureType(row.failure_type),
    input_summary: redactReviewText(row.input_summary || ""),
    expected_contract_json: sanitizeReviewJson(row.expected_contract_json || {}),
    fixture_json: sanitizeReviewJson(row.fixture_json || {}),
    status: normalizeCandidateStatus(row.status),
    admin_note: String(row.admin_note || ""),
    dedupe_key: String(row.dedupe_key || ""),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function normalizeRun(row: Record<string, unknown>): AgentRunRecord {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    session_id: row.session_id === null || row.session_id === undefined ? null : Number(row.session_id),
    task_type: String(row.task_type || ""),
    agent_id: String(row.agent_id || ""),
    status: String(row.status || "planned") as AgentRunStatus,
    contract_json: row.contract_json || {},
    result_json: row.result_json || {},
    error_json: row.error_json || {},
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function normalizeStep(row: Record<string, unknown>): AgentRunStepRecord {
  return {
    id: Number(row.id),
    run_id: String(row.run_id || ""),
    phase: String(row.phase || ""),
    tool_name: String(row.tool_name || ""),
    status: String(row.status || ""),
    input_summary: String(row.input_summary || ""),
    output_summary: String(row.output_summary || ""),
    verifier_json: row.verifier_json || {},
    error_json: row.error_json || {},
    created_at: toIso(row.created_at),
  };
}

function normalizeVerdict(value: unknown): AgentRunReviewVerdict {
  return value === "pass" || value === "fail" ? value : "warning";
}

function normalizeCandidateStatus(value: unknown): AgentEvalCandidateStatus {
  return value === "accepted" || value === "rejected" || value === "promoted" ? value : "candidate";
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value ? String(value) : "";
}
