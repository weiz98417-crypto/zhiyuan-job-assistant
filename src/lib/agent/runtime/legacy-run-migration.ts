import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { withPostgresClient } from "@/lib/postgres";
import { TASK_PROGRAM_REGISTRY } from "@/lib/agent/task-program";
import { buildContractForTask } from "@/lib/agent/run-admission";
import type { AgentTaskContract, AgentTaskType } from "@/lib/agent/task-contract";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import type { IntentConstraints } from "@/lib/agent/intent-constraints";

type WithClient = <Result>(operation: (client: PoolClient) => Promise<Result>) => Promise<Result>;

export interface LegacyRunMigrationPlan {
  runId: string;
  userId: string;
  conversationId: number | null;
  action: "pause_for_revalidation" | "preserve_terminal" | "already_migrated";
  status: string;
  sourceHash: string;
  sourceSnapshotVersion: number;
  originalBinding: { taskType: string; agentId: string; contract: unknown; requestId: string | null };
  effectiveContract: AgentTaskContract | null;
  evidence: { checkpointId: number | null; inputIds: number[]; inputSourceHash: string; factRefs: unknown[] };
  requiredChecks: string[];
  explanation: string;
  readBackVerified?: true;
}

export class LegacyRunMigrationService {
  constructor(private readonly withClient: WithClient = withPostgresClient) {}

  async inspect(principal: ExecutionPrincipal, runId: string): Promise<LegacyRunMigrationPlan> {
    return this.withClient(async (client) => (await this.load(client, principal, runId, false)).plan);
  }

  async apply(principal: ExecutionPrincipal, runId: string, expectedSourceHash: string): Promise<LegacyRunMigrationPlan> {
    if (!/^[a-f0-9]{64}$/.test(expectedSourceHash)) throw new Error("Legacy migration requires a reviewed source hash");
    const applied = await this.withClient(async (client) => {
      await client.query("BEGIN");
      let committed = false;
      try {
        const { plan, run, checkpoint, inputs } = await this.load(client, principal, runId, true);
        if (plan.action === "already_migrated" && object(checkpoint?.context_json).legacyMigration
          && object(object(checkpoint?.context_json).legacyMigration).sourceHash === expectedSourceHash) {
          await client.query("COMMIT");
          committed = true;
          const originalPlan = object(checkpoint?.context_json).legacyMigration as LegacyRunMigrationPlan;
          return { plan, verificationPlan: originalPlan };
        }
        if (plan.sourceHash !== expectedSourceHash) throw new Error("Legacy Run changed after migration inspection");
        if (plan.action !== "pause_for_revalidation") {
          await client.query("COMMIT");
          return { plan, verificationPlan: null };
        }
        const updated = await client.query(`
          UPDATE agent_runs
          SET legacy = FALSE, runtime_mode = 'worker_all', execution_owner = 'worker', status = 'paused',
              owner_id = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
              fencing_token = fencing_token + 1, snapshot_version = snapshot_version + 1,
              event_sequence = event_sequence + 1, request_id = COALESCE(request_id, $3),
              contract_json = $4::jsonb, last_observation_json = $5::jsonb, updated_at = now()
          WHERE id = $1 AND user_id = $2 AND legacy = TRUE
          RETURNING snapshot_version, event_sequence, fencing_token
        `, [runId, principal.userId, "legacy-migration:" + runId,
          JSON.stringify(plan.effectiveContract || run.contract_json || {}),
          JSON.stringify({ category: "legacy_revalidation", userSafeSummary: plan.explanation, requiredChecks: plan.requiredChecks })]);
        if (!updated.rows[0]) throw new Error("Legacy migration lost the original Run");
        const current = updated.rows[0];
        await client.query("UPDATE agent_run_inputs SET status = 'consumed', consumed_at = COALESCE(consumed_at, now()) WHERE run_id = $1 AND user_id = $2 AND status = 'pending'", [runId, principal.userId]);
        const messages = migrationInputMessages(runId, inputs);
        await client.query(`
          INSERT INTO agent_run_checkpoints (run_id, user_id, snapshot_version, fencing_token, boundary,
            context_json, plan_json, budgets_json, fact_refs_json)
          VALUES ($1, $2, $3, $4, 'legacy_migration', $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb)
        `, [runId, principal.userId, current.snapshot_version, current.fencing_token,
          JSON.stringify({ messages, conversationMessages: messages, latestInput: messages.at(-1)?.content || "",
            taskContract: plan.effectiveContract, legacyMigration: { ...plan, originalCheckpoint: checkpoint || null, originalResult: run.result_json } }),
          JSON.stringify({ stage: "preflight", legacyRevalidationRequired: true, legacyRequiredChecks: plan.requiredChecks,
            legacyExplanation: plan.explanation }), JSON.stringify(run.budgets_json || {}), "[]"]);
        const payload = { type: "run.legacy_migrated", status: "paused", sourceHash: plan.sourceHash,
          originalTaskType: plan.originalBinding.taskType, checkpointId: plan.evidence.checkpointId,
          requiredChecks: plan.requiredChecks, explanation: plan.explanation };
        await client.query(`
          INSERT INTO agent_run_events (run_id, user_id, sequence, event_type, schema_version, payload_json)
          VALUES ($1, $2, $3, 'run.legacy_migrated', 1, $4::jsonb)
        `, [runId, principal.userId, current.event_sequence, JSON.stringify(payload)]);
        await client.query(`
          INSERT INTO agent_run_outbox (run_id, user_id, event_sequence, topic, schema_version, payload_json)
          VALUES ($1, $2, $3, 'run_event', 1, $4::jsonb), ($1, $2, $3, 'run_review', 1, $4::jsonb)
        `, [runId, principal.userId, current.event_sequence, JSON.stringify(payload)]);
        await client.query("COMMIT");
        committed = true;
        return { plan: { ...plan, status: "paused" }, verificationPlan: plan };
      } catch (error) {
        if (!committed) await client.query("ROLLBACK");
        throw error;
      }
    });
    if (!applied.verificationPlan) return applied.plan;
    await this.verify(principal, applied.verificationPlan);
    return { ...applied.plan, readBackVerified: true };
  }

  private async verify(principal: ExecutionPrincipal, expected: LegacyRunMigrationPlan): Promise<void> {
    await this.withClient(async (client) => {
      const { run, checkpoint, inputs } = await this.load(client, principal, expected.runId, false);
      const context = object(checkpoint?.context_json);
      const receipt = object(context.legacyMigration);
      const plan = object(checkpoint?.plan_json);
      const expectedContract = expected.effectiveContract || expected.originalBinding.contract || {};
      const contractMatches = canonical(run.contract_json) === canonical(expectedContract);
      const retainedInputs = inputs.filter((row) => expected.evidence.inputIds.includes(Number(row.id)));
      const messages = migrationInputMessages(expected.runId, retainedInputs);
      const inputsVerified = retainedInputs.length === expected.evidence.inputIds.length && retainedInputs.every((row) => row.status === "consumed")
        && inputSourceHash(retainedInputs) === expected.evidence.inputSourceHash
        && canonical(context.messages) === canonical(messages) && canonical(context.conversationMessages) === canonical(messages);
      const planVerified = plan.stage === "preflight" && plan.legacyRevalidationRequired === true
        && canonical(plan.legacyRequiredChecks) === canonical(expected.requiredChecks)
        && context.modelCompletion === undefined && canonical(context.taskContract) === canonical(expected.effectiveContract);
      const events = await client.query("SELECT payload_json FROM agent_run_events WHERE run_id = $1 AND user_id = $2 AND event_type = 'run.legacy_migrated'", [expected.runId, principal.userId]);
      const outbox = await client.query("SELECT topic, payload_json FROM agent_run_outbox WHERE run_id = $1 AND user_id = $2 AND topic IN ('run_event', 'run_review')", [expected.runId, principal.userId]);
      const auditVerified = events.rows.some((row) => object(row.payload_json).sourceHash === expected.sourceHash)
        && ["run_event", "run_review"].every((topic) => outbox.rows.some((row) => row.topic === topic && object(row.payload_json).sourceHash === expected.sourceHash));
      if (run.id !== expected.runId || run.user_id !== principal.userId || run.legacy !== false || run.status !== "paused"
        || run.runtime_mode !== "worker_all" || run.execution_owner !== "worker" || run.owner_id !== null
        || Number(run.session_id ?? 0) !== Number(expected.conversationId ?? 0)
        || run.task_type !== expected.originalBinding.taskType || run.agent_id !== expected.originalBinding.agentId
        || !contractMatches || !inputsVerified || !planVerified || !auditVerified || checkpoint?.boundary !== "legacy_migration"
        || receipt.sourceHash !== expected.sourceHash || canonical(receipt.originalBinding) !== canonical(expected.originalBinding)) {
        throw new Error("Legacy migration read-back failed; the original Run requires review before resuming");
      }
    });
  }

  private async load(client: PoolClient, principal: ExecutionPrincipal, runId: string, lock: boolean) {
    const selected = await client.query("SELECT * FROM agent_runs WHERE id = $1 AND user_id = $2" + (lock ? " FOR UPDATE" : ""), [runId, principal.userId]);
    const run = selected.rows[0] as Record<string, unknown> | undefined;
    if (!run) throw new Error("Agent Run not found");
    const checkpoints = await client.query(`SELECT * FROM agent_run_checkpoints WHERE run_id = $1 AND user_id = $2
      ORDER BY snapshot_version DESC, id DESC LIMIT 1`, [runId, principal.userId]);
    const inputRows = await client.query("SELECT * FROM agent_run_inputs WHERE run_id = $1 AND user_id = $2 AND status <> 'rejected' ORDER BY id ASC", [runId, principal.userId]);
    const checkpoint = checkpoints.rows[0] as Record<string, unknown> | undefined;
    const inputs = inputRows.rows as Array<Record<string, unknown>>;
    const sessionId = run.session_id === null || run.session_id === undefined ? null : Number(run.session_id);
    const session = sessionId === null ? null : await client.query("SELECT id FROM sessions WHERE id = $1 AND user_id = $2", [sessionId, principal.userId]);
    const taskType = String(run.task_type);
    const knownTask = Object.prototype.hasOwnProperty.call(TASK_PROGRAM_REGISTRY, taskType);
    const priorContract = object(run.contract_json);
    const bindingValid = knownTask && (!priorContract.taskType || priorContract.taskType === taskType);
    const text = inputs.map((row) => String(object(row.content_json).content || "")).filter(Boolean).join("\n");
    const originalBinding = { taskType, agentId: String(run.agent_id || ""), contract: run.contract_json,
      requestId: run.request_id ? String(run.request_id) : null };
    const requiredChecks = [
      ...(!knownTask || !bindingValid ? ["task_binding_review"] : []),
      ...(sessionId !== null && !session?.rows[0] ? ["conversation_owner_review"] : []),
      ...(!text ? ["renewed_user_material"] : []),
      "independent_artifact_read_back_or_renewed_confirmation",
    ];
    const effectiveContract = bindingValid
      ? buildContractForTask(taskType as AgentTaskType, text || String(priorContract.target || "旧任务材料待复核"), undefined,
        legacyConstraints(object(priorContract.routing).intentConstraints))
      : null;
    if (effectiveContract) {
      if (typeof priorContract.baseVersion === "string") effectiveContract.baseVersion = priorContract.baseVersion;
      if (typeof priorContract.baseHash === "string") effectiveContract.baseHash = priorContract.baseHash;
    }
    const sourceHash = createHash("sha256").update(JSON.stringify({ run, checkpoint, inputs })).digest("hex");
    const terminal = ["succeeded", "failed", "cancelled", "rolled_back"].includes(String(run.status));
    const plan: LegacyRunMigrationPlan = {
      runId, userId: principal.userId, conversationId: sessionId,
      action: run.legacy !== true ? "already_migrated" : terminal ? "preserve_terminal" : "pause_for_revalidation",
      status: String(run.status), sourceHash, sourceSnapshotVersion: Number(run.snapshot_version || 0), originalBinding, effectiveContract,
      evidence: { checkpointId: checkpoint ? Number(checkpoint.id) : null, inputIds: inputs.map((row) => Number(row.id)), inputSourceHash: inputSourceHash(inputs),
        factRefs: Array.isArray(checkpoint?.fact_refs_json) ? checkpoint.fact_refs_json : [] },
      requiredChecks, explanation: "旧任务已保留原任务和会话绑定。历史完成记录尚未独立核对，请补充材料或重新确认；核对前保持暂停，不重复写入业务数据。",
    };
    return { plan, run, checkpoint, inputs };
  }
}

function migrationInputMessages(runId: string, inputs: Array<Record<string, unknown>>) {
  return inputs.map((row) => ({ id: "run:" + runId + ":input:" + row.id, role: "user",
    content: String(object(row.content_json).content || ""),
    timestamp: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    ...(Array.isArray(object(row.content_json).images) ? { images: object(row.content_json).images } : {}) }));
}

function inputSourceHash(inputs: Array<Record<string, unknown>>): string {
  return createHash("sha256").update(canonical(inputs.map((row) => ({ id: row.id, content: row.content_json,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at) })))).digest("hex");
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function legacyConstraints(value: unknown): IntentConstraints | undefined {
  const constraints = object(value);
  if (!["allowed", "forbidden", "proposal_only"].includes(String(constraints.writePolicy))) return undefined;
  return { writePolicy: constraints.writePolicy as IntentConstraints["writePolicy"],
    noProfileWrite: constraints.noProfileWrite === true, noResumeWrite: constraints.noResumeWrite === true,
    noReferenceResumeWrite: constraints.noReferenceResumeWrite === true };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).filter((key) => (value as Record<string, unknown>)[key] !== undefined)
    .sort().map((key) => JSON.stringify(key) + ":" + canonical((value as Record<string, unknown>)[key])).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}
