import { randomUUID } from "crypto";
import { withPostgresClient } from "@/lib/postgres";
import { redactReviewText } from "@/lib/agent/run-review";
import type { JourneyEvalRecord } from "@/lib/agent/journey-eval";
import type { AgentEvalLayer, AgentEvalLayerResult } from "@/lib/agent/eval-release-gates";

export type AgentEvalRunMode = "deterministic" | "staging" | "release";
export type AgentEvalRunStatus = "running" | "passed" | "failed" | "flaky";

export interface AgentEvalRunRecord {
  id: string;
  created_by_user_id: string | null;
  mode: AgentEvalRunMode;
  status: AgentEvalRunStatus;
  code_commit: string;
  model_version: string;
  prompt_version: string;
  tool_version: string;
  fixture_id: string;
  fixture_version: string;
  graph_version: string;
  judge_version: string;
  score: number | null;
  hard_gate_passed: boolean;
  gate_results_json: Record<string, unknown>;
  failure_evidence_json: unknown[];
  review_id: number | null;
  candidate_id: number | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateAgentEvalRunInput {
  createdByUserId?: string | null;
  mode?: AgentEvalRunMode;
  status?: AgentEvalRunStatus;
  codeCommit?: string;
  modelVersion?: string;
  promptVersion?: string;
  toolVersion?: string;
  fixtureId: string;
  fixtureVersion: string;
  graphVersion: string;
  judgeVersion?: string;
  score?: number | null;
  hardGatePassed: boolean;
  gateResults?: Record<string, unknown>;
  failureEvidence?: unknown[];
  reviewId?: number | null;
  candidateId?: number | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateAgentEvalRunInput {
  status?: AgentEvalRunStatus;
  score?: number | null;
  hardGatePassed?: boolean;
  gateResults?: Record<string, unknown>;
  failureEvidence?: unknown[];
  reviewId?: number | null;
  candidateId?: number | null;
  metadata?: Record<string, unknown>;
}

const MODES = new Set<AgentEvalRunMode>(["deterministic", "staging", "release"]);
const STATUSES = new Set<AgentEvalRunStatus>(["running", "passed", "failed", "flaky"]);

export function normalizeEvalRunMode(value: unknown): AgentEvalRunMode {
  return MODES.has(value as AgentEvalRunMode) ? value as AgentEvalRunMode : "deterministic";
}

export function normalizeEvalRunStatus(value: unknown): AgentEvalRunStatus {
  return STATUSES.has(value as AgentEvalRunStatus) ? value as AgentEvalRunStatus : "running";
}

export async function createAgentEvalRun(input: CreateAgentEvalRunInput): Promise<AgentEvalRunRecord> {
  if (!input.fixtureId.trim() || !input.fixtureVersion.trim()) throw new Error("Eval fixture identity is required");
  const status = normalizeEvalRunStatus(input.status);
  const score = normalizeScore(input.score);
  return withPostgresClient(async (client) => {
    const result = await client.query(`
      INSERT INTO agent_eval_runs (
        id, created_by_user_id, mode, status, code_commit, model_version, prompt_version,
        tool_version, fixture_id, fixture_version, graph_version, judge_version, score,
        hard_gate_passed, gate_results_json, failure_evidence_json, review_id, candidate_id, metadata_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15::jsonb, $16::jsonb, $17, $18, $19::jsonb)
      RETURNING *
    `, [
      randomUUID(), input.createdByUserId || null, normalizeEvalRunMode(input.mode), status,
      bounded(input.codeCommit), bounded(input.modelVersion), bounded(input.promptVersion), bounded(input.toolVersion),
      bounded(input.fixtureId), bounded(input.fixtureVersion), bounded(input.graphVersion), bounded(input.judgeVersion), score,
      input.hardGatePassed === true,
      JSON.stringify(sanitizeRecord(input.gateResults || {})),
      JSON.stringify(sanitizeArray(input.failureEvidence || [])),
      input.reviewId ?? null, input.candidateId ?? null,
      JSON.stringify(sanitizeRecord(input.metadata || {})),
    ]);
    return normalizeEvalRun(result.rows[0]);
  });
}

export async function persistDeterministicJourneyEval(input: {
  record: JourneyEvalRecord;
  createdByUserId?: string | null;
  codeCommit?: string;
  modelVersion?: string;
  promptVersion?: string;
  toolVersion?: string;
  judgeVersion?: string;
  metadata?: Record<string, unknown>;
}): Promise<AgentEvalRunRecord> {
  return createAgentEvalRun({
    createdByUserId: input.createdByUserId,
    mode: "deterministic",
    status: input.record.status,
    codeCommit: input.codeCommit || process.env.GIT_COMMIT || "unknown",
    modelVersion: input.modelVersion || "deterministic-adapter",
    promptVersion: input.promptVersion || "fixture-prompt",
    toolVersion: input.toolVersion || "fixture-tools",
    fixtureId: input.record.fixtureId,
    fixtureVersion: input.record.fixtureVersion,
    graphVersion: input.record.graphVersion,
    judgeVersion: input.judgeVersion || "deterministic-gates-v1",
    score: input.record.hardGatePassed ? 1 : 0,
    hardGatePassed: input.record.hardGatePassed,
    gateResults: input.record.gates,
    failureEvidence: input.record.failures,
    metadata: {
      ...(input.metadata || {}),
      path: input.record.path,
      fixtureHash: input.record.fixtureHash,
      artifactRefs: input.record.evidence.artifactRefs,
      userText: input.record.evidence.userText,
    },
  });
}

export async function updateAgentEvalRun(id: string, input: UpdateAgentEvalRunInput): Promise<AgentEvalRunRecord | null> {
  if (!id.trim()) return null;
  return withPostgresClient(async (client) => {
    const result = await client.query(`
      UPDATE agent_eval_runs
      SET status = COALESCE($2, status),
          score = COALESCE($3, score),
          hard_gate_passed = COALESCE($4, hard_gate_passed),
          gate_results_json = COALESCE($5::jsonb, gate_results_json),
          failure_evidence_json = COALESCE($6::jsonb, failure_evidence_json),
          review_id = COALESCE($7, review_id),
          candidate_id = COALESCE($8, candidate_id),
          metadata_json = COALESCE($9::jsonb, metadata_json),
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `, [
      id,
      input.status ? normalizeEvalRunStatus(input.status) : null,
      input.score === undefined ? null : normalizeScore(input.score),
      input.hardGatePassed === undefined ? null : input.hardGatePassed === true,
      input.gateResults === undefined ? null : JSON.stringify(sanitizeRecord(input.gateResults)),
      input.failureEvidence === undefined ? null : JSON.stringify(sanitizeArray(input.failureEvidence)),
      input.reviewId === undefined ? null : input.reviewId,
      input.candidateId === undefined ? null : input.candidateId,
      input.metadata === undefined ? null : JSON.stringify(sanitizeRecord(input.metadata)),
    ]);
    return result.rows[0] ? normalizeEvalRun(result.rows[0]) : null;
  });
}

export async function getAgentEvalRun(id: string): Promise<AgentEvalRunRecord | null> {
  return withPostgresClient(async (client) => {
    const result = await client.query("SELECT * FROM agent_eval_runs WHERE id = $1", [id]);
    return result.rows[0] ? normalizeEvalRun(result.rows[0]) : null;
  });
}

export async function listAgentEvalRuns(input: {
  limit?: number;
  mode?: AgentEvalRunMode;
  status?: AgentEvalRunStatus;
  fixtureId?: string;
} = {}): Promise<AgentEvalRunRecord[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (input.mode) { params.push(normalizeEvalRunMode(input.mode)); where.push(`mode = $${params.length}`); }
  if (input.status) { params.push(normalizeEvalRunStatus(input.status)); where.push(`status = $${params.length}`); }
  if (input.fixtureId) { params.push(bounded(input.fixtureId)); where.push(`fixture_id = $${params.length}`); }
  params.push(Math.max(1, Math.min(100, Math.floor(input.limit || 50))));
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return withPostgresClient(async (client) => {
    const result = await client.query(`SELECT * FROM agent_eval_runs ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`, params);
    return result.rows.map(normalizeEvalRun);
  });
}

export async function persistAgentEvalLayerResults(
  evalRunId: string,
  results: AgentEvalLayerResult[],
): Promise<void> {
  if (!evalRunId.trim()) throw new Error("Eval Run id is required");
  await withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      for (const result of results) {
        await client.query(`
          INSERT INTO agent_eval_layer_results (
            eval_run_id, layer, passed, deterministic, score, failures_json, evidence_json
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
          ON CONFLICT (eval_run_id, layer) DO UPDATE SET
            passed = EXCLUDED.passed,
            deterministic = EXCLUDED.deterministic,
            score = EXCLUDED.score,
            failures_json = EXCLUDED.failures_json,
            evidence_json = EXCLUDED.evidence_json
        `, [
          evalRunId,
          result.layer,
          result.passed === true,
          result.deterministic !== false,
          normalizeScore(result.score),
          JSON.stringify(sanitizeArray(result.failures)),
          JSON.stringify(sanitizeRecord(result.evidence || {})),
        ]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function listAgentEvalLayerResults(evalRunId: string): Promise<AgentEvalLayerResult[]> {
  if (!evalRunId.trim()) return [];
  return withPostgresClient(async (client) => {
    const result = await client.query(`
      SELECT layer, passed, deterministic, score, failures_json, evidence_json
      FROM agent_eval_layer_results
      WHERE eval_run_id = $1
      ORDER BY layer
    `, [evalRunId]);
    return result.rows.map((row: Record<string, unknown>) => ({
      layer: String(row.layer) as AgentEvalLayer,
      passed: row.passed === true,
      deterministic: row.deterministic !== false,
      score: normalizeScore(row.score),
      failures: sanitizeArray(row.failures_json).map(String),
      evidence: sanitizeRecord(row.evidence_json),
    }));
  });
}

export function normalizeEvalRun(row: Record<string, unknown>): AgentEvalRunRecord {
  return {
    id: String(row.id || ""),
    created_by_user_id: row.created_by_user_id ? String(row.created_by_user_id) : null,
    mode: normalizeEvalRunMode(row.mode),
    status: normalizeEvalRunStatus(row.status),
    code_commit: bounded(row.code_commit),
    model_version: bounded(row.model_version),
    prompt_version: bounded(row.prompt_version),
    tool_version: bounded(row.tool_version),
    fixture_id: bounded(row.fixture_id),
    fixture_version: bounded(row.fixture_version),
    graph_version: bounded(row.graph_version),
    judge_version: bounded(row.judge_version),
    score: normalizeScore(row.score),
    hard_gate_passed: row.hard_gate_passed === true,
    gate_results_json: sanitizeRecord(row.gate_results_json),
    failure_evidence_json: sanitizeArray(row.failure_evidence_json),
    review_id: row.review_id === null || row.review_id === undefined ? null : Number(row.review_id),
    candidate_id: row.candidate_id === null || row.candidate_id === undefined ? null : Number(row.candidate_id),
    metadata_json: sanitizeRecord(row.metadata_json),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function sanitizeRecord(value: unknown): Record<string, unknown> {
  const safe = sanitizeEvalValue(value, 0);
  return safe && typeof safe === "object" && !Array.isArray(safe) ? safe as Record<string, unknown> : {};
}

function sanitizeArray(value: unknown): unknown[] {
  const safe = sanitizeEvalValue(value, 0);
  return Array.isArray(safe) ? safe.slice(0, 50) : [];
}

function sanitizeEvalValue(value: unknown, depth: number): unknown {
  if (depth > 4 || value === null || value === undefined) return value;
  if (typeof value === "string") return redactReviewText(value, 400);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeEvalValue(item, depth + 1));
  if (typeof value !== "object") return redactReviewText(value, 120);
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 60)) {
    if (/(prompt|system|chain|thought|internal|raw|stack|trace|token|credential|authorization|password|base64|image)/i.test(key)) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = sanitizeEvalValue(item, depth + 1);
  }
  return output;
}

function normalizeScore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(1, score));
}

function bounded(value: unknown, max = 240): string {
  return redactReviewText(value || "", max);
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value || "");
}
