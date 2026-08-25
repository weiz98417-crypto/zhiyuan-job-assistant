import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { withPostgresClient } from "@/lib/postgres";
import type { AgentRuntimeObservation, ToolEffectState } from "@/lib/agent/runtime/observation";
import type {
  BeginToolAttemptInput,
  ToolAttemptRecord,
  ToolAttemptStore,
} from "@/lib/agent/runtime/governed-tool-attempt";
import type { ToolCapability, ToolResult } from "@/lib/agent/tools/types";

type WithClient = <T>(callback: (client: PoolClient) => Promise<T>) => Promise<T>;

export class PostgresToolAttemptStore implements ToolAttemptStore {
  constructor(private readonly withClient: WithClient = withPostgresClient) {}

  async beginAttempt(input: BeginToolAttemptInput): Promise<{ attempt: ToolAttemptRecord; replayed: boolean }> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await assertRunOwnership(client, input.runId, input.principal.userId, input.workerId, input.fencingToken);
        const existing = await client.query(`
          SELECT *
          FROM agent_tool_attempts
          WHERE run_id = $1 AND idempotency_key = $2
        `, [input.runId, input.idempotencyKey]);
        if (existing.rows[0]) {
          await client.query("COMMIT");
          return { attempt: normalizeAttempt(existing.rows[0]), replayed: true };
        }

        const sequence = await client.query(`
          SELECT COALESCE(MAX(attempt_sequence), 0) + 1 AS next_sequence
          FROM agent_tool_attempts
          WHERE run_id = $1
        `, [input.runId]);
        const inserted = await client.query(`
          INSERT INTO agent_tool_attempts (
            id, run_id, user_id, attempt_sequence, tool_name, args_hash,
            idempotency_key, risk, status, effect_state, capability_json,
            input_json, owner_id, fencing_token, deadline_at, started_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, 'intent_recorded', 'not_dispatched', $9::jsonb,
            $10::jsonb, $11, $12, now() + ($13 * interval '1 millisecond'), NULL
          )
          RETURNING *
        `, [
          randomUUID(),
          input.runId,
          input.principal.userId,
          Number(sequence.rows[0]?.next_sequence || 1),
          input.toolName,
          input.argsHash,
          input.idempotencyKey,
          input.capability?.risk || "low",
          input.capability || {},
          input.args,
          input.workerId,
          input.fencingToken,
          input.capability?.deadlineMs || 30_000,
        ]);
        await client.query("COMMIT");
        return { attempt: normalizeAttempt(inserted.rows[0]), replayed: false };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async markAttemptRunning(
    attemptId: string,
    input: { workerId: string; fencingToken: number; effectState: ToolEffectState },
  ): Promise<ToolAttemptRecord> {
    return this.withClient(async (client) => {
      const updated = await client.query(`
        UPDATE agent_tool_attempts attempt
        SET status = 'running', effect_state = $2, owner_id = $3,
            fencing_token = $4, started_at = COALESCE(started_at, now()), updated_at = now()
        FROM agent_runs run
        WHERE attempt.id = $1
          AND attempt.run_id = run.id
          AND run.owner_id = $3
          AND run.fencing_token = $4
        RETURNING attempt.*
      `, [attemptId, input.effectState, input.workerId, input.fencingToken]);
      if (!updated.rows[0]) throw new Error("Stale Tool Attempt owner");
      return normalizeAttempt(updated.rows[0]);
    });
  }

  async finishAttempt(
    attemptId: string,
    input: Pick<ToolAttemptRecord, "workerId" | "fencingToken" | "status" | "effectState" | "result" | "observation">,
  ): Promise<ToolAttemptRecord> {
    return this.withClient(async (client) => {
      const updated = await client.query(`
        UPDATE agent_tool_attempts attempt
        SET status = $2, effect_state = $3, result_json = $4::jsonb,
            error_json = $5::jsonb, owner_id = $6, fencing_token = $7,
            completed_at = CASE WHEN $2 IN ('succeeded', 'denied', 'failed', 'waiting_user', 'cancelled') THEN now() ELSE NULL END,
            updated_at = now()
        FROM agent_runs run
        WHERE attempt.id = $1
          AND attempt.run_id = run.id
          AND (
            (run.owner_id = $6 AND run.fencing_token = $7)
            OR (
              run.status = 'waiting_user'
              AND attempt.owner_id = $6
              AND attempt.fencing_token = $7
            )
          )
        RETURNING attempt.*
      `, [
        attemptId,
        input.status,
        input.effectState,
        input.result || {},
        input.observation ? { observation: input.observation } : {},
        input.workerId,
        input.fencingToken,
      ]);
      if (!updated.rows[0]) throw new Error("Stale Tool Attempt owner");
      return normalizeAttempt(updated.rows[0]);
    });
  }

  async listUncertainAttempts(
    principal: { userId: string },
    runId: string,
  ): Promise<ToolAttemptRecord[]> {
    return this.withClient(async (client) => {
      const result = await client.query(`
        SELECT attempt.*
        FROM agent_tool_attempts attempt
        JOIN agent_runs run ON run.id = attempt.run_id
        WHERE attempt.run_id = $1
          AND run.user_id = $2
          AND attempt.status IN ('running', 'reconciling')
          AND attempt.effect_state = 'unknown'
        ORDER BY attempt.attempt_sequence ASC
      `, [runId, principal.userId]);
      return result.rows.map(normalizeAttempt);
    });
  }
}

async function assertRunOwnership(
  client: PoolClient,
  runId: string,
  userId: string,
  workerId: string,
  fencingToken: number,
): Promise<void> {
  const run = await client.query(`
    SELECT user_id, owner_id, fencing_token
    FROM agent_runs
    WHERE id = $1
    FOR UPDATE
  `, [runId]);
  if (!run.rows[0] || String(run.rows[0].user_id) !== userId) throw new Error("Agent Run not found");
  if (String(run.rows[0].owner_id || "") !== workerId || Number(run.rows[0].fencing_token) !== fencingToken) {
    throw new Error("Stale Tool Attempt owner");
  }
}

function normalizeAttempt(row: Record<string, unknown>): ToolAttemptRecord {
  const capability = recordValue(row.capability_json);
  const result = recordValue(row.result_json);
  const error = recordValue(row.error_json);
  const observation = recordValue(error.observation);
  return {
    id: String(row.id),
    runId: String(row.run_id),
    userId: String(row.user_id),
    sequence: Number(row.attempt_sequence),
    toolName: String(row.tool_name),
    args: recordValue(row.input_json),
    argsHash: String(row.args_hash),
    idempotencyKey: String(row.idempotency_key),
    capability: Object.keys(capability).length > 0 ? capability as unknown as ToolCapability : null,
    status: String(row.status) as ToolAttemptRecord["status"],
    effectState: String(row.effect_state) as ToolEffectState,
    result: Object.keys(result).length > 0 ? result as unknown as ToolResult : null,
    observation: Object.keys(observation).length > 0 ? observation as unknown as AgentRuntimeObservation : null,
    workerId: String(row.owner_id || ""),
    fencingToken: Number(row.fencing_token),
    createdAt: dateString(row.created_at),
    updatedAt: dateString(row.updated_at),
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function dateString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value || "");
}
