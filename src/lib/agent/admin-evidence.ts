import { withPostgresClient } from "@/lib/postgres";
import { projectDurableUiEvent } from "@/lib/agent/runtime/run-event-projection";
import { redactReviewText, sanitizeReviewJson } from "@/lib/agent/run-review";

export interface AgentEvidenceEvent {
  sequence: number;
  type: string;
  schemaVersion: number;
  evidence: Record<string, unknown>;
  userSafeView: Record<string, unknown> | null;
  createdAt: string;
}

export interface AgentEvidenceView {
  run: {
    id: string;
    userId: string;
    sessionId: number | null;
    taskType: string;
    agentId: string;
    status: string;
    contract: unknown;
    createdAt: string;
    updatedAt: string;
  };
  events: AgentEvidenceEvent[];
  checkpoints: Array<{
    id: number;
    boundary: string;
    snapshotVersion: number;
    factRefs: unknown[];
    context: unknown;
    createdAt: string;
  }>;
  gates: Array<{
    id: string;
    toolName: string;
    risk: string;
    scopeHash: string;
    status: string;
    request: unknown;
    response: unknown;
    createdAt: string;
    resolvedAt: string | null;
  }>;
  toolAttempts: Array<{
    id: string;
    sequence: number;
    toolName: string;
    risk: string;
    status: string;
    effectState: string;
    argsHash: string;
    capability: unknown;
    verifier: unknown;
    error: unknown;
    createdAt: string;
    completedAt: string | null;
  }>;
  review: unknown | null;
  evalCandidate: unknown | null;
}

export async function getAgentEvidenceView(runId: string): Promise<AgentEvidenceView | null> {
  if (!runId.trim()) return null;
  return withPostgresClient(async (client) => {
    const runResult = await client.query("SELECT * FROM agent_runs WHERE id = $1", [runId]);
    const run = runResult.rows[0] as Record<string, unknown> | undefined;
    if (!run) return null;
    const [eventsResult, checkpointsResult, gatesResult, attemptsResult, reviewResult, candidateResult] = await Promise.all([
      client.query("SELECT * FROM agent_run_events WHERE run_id = $1 ORDER BY sequence ASC", [runId]),
      client.query("SELECT * FROM agent_run_checkpoints WHERE run_id = $1 ORDER BY snapshot_version ASC, id ASC", [runId]),
      client.query("SELECT * FROM agent_run_gates WHERE run_id = $1 ORDER BY created_at ASC", [runId]),
      client.query("SELECT * FROM agent_tool_attempts WHERE run_id = $1 ORDER BY attempt_sequence ASC", [runId]),
      client.query("SELECT * FROM agent_run_reviews WHERE run_id = $1 ORDER BY reviewed_at DESC LIMIT 1", [runId]),
      client.query("SELECT * FROM agent_eval_candidates WHERE run_id = $1 ORDER BY updated_at DESC LIMIT 1", [runId]),
    ]);
    return {
      run: {
        id: String(run.id),
        userId: String(run.user_id),
        sessionId: run.session_id === null || run.session_id === undefined ? null : Number(run.session_id),
        taskType: String(run.task_type || ""),
        agentId: String(run.agent_id || ""),
        status: String(run.status || ""),
        contract: sanitizeReviewJson(run.contract_json || {}),
        createdAt: toIso(run.created_at),
        updatedAt: toIso(run.updated_at),
      },
      events: eventsResult.rows.map(normalizeEvidenceEvent),
      checkpoints: checkpointsResult.rows.map((row) => ({
        id: Number(row.id),
        boundary: redactReviewText(row.boundary, 100),
        snapshotVersion: Number(row.snapshot_version || 0),
        factRefs: sanitizeArray(row.fact_refs_json),
        context: sanitizeReviewJson(row.context_json || {}),
        createdAt: toIso(row.created_at),
      })),
      gates: gatesResult.rows.map((row) => ({
        id: String(row.id),
        toolName: redactReviewText(row.tool_name, 100),
        risk: redactReviewText(row.risk, 40),
        scopeHash: redactReviewText(row.scope_hash, 120),
        status: redactReviewText(row.status, 40),
        request: sanitizeReviewJson(row.request_json || {}),
        response: sanitizeReviewJson(row.response_json || {}),
        createdAt: toIso(row.created_at),
        resolvedAt: row.resolved_at ? toIso(row.resolved_at) : null,
      })),
      toolAttempts: attemptsResult.rows.map((row) => ({
        id: String(row.id),
        sequence: Number(row.attempt_sequence || 0),
        toolName: redactReviewText(row.tool_name, 100),
        risk: redactReviewText(row.risk, 40),
        status: redactReviewText(row.status, 40),
        effectState: redactReviewText(row.effect_state, 40),
        argsHash: redactReviewText(row.args_hash, 120),
        capability: sanitizeReviewJson(row.capability_json || {}),
        verifier: sanitizeReviewJson(row.verifier_json || {}),
        error: sanitizeReviewJson(row.error_json || {}),
        createdAt: toIso(row.created_at),
        completedAt: row.completed_at ? toIso(row.completed_at) : null,
      })),
      review: reviewResult.rows[0] ? sanitizeReviewJson(reviewResult.rows[0]) : null,
      evalCandidate: candidateResult.rows[0] ? sanitizeReviewJson(candidateResult.rows[0]) : null,
    };
  });
}

function normalizeEvidenceEvent(row: Record<string, unknown>): AgentEvidenceEvent {
  const evidence = sanitizeRecord(row.payload_json);
  const rawEvent = evidence.event && typeof evidence.event === "object" && !Array.isArray(evidence.event)
    ? evidence.event as Record<string, unknown>
    : null;
  const userSafeView = rawEvent
    ? sanitizeRecord(projectDurableUiEvent(rawEvent as Record<string, unknown> & { type: string }))
    : null;
  return {
    sequence: Number(row.sequence || 0),
    type: String(row.event_type || ""),
    schemaVersion: Number(row.schema_version || 1),
    evidence,
    userSafeView,
    createdAt: toIso(row.created_at),
  };
}

function sanitizeRecord(value: unknown): Record<string, unknown> {
  const safe = sanitizeReviewJson(value);
  return safe && typeof safe === "object" && !Array.isArray(safe) ? safe as Record<string, unknown> : {};
}

function sanitizeArray(value: unknown): unknown[] {
  const safe = sanitizeReviewJson(value);
  return Array.isArray(safe) ? safe.slice(0, 100) : [];
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value || "");
}
