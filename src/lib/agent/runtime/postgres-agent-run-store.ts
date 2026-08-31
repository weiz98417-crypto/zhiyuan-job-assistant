import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { withPostgresClient } from "@/lib/postgres";
import { transitionAgentRun } from "@/lib/agent/runtime/state-machine";
import { nextAgentRunStatusForContinuationInput } from "@/lib/agent/runtime/run-continuation";
import { isTerminalAgentRunStatus } from "@/lib/agent/runtime/types";
import type {
  AgentRunCheckpoint,
  AgentRunEvent,
  AgentRunGate,
  AgentRunInputRecord,
  AgentRunSnapshot,
  AgentRunStore,
  ClaimAgentRunCommand,
  ConsumeAgentRunInputsCommand,
  CreateAgentRunCommand,
  CreateAgentRunResult,
  ExecutionPrincipal,
  HeartbeatAgentRunCommand,
  OpenAgentRunGateCommand,
  RecordAgentRunEventCommand,
  SaveAgentRunCheckpointCommand,
  SubmitAgentRunInputResult,
  TransitionAgentRunCommand,
} from "@/lib/agent/runtime/durable-agent-run";

type WithClient = <T>(fn: (client: PoolClient) => Promise<T>) => Promise<T>;

export class PostgresAgentRunStore implements AgentRunStore {
  constructor(private readonly withClient: WithClient = withPostgresClient) {}

  async createRun(
    principal: ExecutionPrincipal,
    command: CreateAgentRunCommand,
  ): Promise<CreateAgentRunResult> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const existing = await client.query(
          "SELECT * FROM agent_runs WHERE user_id = $1 AND request_id = $2",
          [principal.userId, command.requestId],
        );
        if (existing.rows[0]) {
          await client.query("COMMIT");
          return { run: normalizeRun(existing.rows[0]), replayed: true };
        }

        const id = randomUUID();
        const parent = command.parentRunId
          ? await client.query(
              "SELECT depth FROM agent_runs WHERE id = $1 AND user_id = $2 FOR UPDATE",
              [command.parentRunId, principal.userId],
            )
          : null;
        if (command.parentRunId && !parent?.rows[0]) throw new Error("Parent Agent Run not found");
        const depth = parent?.rows[0] ? Number(parent.rows[0].depth || 0) + 1 : 0;
        if (depth > 2) throw new Error("Agent Run child depth exceeds 2");
        if (command.parentRunId) {
          const activeChildren = await client.query(`
            SELECT COUNT(*)::int AS count
            FROM agent_runs
            WHERE parent_run_id = $1
              AND status IN ('queued', 'running', 'waiting_user', 'recovering', 'verifying', 'cancel_requested')
          `, [command.parentRunId]);
          if (Number(activeChildren.rows[0]?.count || 0) >= 4) {
            throw new Error("Agent Run active child limit exceeds 4");
          }
        }

        const inserted = await client.query(`
          INSERT INTO agent_runs (
            id, user_id, session_id, request_id, task_type, agent_id, status,
            contract_json, runtime_mode, execution_owner, snapshot_version,
            event_sequence, policy_versions_json, budgets_json, wake_at, legacy,
            parent_run_id, depth
          ) VALUES (
            $1, $2, $3, $4, $5, $6, 'queued',
            $7::jsonb, $8, 'worker', 1,
            1, $9::jsonb, $10::jsonb, now(), FALSE,
            $11, $12
          )
          RETURNING *
        `, [
          id,
          principal.userId,
          command.conversationId,
          command.requestId,
          command.taskType,
          command.agentId,
          json(command.contract || {}),
          command.runtimeMode || "worker_all",
          json(command.policyVersions || {}),
          json(command.budgets || {}),
          command.parentRunId || null,
          depth,
        ]);
        await client.query(`
          INSERT INTO agent_run_inputs (run_id, user_id, request_id, input_type, content_json)
          VALUES ($1, $2, $3, 'turn', $4::jsonb)
        `, [id, principal.userId, command.requestId, json(command.input)]);
        await insertEventAndOutbox(client, {
          runId: id,
          userId: principal.userId,
          sequence: 1,
          type: "run.created",
          payload: { status: "queued" },
        });
        await client.query("SELECT pg_notify('agent_run_available', $1)", [id]);
        await client.query("COMMIT");
        return { run: normalizeRun(inserted.rows[0]), replayed: false };
      } catch (error) {
        await client.query("ROLLBACK");
        if (isUniqueViolation(error)) {
          const existing = await client.query(
            "SELECT * FROM agent_runs WHERE user_id = $1 AND request_id = $2",
            [principal.userId, command.requestId],
          );
          if (existing.rows[0]) return { run: normalizeRun(existing.rows[0]), replayed: true };
          throw new Error(`Conversation ${command.conversationId} already has a nonterminal Agent Run`);
        }
        throw error;
      }
    });
  }

  async claimNextRun(command: ClaimAgentRunCommand): Promise<AgentRunSnapshot | null> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const now = command.now || new Date();
        const leaseMs = command.leaseMs ?? 30_000;
        const candidate = await client.query(`
          SELECT candidate.id
          FROM agent_runs candidate
          WHERE candidate.legacy = FALSE
            AND candidate.isolation_requested_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM agent_runtime_controls control
              WHERE control.id = 'global' AND control.claims_paused = TRUE
            )
            AND candidate.wake_at <= $1
            AND (
              candidate.status = 'queued'
              OR (candidate.status = 'cancel_requested' AND candidate.owner_id IS NULL)
              OR (
                candidate.status IN ('running', 'recovering', 'verifying', 'cancel_requested')
                AND candidate.lease_expires_at <= $1
              )
            )
            AND NOT EXISTS (
              SELECT 1
              FROM agent_runs active
              WHERE active.user_id = candidate.user_id
                AND active.id <> candidate.id
                AND active.legacy = FALSE
                AND active.status IN ('running', 'recovering', 'verifying', 'cancel_requested')
                AND active.lease_expires_at > $1
            )
          ORDER BY candidate.wake_at ASC, candidate.created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        `, [now]);
        if (!candidate.rows[0]) {
          await client.query("COMMIT");
          return null;
        }

        const updated = await client.query(`
          UPDATE agent_runs
          SET status = CASE WHEN status = 'queued' THEN 'running' ELSE status END,
              owner_id = $2,
              fencing_token = fencing_token + 1,
              heartbeat_at = $3::timestamptz,
              lease_expires_at = $3::timestamptz + ($4::integer * interval '1 millisecond'),
              snapshot_version = snapshot_version + 1,
              event_sequence = event_sequence + 1,
              updated_at = $3::timestamptz
          WHERE id = $1
          RETURNING *
        `, [candidate.rows[0].id, command.workerId, now, leaseMs]);
        const run = normalizeRun(updated.rows[0]);
        await insertEventAndOutbox(client, {
          runId: run.id,
          userId: run.userId,
          sequence: run.eventCursor,
          type: "run.claimed",
          payload: {
            workerId: command.workerId,
            fencingToken: run.fencingToken,
            leaseExpiresAt: run.leaseExpiresAt,
          },
        });
        await client.query("COMMIT");
        return run;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async transitionRun(command: TransitionAgentRunCommand): Promise<AgentRunSnapshot> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const selected = await client.query(
          "SELECT * FROM agent_runs WHERE id = $1 FOR UPDATE",
          [command.runId],
        );
        if (!selected.rows[0]) throw new Error("Agent Run not found");
        const current = normalizeRun(selected.rows[0]);
        if (current.ownerId !== command.workerId || current.fencingToken !== command.fencingToken) {
          throw new Error("Stale Agent Run owner");
        }
        const next = transitionAgentRun(current.status, command.nextStatus);
        const terminal = isTerminalAgentRunStatus(next);
        const releasesOwner = terminal || next === "waiting_user" || next === "queued" || next === "paused";
        const updated = await client.query(`
          UPDATE agent_runs
          SET status = $2,
              snapshot_version = snapshot_version + 1,
              event_sequence = event_sequence + 1,
              completed_at = CASE WHEN $3 THEN now() ELSE completed_at END,
              retention_expires_at = CASE WHEN $3 THEN now() + interval '30 days' ELSE retention_expires_at END,
              owner_id = CASE WHEN $6 THEN NULL ELSE owner_id END,
              lease_expires_at = CASE WHEN $6 THEN NULL ELSE lease_expires_at END,
              last_observation_json = COALESCE($7::jsonb, last_observation_json),
              error_json = COALESCE($8::jsonb, error_json),
              updated_at = now()
          WHERE id = $1 AND owner_id = $4 AND fencing_token = $5
          RETURNING *
        `, [
          command.runId,
          next,
          terminal,
          command.workerId,
          command.fencingToken,
          releasesOwner,
          command.observation ? json(command.observation) : null,
          command.error ? json(command.error) : null,
        ]);
        if (!updated.rows[0]) throw new Error("Stale Agent Run owner");
        const run = normalizeRun(updated.rows[0]);
        await insertEventAndOutbox(client, {
          runId: run.id,
          userId: run.userId,
          sequence: run.eventCursor,
          type: "run.status_changed",
          payload: { status: run.status },
        });
        await client.query("COMMIT");
        return run;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async listEvents(
    principal: ExecutionPrincipal,
    runId: string,
    afterCursor: number,
  ): Promise<AgentRunEvent[]> {
    return this.withClient(async (client) => {
      const result = await client.query(`
        SELECT event.run_id, event.user_id, event.sequence, event.event_type,
               event.schema_version, event.payload_json, event.created_at
        FROM agent_run_events event
        JOIN agent_runs run ON run.id = event.run_id
        WHERE event.run_id = $1 AND run.user_id = $2 AND event.sequence > $3
        ORDER BY event.sequence ASC
        LIMIT 500
      `, [runId, principal.userId, afterCursor]);
      return result.rows.map(normalizeEvent);
    });
  }

  async saveCheckpoint(command: SaveAgentRunCheckpointCommand): Promise<AgentRunCheckpoint> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const updated = await client.query(`
          UPDATE agent_runs
          SET snapshot_version = snapshot_version + 1,
              event_sequence = event_sequence + 1,
              budgets_json = $4::jsonb,
              updated_at = now()
          WHERE id = $1
            AND fencing_token = $3
            AND (
              owner_id = $2
              OR (status = 'waiting_user' AND owner_id IS NULL)
            )
          RETURNING *
        `, [command.runId, command.workerId, command.fencingToken, json(command.budgets)]);
        if (!updated.rows[0]) throw new Error("Stale Agent Run owner");
        const run = normalizeRun(updated.rows[0]);
        const inserted = await client.query(`
          INSERT INTO agent_run_checkpoints (
            run_id, user_id, snapshot_version, fencing_token, boundary,
            context_json, plan_json, budgets_json, fact_refs_json
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb)
          RETURNING *
        `, [
          run.id,
          run.userId,
          run.snapshotVersion,
          run.fencingToken,
          command.boundary,
          json(command.context),
          json(command.plan),
          json(command.budgets),
          json(command.factRefs),
        ]);
        await insertEventAndOutbox(client, {
          runId: run.id,
          userId: run.userId,
          sequence: run.eventCursor,
          type: "run.checkpointed",
          payload: {
            checkpointId: Number(inserted.rows[0].id),
            boundary: command.boundary,
            snapshotVersion: run.snapshotVersion,
          },
        });
        await client.query("COMMIT");
        return normalizeCheckpoint(inserted.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async getLatestCheckpoint(
    principal: ExecutionPrincipal,
    runId: string,
  ): Promise<AgentRunCheckpoint | null> {
    return this.withClient(async (client) => {
      const result = await client.query(`
        SELECT checkpoint.*
        FROM agent_run_checkpoints checkpoint
        JOIN agent_runs run ON run.id = checkpoint.run_id
        WHERE checkpoint.run_id = $1 AND run.user_id = $2
        ORDER BY checkpoint.snapshot_version DESC, checkpoint.id DESC
        LIMIT 1
      `, [runId, principal.userId]);
      return result.rows[0] ? normalizeCheckpoint(result.rows[0]) : null;
    });
  }

  async requestCancel(
    principal: ExecutionPrincipal,
    runId: string,
    requestId: string,
  ): Promise<AgentRunSnapshot> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const selected = await client.query(
          "SELECT * FROM agent_runs WHERE id = $1 AND user_id = $2 FOR UPDATE",
          [runId, principal.userId],
        );
        if (!selected.rows[0]) throw new Error("Agent Run not found");
        const current = normalizeRun(selected.rows[0]);
        const duplicate = await client.query(
          "SELECT 1 FROM agent_run_inputs WHERE user_id = $1 AND request_id = $2",
          [principal.userId, requestId],
        );
        if (duplicate.rows[0] || current.status === "cancel_requested" || isTerminalAgentRunStatus(current.status)) {
          await client.query("COMMIT");
          return current;
        }
        const next = transitionAgentRun(current.status, "cancel_requested");
        await client.query(`
          INSERT INTO agent_run_inputs (run_id, user_id, request_id, input_type, content_json, status)
          VALUES ($1, $2, $3, 'cancel', '{}'::jsonb, 'consumed')
        `, [runId, principal.userId, requestId]);
        const updated = await client.query(`
          UPDATE agent_runs
          SET status = $2,
              cancel_requested_at = now(),
              wake_at = now(),
              snapshot_version = snapshot_version + 1,
              event_sequence = event_sequence + 1,
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `, [runId, next]);
        const run = normalizeRun(updated.rows[0]);
        await insertEventAndOutbox(client, {
          runId: run.id,
          userId: run.userId,
          sequence: run.eventCursor,
          type: "run.cancel_requested",
          payload: { requestId },
        });
        const descendants = await client.query(`
          WITH RECURSIVE child_runs AS (
            SELECT id FROM agent_runs WHERE parent_run_id = $1 AND user_id = $2
            UNION ALL
            SELECT child.id
            FROM agent_runs child
            JOIN child_runs parent ON child.parent_run_id = parent.id
            WHERE child.user_id = $2
          )
          UPDATE agent_runs
          SET status = 'cancel_requested',
              cancel_requested_at = now(),
              wake_at = now(),
              snapshot_version = snapshot_version + 1,
              event_sequence = event_sequence + 1,
              updated_at = now()
          WHERE id IN (SELECT id FROM child_runs)
            AND status IN ('queued', 'running', 'waiting_user', 'recovering', 'verifying')
          RETURNING *
        `, [run.id, principal.userId]);
        for (const row of descendants.rows) {
          const child = normalizeRun(row);
          await insertEventAndOutbox(client, {
            runId: child.id,
            userId: child.userId,
            sequence: child.eventCursor,
            type: "run.cancel_requested",
            payload: { requestId, propagatedFromRunId: run.id },
          });
          await client.query("SELECT pg_notify('agent_run_available', $1)", [child.id]);
        }
        await client.query("SELECT pg_notify('agent_run_available', $1)", [run.id]);
        await client.query("COMMIT");
        return run;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async requestPause(
    principal: ExecutionPrincipal,
    runId: string,
    requestId: string,
  ): Promise<AgentRunSnapshot> {
    return this.controlRun(principal, runId, requestId, "pause");
  }

  async resumeRun(
    principal: ExecutionPrincipal,
    runId: string,
    requestId: string,
  ): Promise<AgentRunSnapshot> {
    return this.controlRun(principal, runId, requestId, "resume");
  }

  private async controlRun(
    principal: ExecutionPrincipal,
    runId: string,
    requestId: string,
    action: "pause" | "resume",
  ): Promise<AgentRunSnapshot> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const selected = await client.query(
          "SELECT * FROM agent_runs WHERE id = $1 AND user_id = $2 FOR UPDATE",
          [runId, principal.userId],
        );
        if (!selected.rows[0]) throw new Error("Agent Run not found");
        const current = normalizeRun(selected.rows[0]);
        const controlRequestId = `${action}:${requestId}`;
        const duplicate = await client.query(
          "SELECT 1 FROM agent_run_inputs WHERE user_id = $1 AND request_id = $2",
          [principal.userId, controlRequestId],
        );
        if (duplicate.rows[0]) {
          await client.query("COMMIT");
          return current;
        }
        if ((action === "pause" && (current.status === "paused" || isTerminalAgentRunStatus(current.status)))
          || (action === "resume" && current.status !== "paused")) {
          await client.query("COMMIT");
          return current;
        }
        if (action === "resume" && current.conversationId !== null) {
          const active = await client.query(`
            SELECT 1 FROM agent_runs
            WHERE user_id = $1 AND session_id = $2 AND id <> $3 AND legacy = FALSE
              AND status IN ('queued', 'running', 'waiting_user', 'recovering', 'verifying', 'cancel_requested')
            LIMIT 1
          `, [principal.userId, current.conversationId, runId]);
          if (active.rows[0]) throw new Error("Conversation already has an active Agent Run");
        }
        const next = action === "pause" ? "paused" : "queued";
        transitionAgentRun(current.status, next);
        await client.query(`
          INSERT INTO agent_run_inputs (run_id, user_id, request_id, input_type, content_json, status)
          VALUES ($1, $2, $3, $4, '{}'::jsonb, 'consumed')
        `, [runId, principal.userId, controlRequestId, action]);
        const updated = await client.query(`
          UPDATE agent_runs
          SET status = $2,
              owner_id = CASE WHEN $3 THEN NULL ELSE owner_id END,
              lease_expires_at = CASE WHEN $3 THEN NULL ELSE lease_expires_at END,
              wake_at = CASE WHEN $2 = 'queued' THEN now() ELSE wake_at END,
              snapshot_version = snapshot_version + 1,
              event_sequence = event_sequence + 1,
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `, [runId, next, action === "pause"]);
        const run = normalizeRun(updated.rows[0]);
        await insertEventAndOutbox(client, {
          runId: run.id,
          userId: run.userId,
          sequence: run.eventCursor,
          type: action === "pause" ? "run.paused" : "run.resumed",
          payload: { requestId },
        });
        if (action === "resume") await client.query("SELECT pg_notify('agent_run_available', $1)", [run.id]);
        await client.query("COMMIT");
        return run;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async openGate(command: OpenAgentRunGateCommand): Promise<AgentRunGate> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const selected = await client.query(
          "SELECT * FROM agent_runs WHERE id = $1 FOR UPDATE",
          [command.runId],
        );
        if (!selected.rows[0]) throw new Error("Agent Run not found");
        const current = normalizeRun(selected.rows[0]);
        if (current.ownerId !== command.workerId || current.fencingToken !== command.fencingToken) {
          throw new Error("Stale Agent Run owner");
        }
        const next = transitionAgentRun(current.status, "waiting_user");
        const gateId = randomUUID();
        const inserted = await client.query(`
          INSERT INTO agent_run_gates (
            id, run_id, user_id, scope_hash, tool_name, risk, status, request_json
          ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7::jsonb)
          RETURNING *
        `, [gateId, current.id, current.userId, command.scopeHash, command.toolName, command.risk, json(command.request)]);
        const updated = await client.query(`
          UPDATE agent_runs
          SET status = $2,
              owner_id = NULL,
              lease_expires_at = NULL,
              snapshot_version = snapshot_version + 1,
              event_sequence = event_sequence + 1,
              updated_at = now()
          WHERE id = $1 AND owner_id = $3 AND fencing_token = $4
          RETURNING *
        `, [current.id, next, command.workerId, command.fencingToken]);
        if (!updated.rows[0]) throw new Error("Stale Agent Run owner");
        const run = normalizeRun(updated.rows[0]);
        await insertEventAndOutbox(client, {
          runId: run.id,
          userId: run.userId,
          sequence: run.eventCursor,
          type: "run.gate_opened",
          payload: { gateId, toolName: command.toolName, risk: command.risk, scopeHash: command.scopeHash },
        });
        await client.query("COMMIT");
        return normalizeGate(inserted.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async respondGate(
    principal: ExecutionPrincipal,
    gateId: string,
    requestId: string,
    decision: "approved" | "denied",
  ): Promise<AgentRunGate> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const selected = await client.query(`
          SELECT gate.*, run.status AS run_status, run.event_sequence, run.snapshot_version
          FROM agent_run_gates gate
          JOIN agent_runs run ON run.id = gate.run_id
          WHERE gate.id = $1 AND gate.user_id = $2
          FOR UPDATE OF gate, run
        `, [gateId, principal.userId]);
        if (!selected.rows[0]) throw new Error("Run Gate not found");
        const duplicate = await client.query(
          "SELECT 1 FROM agent_run_inputs WHERE user_id = $1 AND request_id = $2",
          [principal.userId, requestId],
        );
        if (duplicate.rows[0] || selected.rows[0].status !== "pending") {
          await client.query("COMMIT");
          return normalizeGate(selected.rows[0]);
        }
        await client.query(`
          INSERT INTO agent_run_inputs (run_id, user_id, request_id, input_type, content_json, status)
          VALUES ($1, $2, $3, 'gate_response', $4::jsonb, 'consumed')
        `, [selected.rows[0].run_id, principal.userId, requestId, json({ gateId, decision })]);
        const gateResult = await client.query(`
          UPDATE agent_run_gates
          SET status = $2, response_json = $3::jsonb, resolved_at = now()
          WHERE id = $1
          RETURNING *
        `, [gateId, decision, json({ decision })]);
        if (selected.rows[0].run_status === "waiting_user") {
          const updated = await client.query(`
            UPDATE agent_runs
            SET status = 'queued',
                wake_at = now(),
                snapshot_version = snapshot_version + 1,
                event_sequence = event_sequence + 1,
                updated_at = now()
            WHERE id = $1
            RETURNING *
          `, [selected.rows[0].run_id]);
          const run = normalizeRun(updated.rows[0]);
          await insertEventAndOutbox(client, {
            runId: run.id,
            userId: run.userId,
            sequence: run.eventCursor,
            type: "run.gate_resolved",
            payload: { gateId, decision, scopeHash: selected.rows[0].scope_hash },
          });
          await client.query("SELECT pg_notify('agent_run_available', $1)", [run.id]);
        }
        await client.query("COMMIT");
        return normalizeGate(gateResult.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async isGateApproved(
    principal: ExecutionPrincipal,
    runId: string,
    scopeHash: string,
  ): Promise<boolean> {
    return this.withClient(async (client) => Boolean((await client.query(`
      SELECT 1
      FROM agent_run_gates
      WHERE run_id = $1 AND user_id = $2 AND scope_hash = $3 AND status = 'approved'
      LIMIT 1
    `, [runId, principal.userId, scopeHash])).rows[0]));
  }

  async isGateDenied(
    principal: ExecutionPrincipal,
    runId: string,
    scopeHash: string,
  ): Promise<boolean> {
    return this.withClient(async (client) => Boolean((await client.query(`
      SELECT 1
      FROM agent_run_gates
      WHERE run_id = $1 AND user_id = $2 AND scope_hash = $3 AND status = 'denied'
      LIMIT 1
    `, [runId, principal.userId, scopeHash])).rows[0]));
  }

  async submitInput(
    principal: ExecutionPrincipal,
    runId: string,
    requestId: string,
    input: { content: string; images?: string[] },
  ): Promise<SubmitAgentRunInputResult> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const selected = await client.query(
          "SELECT * FROM agent_runs WHERE id = $1 AND user_id = $2 FOR UPDATE",
          [runId, principal.userId],
        );
        if (!selected.rows[0]) throw new Error("Agent Run not found");
        const current = normalizeRun(selected.rows[0]);
        if (isTerminalAgentRunStatus(current.status)) throw new Error("Terminal Agent Run cannot accept input");
        const duplicate = await client.query(
          "SELECT * FROM agent_run_inputs WHERE user_id = $1 AND request_id = $2",
          [principal.userId, requestId],
        );
        if (duplicate.rows[0]) {
          await client.query("COMMIT");
          return { run: current, input: normalizeInput(duplicate.rows[0]), replayed: true };
        }
        const inserted = await client.query(`
          INSERT INTO agent_run_inputs (run_id, user_id, request_id, input_type, content_json)
          VALUES ($1, $2, $3, 'turn', $4::jsonb)
          RETURNING *
        `, [runId, principal.userId, requestId, json(input)]);
        const nextStatus = nextAgentRunStatusForContinuationInput(current.status);
        const updated = await client.query(`
          UPDATE agent_runs
          SET status = $2,
              wake_at = CASE WHEN $2 = 'queued' THEN now() ELSE wake_at END,
              snapshot_version = snapshot_version + 1,
              event_sequence = event_sequence + 1,
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `, [runId, nextStatus]);
        const run = normalizeRun(updated.rows[0]);
        await insertEventAndOutbox(client, {
          runId: run.id,
          userId: run.userId,
          sequence: run.eventCursor,
          type: "run.input_accepted",
          payload: { requestId, inputId: Number(inserted.rows[0].id) },
        });
        if (run.status === "queued") await client.query("SELECT pg_notify('agent_run_available', $1)", [run.id]);
        await client.query("COMMIT");
        return { run, input: normalizeInput(inserted.rows[0]), replayed: false };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async getRun(principal: ExecutionPrincipal, runId: string): Promise<AgentRunSnapshot | null> {
    return this.withClient(async (client) => {
      const result = await client.query(
        "SELECT * FROM agent_runs WHERE id = $1 AND user_id = $2",
        [runId, principal.userId],
      );
      return result.rows[0] ? normalizeRun(result.rows[0]) : null;
    });
  }

  async listPendingInputs(principal: ExecutionPrincipal, runId: string): Promise<AgentRunInputRecord[]> {
    return this.withClient(async (client) => {
      const result = await client.query(`
        SELECT input.*
        FROM agent_run_inputs input
        JOIN agent_runs run ON run.id = input.run_id
        WHERE input.run_id = $1 AND run.user_id = $2 AND input.status = 'pending'
        ORDER BY input.id ASC
      `, [runId, principal.userId]);
      return result.rows.map(normalizeInput);
    });
  }

  async consumeInputs(command: ConsumeAgentRunInputsCommand): Promise<void> {
    if (command.inputIds.length === 0) return;
    await this.withClient(async (client) => {
      const result = await client.query(`
        UPDATE agent_run_inputs input
        SET status = 'consumed', consumed_at = now()
        FROM agent_runs run
        WHERE input.run_id = run.id
          AND input.run_id = $1
          AND input.id = ANY($2::bigint[])
          AND input.status = 'pending'
          AND run.owner_id = $3
          AND run.fencing_token = $4
        RETURNING input.id
      `, [command.runId, command.inputIds, command.workerId, command.fencingToken]);
      if (result.rowCount !== command.inputIds.length) throw new Error("Stale Agent Run owner or input already consumed");
    });
  }

  async recordEvent(command: RecordAgentRunEventCommand): Promise<AgentRunEvent> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const updated = await client.query(`
          UPDATE agent_runs
          SET snapshot_version = snapshot_version + 1,
              event_sequence = event_sequence + 1,
              updated_at = now()
          WHERE id = $1
            AND fencing_token = $3
            AND (
              owner_id = $2
              OR (status = 'waiting_user' AND owner_id IS NULL)
            )
          RETURNING *
        `, [command.runId, command.workerId, command.fencingToken]);
        if (!updated.rows[0]) throw new Error("Stale Agent Run owner");
        const run = normalizeRun(updated.rows[0]);
        await insertEventAndOutbox(client, {
          runId: run.id,
          userId: run.userId,
          sequence: run.eventCursor,
          type: command.type,
          payload: command.payload,
        });
        await client.query("COMMIT");
        return {
          runId: run.id,
          userId: run.userId,
          sequence: run.eventCursor,
          type: command.type,
          schemaVersion: 1,
          payload: { ...command.payload },
          createdAt: new Date().toISOString(),
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async heartbeat(command: HeartbeatAgentRunCommand): Promise<AgentRunSnapshot> {
    return this.withClient(async (client) => {
      const now = command.now || new Date();
      const result = await client.query(`
        UPDATE agent_runs
        SET heartbeat_at = $4::timestamptz,
            lease_expires_at = $4::timestamptz + ($5::integer * interval '1 millisecond'),
            updated_at = $4::timestamptz
        WHERE id = $1
          AND owner_id = $2
          AND fencing_token = $3
          AND status IN ('running', 'recovering', 'verifying')
          AND isolation_requested_at IS NULL
        RETURNING *
      `, [command.runId, command.workerId, command.fencingToken, now, command.leaseMs ?? 30_000]);
      if (!result.rows[0]) throw new Error("Stale Agent Run owner");
      return normalizeRun(result.rows[0]);
    });
  }

  async listRuns(
    principal: ExecutionPrincipal,
    options: { conversationId?: number; activeOnly?: boolean; limit?: number } = {},
  ): Promise<AgentRunSnapshot[]> {
    return this.withClient(async (client) => {
      const params: unknown[] = [principal.userId];
      const where = ["user_id = $1", "legacy = FALSE"];
      if (options.conversationId !== undefined) {
        params.push(options.conversationId);
        where.push(`session_id = $${params.length}`);
      }
      if (options.activeOnly) {
        where.push("status IN ('queued', 'running', 'waiting_user', 'paused', 'recovering', 'verifying', 'cancel_requested')");
      }
      params.push(Math.max(1, Math.min(100, options.limit || 20)));
      const result = await client.query(`
        SELECT * FROM agent_runs
        WHERE ${where.join(" AND ")}
        ORDER BY updated_at DESC
        LIMIT $${params.length}
      `, params);
      return result.rows.map(normalizeRun);
    });
  }
}

async function insertEventAndOutbox(
  client: PoolClient,
  input: {
    runId: string;
    userId: string;
    sequence: number;
    type: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const payload = json(input.payload);
  await client.query(`
    INSERT INTO agent_run_events (run_id, user_id, sequence, event_type, schema_version, payload_json)
    VALUES ($1, $2, $3, $4, 1, $5::jsonb)
  `, [input.runId, input.userId, input.sequence, input.type, payload]);
  await client.query(`
    INSERT INTO agent_run_outbox (run_id, user_id, event_sequence, topic, schema_version, payload_json)
    VALUES ($1, $2, $3, 'run_event', 1, $4::jsonb)
  `, [input.runId, input.userId, input.sequence, json({ type: input.type, ...input.payload })]);
  if (
    input.type === "run.status_changed"
    && ["succeeded", "failed", "cancelled"].includes(String(input.payload.status || ""))
  ) {
    await client.query(`
      INSERT INTO agent_run_outbox (run_id, user_id, event_sequence, topic, schema_version, payload_json)
      VALUES ($1, $2, $3, 'run_review', 1, $4::jsonb)
    `, [input.runId, input.userId, input.sequence, json({ type: input.type, ...input.payload })]);
  }
}

function normalizeRun(row: Record<string, unknown>): AgentRunSnapshot {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    conversationId: row.session_id === null || row.session_id === undefined ? null : Number(row.session_id),
    requestId: String(row.request_id || ""),
    taskType: String(row.task_type || ""),
    agentId: String(row.agent_id || ""),
    status: String(row.status) as AgentRunSnapshot["status"],
    snapshotVersion: Number(row.snapshot_version || 0),
    eventCursor: Number(row.event_sequence || 0),
    contract: row.contract_json || {},
    budgets: objectRecord(row.budgets_json),
    lastObservation: objectRecord(row.last_observation_json),
    error: objectRecord(row.error_json),
    runtimeMode: String(row.runtime_mode || "legacy"),
    parentRunId: row.parent_run_id ? String(row.parent_run_id) : null,
    depth: Number(row.depth || 0),
    ownerId: row.owner_id ? String(row.owner_id) : null,
    fencingToken: Number(row.fencing_token || 0),
    heartbeatAt: isoOrNull(row.heartbeat_at),
    leaseExpiresAt: isoOrNull(row.lease_expires_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function normalizeEvent(row: Record<string, unknown>): AgentRunEvent {
  return {
    runId: String(row.run_id),
    userId: String(row.user_id),
    sequence: Number(row.sequence),
    type: String(row.event_type),
    schemaVersion: Number(row.schema_version || 1),
    payload: objectRecord(row.payload_json),
    createdAt: iso(row.created_at),
  };
}

function normalizeCheckpoint(row: Record<string, unknown>): AgentRunCheckpoint {
  return {
    id: Number(row.id),
    runId: String(row.run_id),
    userId: String(row.user_id),
    snapshotVersion: Number(row.snapshot_version),
    fencingToken: Number(row.fencing_token),
    boundary: String(row.boundary),
    context: objectRecord(row.context_json),
    plan: objectRecord(row.plan_json),
    budgets: objectRecord(row.budgets_json),
    factRefs: Array.isArray(row.fact_refs_json)
      ? row.fact_refs_json as AgentRunCheckpoint["factRefs"]
      : [],
    createdAt: iso(row.created_at),
  };
}

function normalizeGate(row: Record<string, unknown>): AgentRunGate {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    userId: String(row.user_id),
    toolName: String(row.tool_name || ""),
    risk: String(row.risk || "medium"),
    scopeHash: String(row.scope_hash),
    status: String(row.status) as AgentRunGate["status"],
    request: objectRecord(row.request_json),
    response: objectRecord(row.response_json),
    createdAt: iso(row.created_at),
    resolvedAt: isoOrNull(row.resolved_at),
  };
}

function normalizeInput(row: Record<string, unknown>): AgentRunInputRecord {
  const content = objectRecord(row.content_json);
  return {
    id: Number(row.id),
    runId: String(row.run_id),
    userId: String(row.user_id),
    requestId: String(row.request_id),
    inputType: String(row.input_type || "turn"),
    content: {
      content: String(content.content || ""),
      images: Array.isArray(content.images) ? content.images.map(String) : undefined,
      ...(content.persistInConversation === false ? { persistInConversation: false } : {}),
    },
    status: String(row.status) as AgentRunInputRecord["status"],
    createdAt: iso(row.created_at),
    consumedAt: isoOrNull(row.consumed_at),
  };
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function json(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value || "");
}

function isoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}
