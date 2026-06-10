import { randomUUID } from "crypto";
import { getDatabaseDriver, isPostgresConfigured, withPostgresClient } from "@/lib/postgres";

export type AgentRunStatus =
  | "planned"
  | "running"
  | "waiting_user"
  | "verifying"
  | "repairing"
  | "succeeded"
  | "failed"
  | "rolled_back"
  | "cancelled";

export interface AgentRunRecord {
  id: string;
  user_id: string;
  session_id: number | null;
  task_type: string;
  agent_id: string;
  status: AgentRunStatus;
  contract_json: unknown;
  result_json: unknown;
  error_json: unknown;
  created_at: string;
  updated_at: string;
}

export interface AgentRunStepRecord {
  id: number;
  run_id: string;
  phase: string;
  tool_name: string;
  status: string;
  input_summary: string;
  output_summary: string;
  verifier_json: unknown;
  error_json: unknown;
  created_at: string;
}

export interface AgentRunDebugRecord extends AgentRunRecord {
  recent_steps: AgentRunStepRecord[];
}

export interface CreateAgentRunInput {
  userId: string;
  sessionId?: number | null;
  taskType: string;
  agentId?: string;
  contract?: unknown;
}

export interface AppendAgentRunStepInput {
  runId: string;
  phase: string;
  toolName?: string;
  status?: string;
  inputSummary?: string;
  outputSummary?: string;
  verifier?: unknown;
  error?: unknown;
}

const ACTIVE_STATUSES: AgentRunStatus[] = ["planned", "running", "waiting_user", "verifying", "repairing"];

export function isAgentRunLedgerAvailable(): boolean {
  return getDatabaseDriver() === "postgres" && isPostgresConfigured();
}

export async function createAgentRun(input: CreateAgentRunInput): Promise<AgentRunRecord> {
  assertLedgerAvailable();
  const id = randomUUID();
  return withPostgresClient(async (client) => {
    const result = await client.query(`
      INSERT INTO agent_runs (id, user_id, session_id, task_type, agent_id, status, contract_json)
      VALUES ($1, $2, $3, $4, $5, 'planned', $6::jsonb)
      RETURNING *
    `, [
      id,
      input.userId,
      input.sessionId ?? null,
      input.taskType,
      input.agentId || "",
      jsonParam(input.contract || {}),
    ]);
    return normalizeRun(result.rows[0]);
  });
}

export async function updateAgentRunStatus(
  runId: string,
  status: AgentRunStatus,
  patch: { result?: unknown; error?: unknown } = {},
): Promise<AgentRunRecord | null> {
  assertLedgerAvailable();
  return withPostgresClient(async (client) => {
    const result = await client.query(`
      UPDATE agent_runs
      SET status = $2,
          result_json = COALESCE($3::jsonb, result_json),
          error_json = COALESCE($4::jsonb, error_json),
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `, [
      runId,
      status,
      patch.result === undefined ? null : jsonParam(patch.result),
      patch.error === undefined ? null : jsonParam(patch.error),
    ]);
    return result.rows[0] ? normalizeRun(result.rows[0]) : null;
  });
}

export async function appendAgentRunStep(input: AppendAgentRunStepInput): Promise<AgentRunStepRecord> {
  assertLedgerAvailable();
  return withPostgresClient(async (client) => {
    const result = await client.query(`
      INSERT INTO agent_run_steps
        (run_id, phase, tool_name, status, input_summary, output_summary, verifier_json, error_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
      RETURNING *
    `, [
      input.runId,
      input.phase,
      input.toolName || "",
      input.status || "running",
      input.inputSummary || "",
      input.outputSummary || "",
      jsonParam(input.verifier || {}),
      jsonParam(input.error || {}),
    ]);
    await client.query("UPDATE agent_runs SET updated_at = now() WHERE id = $1", [input.runId]);
    return normalizeStep(result.rows[0]);
  });
}

export async function getAgentRun(runId: string, userId: string): Promise<AgentRunRecord | null> {
  assertLedgerAvailable();
  return withPostgresClient(async (client) => {
    const result = await client.query("SELECT * FROM agent_runs WHERE id = $1 AND user_id = $2", [runId, userId]);
    return result.rows[0] ? normalizeRun(result.rows[0]) : null;
  });
}

export async function listActiveAgentRuns(userId: string, sessionId?: number): Promise<AgentRunRecord[]> {
  assertLedgerAvailable();
  return withPostgresClient(async (client) => {
    const params: unknown[] = [userId, ACTIVE_STATUSES];
    let sql = "SELECT * FROM agent_runs WHERE user_id = $1 AND status = ANY($2)";
    if (sessionId !== undefined) {
      params.push(sessionId);
      sql += ` AND session_id = $${params.length}`;
    }
    sql += " ORDER BY updated_at DESC LIMIT 20";
    const result = await client.query(sql, params);
    return result.rows.map(normalizeRun);
  });
}

export async function cancelAgentRun(runId: string, userId: string): Promise<boolean> {
  assertLedgerAvailable();
  return withPostgresClient(async (client) => Boolean((await client.query(`
    UPDATE agent_runs
    SET status = 'cancelled', updated_at = now()
    WHERE id = $1 AND user_id = $2 AND status = ANY($3)
  `, [runId, userId, ACTIVE_STATUSES])).rowCount));
}

export async function listAgentRunSteps(runId: string): Promise<AgentRunStepRecord[]> {
  assertLedgerAvailable();
  return withPostgresClient(async (client) => {
    const result = await client.query("SELECT * FROM agent_run_steps WHERE run_id = $1 ORDER BY created_at ASC", [runId]);
    return result.rows.map(normalizeStep);
  });
}

export async function listRecentFailedAgentRuns(limit = 50): Promise<AgentRunDebugRecord[]> {
  assertLedgerAvailable();
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  return withPostgresClient(async (client) => {
    const runResult = await client.query(`
      SELECT *
      FROM agent_runs
      WHERE status = ANY($1)
      ORDER BY updated_at DESC
      LIMIT $2
    `, [["failed", "rolled_back"], safeLimit]);
    const runs = runResult.rows.map(normalizeRun);
    if (runs.length === 0) return [];

    const ids = runs.map((run) => run.id);
    const stepResult = await client.query(`
      SELECT *
      FROM agent_run_steps
      WHERE run_id = ANY($1)
      ORDER BY created_at DESC
    `, [ids]);
    const stepsByRun = new Map<string, AgentRunStepRecord[]>();
    for (const row of stepResult.rows.map(normalizeStep)) {
      const existing = stepsByRun.get(row.run_id) || [];
      if (existing.length < 6) existing.push(row);
      stepsByRun.set(row.run_id, existing);
    }

    return runs.map((run) => ({
      ...run,
      recent_steps: stepsByRun.get(run.id) || [],
    }));
  });
}

function assertLedgerAvailable(): void {
  if (!isAgentRunLedgerAvailable()) {
    throw new Error("Agent run ledger requires DB_DRIVER=postgres and DATABASE_URL.");
  }
}

function jsonParam(value: unknown): string {
  return JSON.stringify(value ?? {});
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
    run_id: String(row.run_id),
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

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value ? String(value) : "";
}
