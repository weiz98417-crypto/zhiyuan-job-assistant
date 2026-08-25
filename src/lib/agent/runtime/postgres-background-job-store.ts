import type { PoolClient } from "pg";
import { withPostgresClient } from "@/lib/postgres";
import type {
  AgentBackgroundJobSnapshot,
  AgentBackgroundJobStore,
  ClaimAgentBackgroundJobCommand,
  CompleteAgentBackgroundJobCommand,
  CreateAgentBackgroundJobCommand,
  FailAgentBackgroundJobCommand,
  HeartbeatAgentBackgroundJobCommand,
} from "@/lib/agent/runtime/agent-background-job";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";

type WithClient = <T>(fn: (client: PoolClient) => Promise<T>) => Promise<T>;

export class PostgresAgentBackgroundJobStore implements AgentBackgroundJobStore {
  constructor(private readonly withClient: WithClient = withPostgresClient) {}

  async create(
    principal: ExecutionPrincipal,
    command: CreateAgentBackgroundJobCommand,
  ): Promise<AgentBackgroundJobSnapshot> {
    return this.withClient(async (client) => {
      const inserted = await client.query(`
        INSERT INTO agent_background_jobs (
          id, run_id, tool_attempt_id, user_id, job_type, handle_json, wake_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
        ON CONFLICT (id) DO NOTHING
        RETURNING *
      `, [
        command.id,
        command.runId,
        command.toolAttemptId || null,
        principal.userId,
        command.jobType,
        json(command.handle || {}),
        command.wakeAt || new Date(),
      ]);
      if (inserted.rows[0]) return normalizeJob(inserted.rows[0]);
      const existing = await client.query(
        "SELECT * FROM agent_background_jobs WHERE id = $1 AND user_id = $2",
        [command.id, principal.userId],
      );
      if (!existing.rows[0]) throw new Error("Background job access denied");
      return normalizeJob(existing.rows[0]);
    });
  }

  async claimNext(command: ClaimAgentBackgroundJobCommand): Promise<AgentBackgroundJobSnapshot | null> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const now = command.now || new Date();
        const leaseMs = Math.max(1, command.leaseMs || 30_000);
        const candidate = await client.query(`
          SELECT id
          FROM agent_background_jobs
          WHERE wake_at <= $1
            AND (
              status IN ('queued', 'waiting')
              OR (status = 'running' AND lease_expires_at <= $1)
              OR (status = 'cancel_requested' AND owner_id IS NULL)
            )
          ORDER BY wake_at ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        `, [now]);
        if (!candidate.rows[0]) {
          await client.query("COMMIT");
          return null;
        }
        const updated = await client.query(`
          UPDATE agent_background_jobs
          SET status = CASE WHEN status = 'cancel_requested' THEN status ELSE 'running' END,
              owner_id = $2,
              fencing_token = fencing_token + 1,
              lease_expires_at = $3 + ($4 * interval '1 millisecond'),
              updated_at = $3
          WHERE id = $1
          RETURNING *
        `, [candidate.rows[0].id, command.workerId, now, leaseMs]);
        await client.query("COMMIT");
        return normalizeJob(updated.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async complete(command: CompleteAgentBackgroundJobCommand): Promise<AgentBackgroundJobSnapshot> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const updated = await client.query(`
          UPDATE agent_background_jobs
          SET status = 'succeeded', result_json = $4::jsonb, error_json = '{}'::jsonb,
              owner_id = NULL, lease_expires_at = NULL, completed_at = now(), updated_at = now()
          WHERE id = $1 AND owner_id = $2 AND fencing_token = $3
          RETURNING *
        `, [command.jobId, command.workerId, command.fencingToken, json(command.result)]);
        if (!updated.rows[0]) throw new Error("Background job fencing token mismatch");
        const job = normalizeJob(updated.rows[0]);
        await wakeRun(client, job.runId);
        await client.query("COMMIT");
        return job;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async fail(command: FailAgentBackgroundJobCommand): Promise<AgentBackgroundJobSnapshot> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const retrying = Boolean(command.retryAt);
        const updated = await client.query(`
          UPDATE agent_background_jobs
          SET status = $4, error_json = $5::jsonb,
              wake_at = COALESCE($6, wake_at), owner_id = NULL, lease_expires_at = NULL,
              completed_at = CASE WHEN $4 = 'failed' THEN now() ELSE NULL END,
              updated_at = now()
          WHERE id = $1 AND owner_id = $2 AND fencing_token = $3
          RETURNING *
        `, [
          command.jobId,
          command.workerId,
          command.fencingToken,
          retrying ? "waiting" : "failed",
          json(command.error),
          command.retryAt || null,
        ]);
        if (!updated.rows[0]) throw new Error("Background job fencing token mismatch");
        const job = normalizeJob(updated.rows[0]);
        if (!retrying) await wakeRun(client, job.runId);
        await client.query("COMMIT");
        return job;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async heartbeat(command: HeartbeatAgentBackgroundJobCommand): Promise<AgentBackgroundJobSnapshot> {
    return this.withClient(async (client) => {
      const now = command.now || new Date();
      const updated = await client.query(`
        UPDATE agent_background_jobs
        SET lease_expires_at = $4 + ($5 * interval '1 millisecond'), updated_at = $4
        WHERE id = $1 AND owner_id = $2 AND fencing_token = $3 AND status IN ('running', 'cancel_requested')
        RETURNING *
      `, [command.jobId, command.workerId, command.fencingToken, now, Math.max(1, command.leaseMs || 30_000)]);
      if (!updated.rows[0]) throw new Error("Background job fencing token mismatch");
      return normalizeJob(updated.rows[0]);
    });
  }

  async get(principal: ExecutionPrincipal, jobId: string): Promise<AgentBackgroundJobSnapshot | null> {
    return this.withClient(async (client) => {
      const result = await client.query(
        "SELECT * FROM agent_background_jobs WHERE id = $1 AND user_id = $2",
        [jobId, principal.userId],
      );
      return result.rows[0] ? normalizeJob(result.rows[0]) : null;
    });
  }
}

async function wakeRun(client: PoolClient, runId: string): Promise<void> {
  await client.query(`
    UPDATE agent_runs
    SET wake_at = now(), updated_at = now()
    WHERE id = $1 AND status = 'queued' AND legacy = FALSE
  `, [runId]);
  await client.query("SELECT pg_notify('agent_run_available', $1)", [runId]);
}

function normalizeJob(row: Record<string, unknown>): AgentBackgroundJobSnapshot {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    toolAttemptId: row.tool_attempt_id ? String(row.tool_attempt_id) : null,
    userId: String(row.user_id),
    jobType: String(row.job_type),
    status: row.status as AgentBackgroundJobSnapshot["status"],
    handle: object(row.handle_json),
    progress: object(row.progress_json),
    result: object(row.result_json),
    error: object(row.error_json),
    wakeAt: timestamp(row.wake_at) || new Date().toISOString(),
    leaseExpiresAt: timestamp(row.lease_expires_at),
    ownerId: row.owner_id ? String(row.owner_id) : null,
    fencingToken: Number(row.fencing_token || 0),
    createdAt: timestamp(row.created_at) || new Date().toISOString(),
    updatedAt: timestamp(row.updated_at) || new Date().toISOString(),
    completedAt: timestamp(row.completed_at),
  };
}

function object(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function timestamp(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function json(value: unknown): string {
  return JSON.stringify(value || {});
}
