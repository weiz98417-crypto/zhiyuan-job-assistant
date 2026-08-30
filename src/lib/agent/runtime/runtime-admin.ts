import type { PoolClient } from "pg";
import { withPostgresClient } from "@/lib/postgres";

export interface RuntimeAdminPrincipal {
  userId: string;
}

export type RuntimeAdminAction =
  | "pause_claims"
  | "resume_claims"
  | "isolate_run"
  | "cancel_run"
  | "retry_dead_letter"
  | "resolve_reconciliation";

export interface RuntimeAdminCommand {
  requestId: string;
  action: RuntimeAdminAction;
  reason?: string;
  runId?: string;
  outboxId?: number;
  attemptId?: string;
  resolution?: "verified" | "not_executed" | "manual_failed";
}

export interface RuntimeAdminStatus {
  claimsPaused: boolean;
  pauseReason: string;
  controlUpdatedAt: string | null;
  runsByStatus: Record<string, number>;
  backgroundJobsByStatus: Record<string, number>;
  recentRuns: RuntimeAdminRun[];
  recentEvents: RuntimeAdminEvent[];
  recentCheckpoints: RuntimeAdminCheckpoint[];
  deadLetters: RuntimeAdminDeadLetter[];
  reconciliations: RuntimeAdminReconciliation[];
  backgroundJobs: RuntimeAdminBackgroundJob[];
  deadLetterCount: number;
  reconciliationCount: number;
  staleLeaseCount: number;
  activeLeaseCount: number;
}

export interface RuntimeAdminRun {
  id: string;
  userId: string;
  sessionId: number | null;
  taskType: string;
  agentId: string;
  status: string;
  runtimeMode: string;
  snapshotVersion: number;
  eventSequence: number;
  ownerId: string | null;
  leaseExpiresAt: string | null;
  heartbeatAt: string | null;
  fencingToken: number;
  wakeAt: string | null;
  isolationReason: string;
  lastObservation: Record<string, unknown>;
  error: Record<string, unknown>;
  leaseStale: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeAdminEvent {
  id: number;
  runId: string;
  userId: string;
  sequence: number;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface RuntimeAdminCheckpoint {
  id: number;
  runId: string;
  userId: string;
  snapshotVersion: number;
  fencingToken: number;
  boundary: string;
  budgets: Record<string, unknown>;
  createdAt: string;
}

export interface RuntimeAdminDeadLetter {
  id: number;
  runId: string;
  userId: string;
  eventSequence: number;
  topic: string;
  attemptCount: number;
  lastError: string;
  deadLetteredAt: string | null;
  createdAt: string;
}

export interface RuntimeAdminReconciliation {
  id: string;
  runId: string;
  userId: string;
  toolName: string;
  status: string;
  effectState: string;
  input: Record<string, unknown>;
  verifier: Record<string, unknown>;
  error: Record<string, unknown>;
  updatedAt: string;
}

export interface RuntimeAdminBackgroundJob {
  id: string;
  runId: string;
  toolAttemptId: string | null;
  userId: string;
  jobType: string;
  status: string;
  progress: Record<string, unknown>;
  error: Record<string, unknown>;
  ownerId: string | null;
  leaseExpiresAt: string | null;
  fencingToken: number;
  updatedAt: string;
}

type WithClient = <T>(fn: (client: PoolClient) => Promise<T>) => Promise<T>;

export class AgentRuntimeAdminService {
  constructor(private readonly withClient: WithClient = withPostgresClient) {}

  async getStatus(): Promise<RuntimeAdminStatus> {
    return this.withClient(async (client) => {
      const [
        control,
        runCounts,
        recentRuns,
        recentEvents,
        recentCheckpoints,
        deadLetters,
        reconciliations,
        backgroundJobCounts,
        backgroundJobs,
        leaseHealth,
      ] = await Promise.all([
        client.query("SELECT * FROM agent_runtime_controls WHERE id = 'global'"),
        client.query(`
          SELECT status, COUNT(*)::int AS count
          FROM agent_runs
          WHERE legacy = FALSE
          GROUP BY status
        `),
        client.query(`
          SELECT id, user_id, session_id, task_type, agent_id, status, runtime_mode,
                 snapshot_version, event_sequence, owner_id, lease_expires_at,
                 heartbeat_at, fencing_token, wake_at, isolation_reason,
                 last_observation_json, error_json, created_at, updated_at
          FROM agent_runs
          WHERE legacy = FALSE
          ORDER BY updated_at DESC
          LIMIT 50
        `),
        client.query(`
          SELECT id, run_id, user_id, sequence, event_type, payload_json, created_at
          FROM agent_run_events
          ORDER BY created_at DESC, id DESC
          LIMIT 100
        `),
        client.query(`
          SELECT id, run_id, user_id, snapshot_version, fencing_token, boundary,
                 budgets_json, created_at
          FROM agent_run_checkpoints
          ORDER BY created_at DESC, id DESC
          LIMIT 50
        `),
        client.query(`
          SELECT id, run_id, user_id, event_sequence, topic, attempt_count,
                 last_error, dead_lettered_at, created_at
          FROM agent_run_outbox
          WHERE status = 'dead_letter'
          ORDER BY dead_lettered_at DESC NULLS LAST, id DESC
          LIMIT 50
        `),
        client.query(`
          SELECT id, run_id, user_id, tool_name, status, effect_state,
                 input_json, verifier_json, error_json, updated_at
          FROM agent_tool_attempts
          WHERE status = 'reconciling' OR effect_state = 'unknown'
          ORDER BY updated_at DESC
          LIMIT 50
        `),
        client.query(`
          SELECT status, COUNT(*)::int AS count
          FROM agent_background_jobs
          GROUP BY status
        `),
        client.query(`
          SELECT id, run_id, tool_attempt_id, user_id, job_type, status,
                 progress_json, error_json, owner_id, lease_expires_at,
                 fencing_token, updated_at
          FROM agent_background_jobs
          ORDER BY updated_at DESC
          LIMIT 50
        `),
        client.query(`
          SELECT
            COUNT(*) FILTER (
              WHERE owner_id IS NOT NULL
                AND lease_expires_at IS NOT NULL
                AND lease_expires_at <= now()
                AND status IN ('running', 'recovering', 'verifying', 'cancel_requested')
            )::int AS stale_lease_count,
            COUNT(*) FILTER (
              WHERE owner_id IS NOT NULL
                AND lease_expires_at IS NOT NULL
                AND lease_expires_at > now()
                AND status IN ('running', 'recovering', 'verifying', 'cancel_requested')
            )::int AS active_lease_count
          FROM agent_runs
          WHERE legacy = FALSE
        `),
      ]);
      const runRows = recentRuns.rows.map((row) => mapRun(row));
      const deadLetterRows = deadLetters.rows.map((row) => mapDeadLetter(row));
      const reconciliationRows = reconciliations.rows.map((row) => mapReconciliation(row));
      return {
        claimsPaused: control.rows[0]?.claims_paused === true,
        pauseReason: String(control.rows[0]?.pause_reason || ""),
        controlUpdatedAt: nullableDate(control.rows[0]?.updated_at),
        runsByStatus: countMap(runCounts.rows),
        backgroundJobsByStatus: countMap(backgroundJobCounts.rows),
        recentRuns: runRows,
        recentEvents: recentEvents.rows.map((row) => ({
          id: Number(row.id),
          runId: String(row.run_id),
          userId: String(row.user_id),
          sequence: Number(row.sequence),
          eventType: String(row.event_type),
          payload: objectRecord(row.payload_json),
          createdAt: dateString(row.created_at),
        })),
        recentCheckpoints: recentCheckpoints.rows.map((row) => ({
          id: Number(row.id),
          runId: String(row.run_id),
          userId: String(row.user_id),
          snapshotVersion: Number(row.snapshot_version),
          fencingToken: Number(row.fencing_token),
          boundary: String(row.boundary),
          budgets: objectRecord(row.budgets_json),
          createdAt: dateString(row.created_at),
        })),
        deadLetters: deadLetterRows,
        reconciliations: reconciliationRows,
        backgroundJobs: backgroundJobs.rows.map((row) => ({
          id: String(row.id),
          runId: String(row.run_id),
          toolAttemptId: nullableString(row.tool_attempt_id),
          userId: String(row.user_id),
          jobType: String(row.job_type),
          status: String(row.status),
          progress: objectRecord(row.progress_json),
          error: objectRecord(row.error_json),
          ownerId: nullableString(row.owner_id),
          leaseExpiresAt: nullableDate(row.lease_expires_at),
          fencingToken: Number(row.fencing_token),
          updatedAt: dateString(row.updated_at),
        })),
        deadLetterCount: deadLetterRows.length,
        reconciliationCount: reconciliationRows.length,
        staleLeaseCount: Number(leaseHealth.rows[0]?.stale_lease_count || 0),
        activeLeaseCount: Number(leaseHealth.rows[0]?.active_lease_count || 0),
      };
    });
  }

  async execute(
    principal: RuntimeAdminPrincipal,
    command: RuntimeAdminCommand,
  ): Promise<Record<string, unknown>> {
    if (!command.requestId.trim()) throw new Error("Admin command requestId is required");
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const existing = await client.query(`
          SELECT payload_json
          FROM agent_runtime_admin_events
          WHERE actor_user_id = $1 AND request_id = $2
        `, [principal.userId, command.requestId]);
        if (existing.rows[0]) {
          await client.query("COMMIT");
          return objectRecord(existing.rows[0].payload_json);
        }

        const result = await this.applyCommand(client, principal, command);
        await client.query(`
          INSERT INTO agent_runtime_admin_events (
            actor_user_id, action, target_type, target_id, request_id, payload_json
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        `, [
          principal.userId,
          command.action,
          targetType(command),
          targetId(command),
          command.requestId,
          JSON.stringify(result),
        ]);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  private async applyCommand(
    client: PoolClient,
    principal: RuntimeAdminPrincipal,
    command: RuntimeAdminCommand,
  ): Promise<Record<string, unknown>> {
    if (command.action === "pause_claims" || command.action === "resume_claims") {
      const claimsPaused = command.action === "pause_claims";
      await client.query(`
        UPDATE agent_runtime_controls
        SET claims_paused = $1, pause_reason = $2, updated_by = $3, updated_at = now()
        WHERE id = 'global'
      `, [claimsPaused, claimsPaused ? String(command.reason || "admin pause") : "", principal.userId]);
      return { action: command.action, claimsPaused };
    }

    if (command.action === "isolate_run") {
      if (!command.runId) throw new Error("runId is required");
      const updated = await client.query(`
        UPDATE agent_runs
        SET isolation_requested_at = now(),
            isolation_reason = $2,
            snapshot_version = snapshot_version + 1,
            event_sequence = event_sequence + 1,
            updated_at = now()
        WHERE id = $1 AND legacy = FALSE
        RETURNING *
      `, [command.runId, String(command.reason || "admin isolation")]);
      if (!updated.rows[0]) throw new Error("Agent Run not found");
      await appendAdminRunEvent(client, updated.rows[0], "run.isolation_requested", {
        reason: String(command.reason || "admin isolation"),
      });
      return { action: command.action, runId: command.runId, isolated: true };
    }

    if (command.action === "cancel_run") {
      if (!command.runId) throw new Error("runId is required");
      const updated = await client.query(`
        WITH RECURSIVE target_runs AS (
          SELECT id FROM agent_runs WHERE id = $1 AND legacy = FALSE
          UNION ALL
          SELECT child.id
          FROM agent_runs child
          JOIN target_runs parent ON child.parent_run_id = parent.id
        )
        UPDATE agent_runs
        SET status = 'cancel_requested',
            cancel_requested_at = now(),
            wake_at = now(),
            snapshot_version = snapshot_version + 1,
            event_sequence = event_sequence + 1,
            updated_at = now()
        WHERE id IN (SELECT id FROM target_runs)
          AND status IN ('queued', 'running', 'waiting_user', 'recovering', 'verifying')
        RETURNING *
      `, [command.runId]);
      if (updated.rows.length === 0) throw new Error("Agent Run not found or terminal");
      for (const run of updated.rows) {
        await appendAdminRunEvent(client, run, "run.cancel_requested", { admin: true });
        await client.query("SELECT pg_notify('agent_run_available', $1)", [run.id]);
      }
      return { action: command.action, runId: command.runId, affectedRuns: updated.rows.length };
    }

    if (command.action === "retry_dead_letter") {
      if (!Number.isFinite(command.outboxId)) throw new Error("outboxId is required");
      const updated = await client.query(`
        UPDATE agent_run_outbox
        SET status = 'pending', attempt_count = 0, next_attempt_at = now(),
            locked_by = NULL, locked_at = NULL, last_error = '', dead_lettered_at = NULL
        WHERE id = $1 AND status = 'dead_letter'
        RETURNING id
      `, [command.outboxId]);
      if (!updated.rows[0]) throw new Error("Dead-letter item not found");
      return { action: command.action, outboxId: Number(command.outboxId), retried: true };
    }

    if (command.action === "resolve_reconciliation") {
      if (!command.attemptId || !command.resolution) throw new Error("attemptId and resolution are required");
      const patch = reconciliationPatch(command.resolution);
      const updated = await client.query(`
        UPDATE agent_tool_attempts
        SET status = $2, effect_state = $3,
            verifier_json = verifier_json || $4::jsonb,
            completed_at = now(), updated_at = now()
        WHERE id = $1 AND (status = 'reconciling' OR effect_state = 'unknown')
        RETURNING id, run_id
      `, [command.attemptId, patch.status, patch.effectState, JSON.stringify({ manualResolution: command.resolution })]);
      if (!updated.rows[0]) throw new Error("Reconciliation item not found");
      const runUpdate = await client.query(`
        UPDATE agent_runs
        SET status = CASE WHEN status IN ('waiting_user', 'recovering') THEN 'queued' ELSE status END,
            wake_at = now(), snapshot_version = snapshot_version + 1,
            event_sequence = event_sequence + 1, updated_at = now()
        WHERE id = $1 AND status NOT IN ('succeeded', 'failed', 'cancelled')
        RETURNING *
      `, [updated.rows[0].run_id]);
      if (runUpdate.rows[0]) {
        await appendAdminRunEvent(client, runUpdate.rows[0], "run.reconciliation_resolved", {
          attemptId: command.attemptId,
          resolution: command.resolution,
        });
        await client.query("SELECT pg_notify('agent_run_available', $1)", [updated.rows[0].run_id]);
      }
      return {
        action: command.action,
        attemptId: command.attemptId,
        runId: String(updated.rows[0].run_id),
        resolution: command.resolution,
      };
    }

    throw new Error("Unsupported Agent Runtime Admin action");
  }
}

let service: AgentRuntimeAdminService | null = null;

export function getAgentRuntimeAdminService(): AgentRuntimeAdminService {
  if (!service) service = new AgentRuntimeAdminService();
  return service;
}

async function appendAdminRunEvent(
  client: PoolClient,
  run: Record<string, unknown>,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const eventPayload = JSON.stringify(payload);
  await client.query(`
    INSERT INTO agent_run_events (run_id, user_id, sequence, event_type, schema_version, payload_json)
    VALUES ($1, $2, $3, $4, 1, $5::jsonb)
  `, [run.id, run.user_id, run.event_sequence, type, eventPayload]);
  await client.query(`
    INSERT INTO agent_run_outbox (run_id, user_id, event_sequence, topic, schema_version, payload_json)
    VALUES ($1, $2, $3, 'run_event', 1, $4::jsonb)
  `, [run.id, run.user_id, run.event_sequence, JSON.stringify({ type, ...payload })]);
}

function reconciliationPatch(resolution: NonNullable<RuntimeAdminCommand["resolution"]>) {
  if (resolution === "verified") return { status: "succeeded", effectState: "verified" };
  if (resolution === "not_executed") return { status: "failed", effectState: "not_executed" };
  return { status: "failed", effectState: "unknown" };
}

function targetType(command: RuntimeAdminCommand): string {
  if (command.runId) return "run";
  if (command.attemptId) return "tool_attempt";
  if (command.outboxId !== undefined) return "outbox";
  return "runtime";
}

function targetId(command: RuntimeAdminCommand): string {
  return command.runId || command.attemptId || String(command.outboxId ?? "global");
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mapRun(row: Record<string, unknown>): RuntimeAdminRun {
  const leaseExpiresAt = nullableDate(row.lease_expires_at);
  return {
    id: String(row.id),
    userId: String(row.user_id),
    sessionId: row.session_id === null || row.session_id === undefined ? null : Number(row.session_id),
    taskType: String(row.task_type),
    agentId: String(row.agent_id || ""),
    status: String(row.status),
    runtimeMode: String(row.runtime_mode),
    snapshotVersion: Number(row.snapshot_version),
    eventSequence: Number(row.event_sequence),
    ownerId: nullableString(row.owner_id),
    leaseExpiresAt,
    heartbeatAt: nullableDate(row.heartbeat_at),
    fencingToken: Number(row.fencing_token),
    wakeAt: nullableDate(row.wake_at),
    isolationReason: String(row.isolation_reason || ""),
    lastObservation: objectRecord(row.last_observation_json),
    error: objectRecord(row.error_json),
    leaseStale: Boolean(leaseExpiresAt) && Date.parse(leaseExpiresAt!) <= Date.now(),
    createdAt: dateString(row.created_at),
    updatedAt: dateString(row.updated_at),
  };
}

function mapDeadLetter(row: Record<string, unknown>): RuntimeAdminDeadLetter {
  return {
    id: Number(row.id),
    runId: String(row.run_id),
    userId: String(row.user_id),
    eventSequence: Number(row.event_sequence),
    topic: String(row.topic),
    attemptCount: Number(row.attempt_count),
    lastError: String(row.last_error || ""),
    deadLetteredAt: nullableDate(row.dead_lettered_at),
    createdAt: dateString(row.created_at),
  };
}

function mapReconciliation(row: Record<string, unknown>): RuntimeAdminReconciliation {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    userId: String(row.user_id),
    toolName: String(row.tool_name),
    status: String(row.status),
    effectState: String(row.effect_state),
    input: objectRecord(row.input_json),
    verifier: objectRecord(row.verifier_json),
    error: objectRecord(row.error_json),
    updatedAt: dateString(row.updated_at),
  };
}

function countMap(rows: Array<Record<string, unknown>>): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [String(row.status), Number(row.count)]));
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function nullableDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return dateString(value);
}

function dateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
