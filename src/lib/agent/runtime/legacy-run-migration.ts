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
  migrationReceipt?: LegacyRunMigrationReceipt;
}

export interface LegacyRunMigrationBatchEntry extends LegacyRunMigrationPlan {
  entryId: string;
  oldHash: string;
  newHash: string;
  rollbackStrategy: "restore_original_payload_paused";
  forwardStrategy: string;
}

export interface LegacyRunMigrationBatch {
  version: 1;
  operation: "apply";
  batchId: string;
  userId: string;
  operatorId: string;
  schemaFrom: "legacy-v0";
  schemaTo: "worker_all-v1";
  approvalScopeHash: string;
  entries: LegacyRunMigrationBatchEntry[];
}

export interface LegacyRunMigrationApproval {
  approvalId: string;
  approvedBy: string;
  operatorId: string;
  scopeHash: string;
  entryIds: string[];
}

export interface LegacyRunMigrationReceipt {
  migrationId: string;
  runId: string;
  userId: string;
  entryId: string;
  batchId: string;
  operatorId: string;
  approvedBy: string;
  approvalId: string;
  approvalScopeHash: string;
  schemaFrom: "legacy-v0";
  schemaTo: "worker_all-v1";
  oldHash: string;
  newHash: string;
  beforeHash: string;
  afterHash: string;
}

interface StoredMigrationReceipt extends LegacyRunMigrationReceipt {
  originalRun: Record<string, unknown>;
  originalInputs: Array<Record<string, unknown>>;
  originalCheckpoint: Record<string, unknown> | null;
  originalConversation: Record<string, unknown> | null;
  originalConversationMemory: Array<Record<string, unknown>>;
  requiredChecks: string[];
}

type BatchMigrationAudit = Omit<LegacyRunMigrationReceipt, "migrationId" | "runId" | "userId" | "beforeHash" | "afterHash" | "schemaFrom" | "schemaTo">;

export interface LegacyRunMigrationBatchResult {
  batchId: string;
  operation: "apply" | "rollback";
  canClaimSuccess: boolean;
  results: Array<{
    entryId: string;
    runId: string;
    status: "applied" | "already_applied" | "preserved" | "rolled_back" | "already_rolled_back" | "blocked";
    readBackVerified?: true;
    receipt?: LegacyRunMigrationReceipt;
    rollbackReceipt?: LegacyRunRollbackReceipt;
    reason?: string;
    forwardStrategy?: string;
    sideEffect?: "committed_requires_review";
  }>;
}

export interface LegacyRunRollbackPlan {
  entryId: string;
  migrationId: string;
  runId: string;
  userId: string;
  conversationId: number | null;
  action: "restore_original_payload_paused" | "already_rolled_back" | "forward_revalidation_required";
  oldHash: string;
  newHash: string;
  blockers: string[];
  rollbackStrategy: "restore_original_payload_paused";
  forwardStrategy: string;
}

export interface LegacyRunRollbackBatch {
  version: 1;
  operation: "rollback";
  batchId: string;
  userId: string;
  operatorId: string;
  schemaFrom: "worker_all-v1";
  schemaTo: "original_payload_paused-v1";
  approvalScopeHash: string;
  entries: LegacyRunRollbackPlan[];
}

export interface LegacyRunRollbackReceipt {
  rollbackId: string;
  migrationId: string;
  runId: string;
  userId: string;
  operatorId: string;
  approvedBy: string;
  approvalId: string;
  approvalScopeHash: string;
  oldHash: string;
  newHash: string;
  afterHash: string;
}

class LegacyRunCommittedReadBackError extends Error {
  readonly sideEffect = "committed_requires_review" as const;
}

export class LegacyRunMigrationService {
  constructor(private readonly withClient: WithClient = withPostgresClient) {}

  async inspect(principal: ExecutionPrincipal, runId: string): Promise<LegacyRunMigrationPlan> {
    return this.withClient(async (client) => (await this.load(client, principal, runId, false)).plan);
  }

  async inspectBatch(principal: ExecutionPrincipal, input: { runIds: string[]; operatorId: string }): Promise<LegacyRunMigrationBatch> {
    const runIds = validatedIds(input.runIds);
    const operatorId = requiredIdentity(input.operatorId, "operator");
    return this.withClient(async (client) => {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      try {
        const entries: LegacyRunMigrationBatchEntry[] = [];
        for (const runId of runIds) {
          const { plan } = await this.load(client, principal, runId, false);
          entries.push({ ...plan, entryId: "legacy-entry:" + digest({ userId: principal.userId, runId, sourceHash: plan.sourceHash }),
            oldHash: plan.sourceHash, newHash: plan.action === "pause_for_revalidation" ? migrationTargetHash(plan) : plan.sourceHash,
            rollbackStrategy: "restore_original_payload_paused", forwardStrategy: "保留同一 Run 的新输入和状态，重新只读检查来源，再由用户确认后向前复核。" });
        }
        const batch = { version: 1 as const, operation: "apply" as const, userId: principal.userId, operatorId,
          schemaFrom: "legacy-v0" as const, schemaTo: "worker_all-v1" as const, entries };
        const manifest = { ...batch, batchId: "legacy-batch:" + digest(batch) };
        await client.query("COMMIT");
        return { ...manifest, approvalScopeHash: digest(manifest) };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async applyBatch(principal: ExecutionPrincipal, manifest: LegacyRunMigrationBatch, approval: LegacyRunMigrationApproval): Promise<LegacyRunMigrationBatchResult> {
    if (manifest.version !== 1 || manifest.operation !== "apply" || manifest.schemaFrom !== "legacy-v0" || manifest.schemaTo !== "worker_all-v1") {
      throw new Error("Legacy migration manifest schema or operation is invalid");
    }
    validateApproval(principal, manifest, approval);
    validatedIds(manifest.entries.map((entry) => entry.runId));
    const results: LegacyRunMigrationBatchResult["results"] = [];
    for (const entry of manifest.entries) {
      try {
        const migrationId = migrationIdentity(principal, entry.runId, entry.entryId, entry.oldHash);
        const existing = await this.withClient((client) => this.readReceipt(client, principal, migrationId));
        if (existing) {
          await this.verifyReceipt(principal, existing);
          results.push({ entryId: entry.entryId, runId: entry.runId, status: "already_applied", readBackVerified: true, receipt: publicReceipt(existing) });
          continue;
        }
        const applied = await this.apply(principal, entry.runId, entry.oldHash, {
          batchId: manifest.batchId, entryId: entry.entryId, operatorId: approval.operatorId, approvedBy: approval.approvedBy,
          approvalId: approval.approvalId, approvalScopeHash: approval.scopeHash, oldHash: entry.oldHash, newHash: entry.newHash,
        });
        results.push({ entryId: entry.entryId, runId: entry.runId,
          status: applied.action === "pause_for_revalidation" ? "applied" : applied.migrationReceipt ? "already_applied" : "preserved", readBackVerified: true, receipt: applied.migrationReceipt });
      } catch (error) {
        results.push({ entryId: entry.entryId, runId: entry.runId, status: "blocked", reason: error instanceof Error ? error.message : "Legacy migration failed",
          forwardStrategy: entry.forwardStrategy, ...(error instanceof LegacyRunCommittedReadBackError ? { sideEffect: error.sideEffect } : {}) });
      }
    }
    return { batchId: manifest.batchId, operation: "apply", canClaimSuccess: results.every((result) => result.readBackVerified === true), results };
  }

  async inspectRollback(principal: ExecutionPrincipal, migrationId: string): Promise<LegacyRunRollbackPlan> {
    return this.withClient(async (client) => {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      try {
        const plan = await this.buildRollbackPlan(client, principal, migrationId);
        await client.query("COMMIT");
        return plan;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async inspectRollbackBatch(principal: ExecutionPrincipal, input: { migrationIds: string[]; operatorId: string }): Promise<LegacyRunRollbackBatch> {
    const migrationIds = validatedIds(input.migrationIds);
    const operatorId = requiredIdentity(input.operatorId, "operator");
    return this.withClient(async (client) => {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      try {
        const entries: LegacyRunRollbackPlan[] = [];
        for (const migrationId of migrationIds) entries.push(await this.buildRollbackPlan(client, principal, migrationId));
        const batch = { version: 1 as const, operation: "rollback" as const, userId: principal.userId, operatorId,
          schemaFrom: "worker_all-v1" as const, schemaTo: "original_payload_paused-v1" as const, entries };
        const manifest = { ...batch, batchId: "legacy-rollback-batch:" + digest(batch) };
        await client.query("COMMIT");
        return { ...manifest, approvalScopeHash: digest(manifest) };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async rollbackBatch(principal: ExecutionPrincipal, manifest: LegacyRunRollbackBatch, approval: LegacyRunMigrationApproval): Promise<LegacyRunMigrationBatchResult> {
    if (manifest.version !== 1 || manifest.operation !== "rollback" || manifest.schemaFrom !== "worker_all-v1" || manifest.schemaTo !== "original_payload_paused-v1") {
      throw new Error("Legacy rollback manifest schema or operation is invalid");
    }
    validateApproval(principal, manifest, approval);
    const results: LegacyRunMigrationBatchResult["results"] = [];
    for (const entry of manifest.entries) {
      try {
        const result = await this.rollback(principal, entry, approval);
        results.push({ entryId: entry.entryId, runId: entry.runId, status: result.replayed ? "already_rolled_back" : "rolled_back",
          readBackVerified: true, rollbackReceipt: result.receipt });
      } catch (error) {
        results.push({ entryId: entry.entryId, runId: entry.runId, status: "blocked", reason: error instanceof Error ? error.message : "Legacy rollback failed",
          forwardStrategy: entry.forwardStrategy, ...(error instanceof LegacyRunCommittedReadBackError ? { sideEffect: error.sideEffect } : {}) });
      }
    }
    return { batchId: manifest.batchId, operation: "rollback", canClaimSuccess: results.every((result) => result.readBackVerified === true), results };
  }

  private async buildRollbackPlan(client: PoolClient, principal: ExecutionPrincipal, migrationId: string): Promise<LegacyRunRollbackPlan> {
    const receipt = await this.readReceipt(client, principal, migrationId);
    if (!receipt) throw new Error("Legacy migration receipt not found for this owner");
    const image = await this.readImage(client, principal, receipt.runId, false);
    const currentHash = imageHash(image);
    const priorRollback = await this.readRollbackReceipt(client, principal, migrationId);
    const safe = currentHash === (priorRollback?.afterHash || receipt.afterHash);
    const targetHash = rollbackTargetHash(receipt);
    return { entryId: "legacy-rollback-entry:" + digest({ migrationId, currentHash }), migrationId, runId: receipt.runId, userId: principal.userId,
      conversationId: receipt.originalRun.session_id == null ? null : Number(receipt.originalRun.session_id),
      action: !safe ? "forward_revalidation_required" : priorRollback ? "already_rolled_back" : "restore_original_payload_paused",
      oldHash: currentHash, newHash: targetHash, blockers: safe ? [] : ["post_migration_state_changed"],
      rollbackStrategy: "restore_original_payload_paused", forwardStrategy: "保留同一 Run 的新输入、状态和会话；停止历史回滚，重新只读检查后按用户确认向前复核。" };
  }

  private async rollback(principal: ExecutionPrincipal, entry: LegacyRunRollbackPlan, approval: LegacyRunMigrationApproval) {
    const applied = await this.withClient(async (client) => {
      await client.query("BEGIN");
      let committed = false;
      try {
        const migration = await this.readReceipt(client, principal, entry.migrationId);
        if (!migration || migration.runId !== entry.runId || migration.userId !== entry.userId || entry.userId !== principal.userId) {
          throw new Error("Legacy rollback binding differs from the reviewed owner and original Run");
        }
        const image = await this.readImage(client, principal, migration.runId, true);
        const priorRollback = await this.readRollbackReceipt(client, principal, entry.migrationId);
        if (priorRollback) {
          if (imageHash(image) !== priorRollback.afterHash || entry.newHash !== rollbackTargetHash(migration)) throw new Error("Legacy rollback has newer state; forward revalidation is required");
          await client.query("COMMIT");
          committed = true;
          return { receipt: priorRollback, migration, replayed: true };
        }
        if (entry.action !== "restore_original_payload_paused" || entry.blockers.length || imageHash(image) !== entry.oldHash
          || entry.oldHash !== migration.afterHash || entry.newHash !== rollbackTargetHash(migration)) {
          throw new Error("Legacy rollback would overwrite newer input or state; keep the same Run and use forward revalidation");
        }
        const original = migration.originalRun;
        if (image.run.status !== "paused" || image.run.owner_id !== null || image.run.user_id !== original.user_id
          || image.run.session_id !== original.session_id || image.run.task_type !== original.task_type || image.run.agent_id !== original.agent_id) {
          throw new Error("Legacy rollback cannot safely restore the original binding or active execution");
        }
        const receipt: LegacyRunRollbackReceipt = { rollbackId: "legacy-rollback:" + digest({ migrationId: migration.migrationId }),
          migrationId: migration.migrationId, runId: migration.runId, userId: principal.userId, operatorId: approval.operatorId,
          approvedBy: approval.approvedBy, approvalId: approval.approvalId, approvalScopeHash: approval.scopeHash,
          oldHash: entry.oldHash, newHash: entry.newHash, afterHash: "" };
        const explanation = "原任务内容已恢复并保留迁移审计。执行保持暂停、旧输入保持已消费；请在同一 Run 内补充材料或明确重新核对，不重新启用旧执行器。";
        const updated = await client.query(`UPDATE agent_runs SET contract_json = $3::jsonb, result_json = $4::jsonb,
          error_json = $5::jsonb, budgets_json = $6::jsonb, policy_versions_json = $7::jsonb,
          legacy = FALSE, runtime_mode = 'worker_all', execution_owner = 'worker', status = 'paused',
          owner_id = NULL, lease_expires_at = NULL, heartbeat_at = NULL, fencing_token = fencing_token + 1,
          snapshot_version = snapshot_version + 1, event_sequence = event_sequence + 1,
          last_observation_json = $8::jsonb, updated_at = now()
          WHERE id = $1 AND user_id = $2 RETURNING snapshot_version, fencing_token, event_sequence`,
        [migration.runId, principal.userId, JSON.stringify(original.contract_json), JSON.stringify(original.result_json),
          JSON.stringify(original.error_json), JSON.stringify(original.budgets_json), JSON.stringify(original.policy_versions_json),
          JSON.stringify({ category: "legacy_rollback_revalidation", userSafeSummary: explanation })]);
        const current = updated.rows[0];
        if (!current) throw new Error("Legacy rollback lost the original Run");
        const messages = migrationInputMessages(migration.runId, migration.originalInputs.filter((row) => row.status !== "rejected"));
        const requiredChecks = migration.requiredChecks;
        await client.query(`INSERT INTO agent_run_checkpoints (run_id, user_id, snapshot_version, fencing_token, boundary,
          context_json, plan_json, budgets_json, fact_refs_json) VALUES ($1, $2, $3, $4, 'legacy_migration_rollback', $5::jsonb, $6::jsonb, $7::jsonb, '[]'::jsonb)`,
        [migration.runId, principal.userId, current.snapshot_version, current.fencing_token,
          JSON.stringify({ messages, conversationMessages: messages, latestInput: messages.at(-1)?.content || "", taskContract: original.contract_json,
            legacyBatchRollbackReceipt: receipt, legacyMigration: { sourceHash: migration.oldHash, requiredChecks, explanation,
              originalBinding: { taskType: original.task_type, agentId: original.agent_id, contract: original.contract_json }, originalResult: original.result_json } }),
          JSON.stringify({ stage: "preflight", legacyRevalidationRequired: true, legacyRequiredChecks: requiredChecks, legacyExplanation: explanation }), JSON.stringify(original.budgets_json)]);
        const { afterHash: pendingAfterHash, ...auditReceipt } = receipt;
        void pendingAfterHash;
        const payload = { type: "run.legacy_migration_rolled_back", status: "paused", ...auditReceipt, explanation,
          schemaFrom: "worker_all-v1", schemaTo: "original_payload_paused-v1", rollbackStrategy: "restore_original_payload_paused" };
        await client.query(`INSERT INTO agent_run_events (run_id, user_id, sequence, event_type, payload_json)
          VALUES ($1, $2, $3, 'run.legacy_migration_rolled_back', $4::jsonb)`, [migration.runId, principal.userId, current.event_sequence, JSON.stringify(payload)]);
        await client.query(`INSERT INTO agent_run_outbox (run_id, user_id, event_sequence, topic, payload_json)
          VALUES ($1, $2, $3, 'run_event', $4::jsonb), ($1, $2, $3, 'run_review', $4::jsonb)`, [migration.runId, principal.userId, current.event_sequence, JSON.stringify(payload)]);
        receipt.afterHash = imageHash(await this.readImage(client, principal, migration.runId, false));
        await client.query(`UPDATE agent_run_checkpoints SET context_json = jsonb_set(context_json, '{legacyBatchRollbackReceipt,afterHash}', to_jsonb($3::text))
          WHERE run_id = $1 AND user_id = $2 AND boundary = 'legacy_migration_rollback' AND context_json #>> '{legacyBatchRollbackReceipt,migrationId}' = $4`,
        [migration.runId, principal.userId, receipt.afterHash, migration.migrationId]);
        await client.query("COMMIT");
        committed = true;
        return { receipt, migration, replayed: false };
      } catch (error) {
        if (!committed) await client.query("ROLLBACK");
        throw error;
      }
    });
    try {
      await this.verifyRollbackReceipt(principal, applied.migration, applied.receipt);
    } catch (error) {
      throw new LegacyRunCommittedReadBackError("Legacy rollback committed; " + (error instanceof Error ? error.message : "independent read-back failed"));
    }
    return applied;
  }

  private async readRollbackReceipt(client: PoolClient, principal: ExecutionPrincipal, migrationId: string): Promise<LegacyRunRollbackReceipt | null> {
    const result = await client.query(`SELECT context_json FROM agent_run_checkpoints WHERE user_id = $1 AND boundary = 'legacy_migration_rollback'
      AND context_json #>> '{legacyBatchRollbackReceipt,migrationId}' = $2 ORDER BY id`, [principal.userId, migrationId]);
    if (result.rows.length > 1) throw new Error("Legacy rollback receipt identity is duplicated");
    if (!result.rows[0]) return null;
    const receipt = object(object(result.rows[0].context_json).legacyBatchRollbackReceipt) as unknown as LegacyRunRollbackReceipt;
    if (receipt.userId !== principal.userId || !receipt.afterHash || receipt.migrationId !== migrationId) throw new Error("Legacy rollback receipt is corrupted");
    return receipt;
  }

  private async verifyRollbackReceipt(principal: ExecutionPrincipal, original: StoredMigrationReceipt, expected: LegacyRunRollbackReceipt) {
    await this.withClient(async (client) => {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      try {
        const migration = await this.readReceipt(client, principal, expected.migrationId);
        const rollback = await this.readRollbackReceipt(client, principal, expected.migrationId);
        const image = await this.readImage(client, principal, expected.runId, false);
        if (!migration || canonical(migration) !== canonical(original) || !rollback || canonical(rollback) !== canonical(expected)
          || imageHash(image) !== expected.afterHash || image.run.status !== "paused" || image.run.execution_owner !== "worker"
          || canonical(image.run.contract_json) !== canonical(original.originalRun.contract_json)
          || canonical(image.run.result_json) !== canonical(original.originalRun.result_json)) {
          throw new Error("Legacy rollback committed but independent read-back failed; keep the same Run paused and use forward review");
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async apply(principal: ExecutionPrincipal, runId: string, expectedSourceHash: string, audit?: BatchMigrationAudit): Promise<LegacyRunMigrationPlan> {
    if (!/^[a-f0-9]{64}$/.test(expectedSourceHash)) throw new Error("Legacy migration requires a reviewed source hash");
    const applied = await this.withClient(async (client) => {
      await client.query("BEGIN");
      let committed = false;
      try {
        const { plan, run, checkpoint, inputs } = await this.load(client, principal, runId, true);
        const originalImage = audit && plan.action === "pause_for_revalidation" ? await this.readImage(client, principal, runId, true) : null;
        if (plan.action === "already_migrated" && object(checkpoint?.context_json).legacyMigration
          && object(object(checkpoint?.context_json).legacyMigration).sourceHash === expectedSourceHash) {
          await client.query("COMMIT");
          committed = true;
          const originalPlan = object(checkpoint?.context_json).legacyMigration as LegacyRunMigrationPlan;
          const migrationReceipt = audit ? await this.readReceipt(client, principal, migrationIdentity(principal, runId, audit.entryId, expectedSourceHash)) : null;
          return { plan, verificationPlan: originalPlan, migrationReceipt };
        }
        if (plan.sourceHash !== expectedSourceHash) throw new Error("Legacy Run changed after migration inspection");
        if (audit && (audit.oldHash !== expectedSourceHash || audit.newHash !== (plan.action === "pause_for_revalidation" ? migrationTargetHash(plan) : plan.sourceHash))) {
          throw new Error("Legacy migration target differs from the approved manifest");
        }
        if (plan.action !== "pause_for_revalidation") {
          await client.query("COMMIT");
          committed = true;
          return { plan, verificationPlan: null, migrationReceipt: null };
        }
        const migrationReceipt: StoredMigrationReceipt | null = audit && originalImage ? {
          ...audit, migrationId: migrationIdentity(principal, runId, audit.entryId, expectedSourceHash), runId, userId: principal.userId,
          schemaFrom: "legacy-v0", schemaTo: "worker_all-v1", beforeHash: imageHash(originalImage), afterHash: "",
          originalRun: originalImage.run, originalInputs: originalImage.inputs, originalCheckpoint: checkpoint ? snapshot(checkpoint) : null,
          originalConversation: originalImage.conversation, originalConversationMemory: originalImage.conversationMemory, requiredChecks: plan.requiredChecks,
        } : null;
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
            taskContract: plan.effectiveContract, legacyMigration: { ...plan, originalCheckpoint: checkpoint || null, originalResult: run.result_json },
            ...(migrationReceipt ? { legacyBatchReceipt: migrationReceipt } : {}) }),
          JSON.stringify({ stage: "preflight", legacyRevalidationRequired: true, legacyRequiredChecks: plan.requiredChecks,
            legacyExplanation: plan.explanation }), JSON.stringify(run.budgets_json || {}), "[]"]);
        const payload = { type: "run.legacy_migrated", status: "paused", sourceHash: plan.sourceHash,
          originalTaskType: plan.originalBinding.taskType, checkpointId: plan.evidence.checkpointId,
          requiredChecks: plan.requiredChecks, explanation: plan.explanation };
        if (migrationReceipt) Object.assign(payload, { migrationId: migrationReceipt.migrationId, entryId: audit!.entryId,
          operatorId: audit!.operatorId, approvedBy: audit!.approvedBy, approvalId: audit!.approvalId, approvalScopeHash: audit!.approvalScopeHash,
          schemaFrom: migrationReceipt.schemaFrom, schemaTo: migrationReceipt.schemaTo, oldHash: audit!.oldHash, newHash: audit!.newHash,
          rollbackStrategy: "restore_original_payload_paused" });
        await client.query(`
          INSERT INTO agent_run_events (run_id, user_id, sequence, event_type, schema_version, payload_json)
          VALUES ($1, $2, $3, 'run.legacy_migrated', 1, $4::jsonb)
        `, [runId, principal.userId, current.event_sequence, JSON.stringify(payload)]);
        await client.query(`
          INSERT INTO agent_run_outbox (run_id, user_id, event_sequence, topic, schema_version, payload_json)
          VALUES ($1, $2, $3, 'run_event', 1, $4::jsonb), ($1, $2, $3, 'run_review', 1, $4::jsonb)
        `, [runId, principal.userId, current.event_sequence, JSON.stringify(payload)]);
        if (migrationReceipt) {
          migrationReceipt.afterHash = imageHash(await this.readImage(client, principal, runId, false));
          await client.query(`UPDATE agent_run_checkpoints SET context_json = jsonb_set(context_json, '{legacyBatchReceipt,afterHash}', to_jsonb($3::text))
            WHERE run_id = $1 AND user_id = $2 AND boundary = 'legacy_migration' AND context_json #>> '{legacyBatchReceipt,migrationId}' = $4`,
          [runId, principal.userId, migrationReceipt.afterHash, migrationReceipt.migrationId]);
        }
        await client.query("COMMIT");
        committed = true;
        return { plan: { ...plan, status: "paused" }, verificationPlan: plan, migrationReceipt };
      } catch (error) {
        if (!committed) await client.query("ROLLBACK");
        throw error;
      }
    });
    if (!applied.verificationPlan) {
      const current = await this.inspect(principal, runId);
      if (current.sourceHash !== expectedSourceHash) throw new Error("Legacy preservation read-back failed");
      return { ...applied.plan, readBackVerified: true };
    }
    const migrationReceipt = "migrationReceipt" in applied ? applied.migrationReceipt : null;
    try {
      await this.verify(principal, applied.verificationPlan);
      if (migrationReceipt) await this.verifyReceipt(principal, migrationReceipt);
    } catch (error) {
      throw new LegacyRunCommittedReadBackError("Legacy migration committed; " + (error instanceof Error ? error.message : "independent read-back failed"));
    }
    return { ...applied.plan, readBackVerified: true, ...(migrationReceipt ? { migrationReceipt: publicReceipt(migrationReceipt) } : {}) };
  }

  private async readReceipt(client: PoolClient, principal: ExecutionPrincipal, migrationId: string): Promise<StoredMigrationReceipt | null> {
    const result = await client.query(`SELECT context_json FROM agent_run_checkpoints WHERE user_id = $1 AND boundary = 'legacy_migration'
      AND context_json #>> '{legacyBatchReceipt,migrationId}' = $2 ORDER BY id`, [principal.userId, migrationId]);
    if (result.rows.length > 1) throw new Error("Legacy migration receipt identity is duplicated");
    if (!result.rows[0]) return null;
    const receipt = object(object(result.rows[0].context_json).legacyBatchReceipt) as unknown as StoredMigrationReceipt;
    if (receipt.userId !== principal.userId || receipt.migrationId !== migrationId || !receipt.runId || !receipt.afterHash
      || !Array.isArray(receipt.originalInputs) || !Array.isArray(receipt.originalConversationMemory)
      || !Array.isArray(receipt.requiredChecks) || !receipt.originalRun) throw new Error("Legacy migration receipt is corrupted");
    return receipt;
  }

  private async verifyReceipt(principal: ExecutionPrincipal, expected: StoredMigrationReceipt): Promise<void> {
    await this.withClient(async (client) => {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      try {
        const receipt = await this.readReceipt(client, principal, expected.migrationId);
        if (!receipt || canonical(receipt) !== canonical(expected) || imageHash(await this.readImage(client, principal, receipt.runId, false)) !== receipt.afterHash) {
          throw new Error("Legacy migration independent read-back failed or new state requires forward revalidation");
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  private async readImage(client: PoolClient, principal: ExecutionPrincipal, runId: string, lock: boolean): Promise<MigrationImage> {
    const result = await client.query("SELECT * FROM agent_runs WHERE id = $1 AND user_id = $2" + (lock ? " FOR UPDATE" : ""), [runId, principal.userId]);
    if (!result.rows[0]) throw new Error("Agent Run not found");
    const run = result.rows[0] as Record<string, unknown>;
    const inputs = await client.query("SELECT * FROM agent_run_inputs WHERE run_id = $1 AND user_id = $2 ORDER BY id" + (lock ? " FOR UPDATE" : ""), [runId, principal.userId]);
    const checkpoints = await client.query("SELECT * FROM agent_run_checkpoints WHERE run_id = $1 AND user_id = $2 ORDER BY id" + (lock ? " FOR UPDATE" : ""), [runId, principal.userId]);
    const gates = await client.query("SELECT * FROM agent_run_gates WHERE run_id = $1 AND user_id = $2 ORDER BY id" + (lock ? " FOR UPDATE" : ""), [runId, principal.userId]);
    const attempts = await client.query("SELECT * FROM agent_tool_attempts WHERE run_id = $1 AND user_id = $2 ORDER BY id" + (lock ? " FOR UPDATE" : ""), [runId, principal.userId]);
    const events = await client.query("SELECT * FROM agent_run_events WHERE run_id = $1 AND user_id = $2 ORDER BY sequence" + (lock ? " FOR UPDATE" : ""), [runId, principal.userId]);
    const outbox = await client.query("SELECT * FROM agent_run_outbox WHERE run_id = $1 AND user_id = $2 ORDER BY id" + (lock ? " FOR UPDATE" : ""), [runId, principal.userId]);
    const conversation = run.session_id == null ? null : await client.query("SELECT * FROM sessions WHERE id = $1 AND user_id = $2" + (lock ? " FOR UPDATE" : ""), [run.session_id, principal.userId]);
    const conversationMemory = await this.loadConversationMemory(client, principal, run.session_id, lock);
    return snapshot({ run, inputs: inputs.rows, checkpoints: checkpoints.rows, gates: gates.rows, attempts: attempts.rows,
      events: events.rows, outbox: outbox.rows, conversation: conversation?.rows[0] || null, conversationMemory });
  }

  private async loadConversationMemory(client: PoolClient, principal: ExecutionPrincipal, conversationId: unknown, lock: boolean): Promise<Array<Record<string, unknown>>> {
    if (conversationId === null || conversationId === undefined) return [];
    const rows = await client.query(`SELECT * FROM session_memory WHERE user_id = $1 AND session_id = $2
      AND summary_type = 'execution_conversation' ORDER BY id` + (lock ? " FOR UPDATE" : ""), [principal.userId, conversationId]);
    return rows.rows;
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
      ORDER BY snapshot_version DESC, id DESC LIMIT 1` + (lock ? " FOR UPDATE" : ""), [runId, principal.userId]);
    const inputRows = await client.query("SELECT * FROM agent_run_inputs WHERE run_id = $1 AND user_id = $2 ORDER BY id ASC" + (lock ? " FOR UPDATE" : ""), [runId, principal.userId]);
    const checkpoint = checkpoints.rows[0] as Record<string, unknown> | undefined;
    const allInputs = inputRows.rows as Array<Record<string, unknown>>;
    const inputs = allInputs.filter((row) => row.status !== "rejected");
    const sessionId = run.session_id === null || run.session_id === undefined ? null : Number(run.session_id);
    const session = sessionId === null ? null : await client.query("SELECT * FROM sessions WHERE id = $1 AND user_id = $2" + (lock ? " FOR UPDATE" : ""), [sessionId, principal.userId]);
    const conversationMemory = await this.loadConversationMemory(client, principal, sessionId, lock);
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
      effectiveContract.createdAt = typeof priorContract.createdAt === "string" ? priorContract.createdAt
        : run.created_at instanceof Date ? run.created_at.toISOString() : String(run.created_at);
      if (typeof priorContract.baseVersion === "string") effectiveContract.baseVersion = priorContract.baseVersion;
      if (typeof priorContract.baseHash === "string") effectiveContract.baseHash = priorContract.baseHash;
    }
    const sourceHash = createHash("sha256").update(JSON.stringify({ run, checkpoint, inputs: allInputs, session: session?.rows[0] || null, conversationMemory })).digest("hex");
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

interface MigrationImage {
  run: Record<string, unknown>;
  inputs: Array<Record<string, unknown>>;
  checkpoints: Array<Record<string, unknown>>;
  gates: Array<Record<string, unknown>>;
  attempts: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  outbox: Array<Record<string, unknown>>;
  conversation: Record<string, unknown> | null;
  conversationMemory: Array<Record<string, unknown>>;
}

function snapshot<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value));
}

function imageHash(image: MigrationImage): string {
  const normalized = snapshot(image);
  for (const checkpoint of normalized.checkpoints) {
    const context = object(checkpoint.context_json);
    for (const key of ["legacyBatchReceipt", "legacyBatchRollbackReceipt"]) {
      const receipt = object(context[key]);
      delete receipt.afterHash;
    }
  }
  return digest(normalized);
}

function publicReceipt(receipt: StoredMigrationReceipt): LegacyRunMigrationReceipt {
  const { originalRun, originalInputs, originalCheckpoint, originalConversation, originalConversationMemory, requiredChecks, ...metadata } = receipt;
  void originalRun; void originalInputs; void originalCheckpoint; void originalConversation; void originalConversationMemory; void requiredChecks;
  return metadata;
}

function migrationIdentity(principal: ExecutionPrincipal, runId: string, entryId: string, oldHash: string): string {
  return "legacy-migration:" + digest({ userId: principal.userId, runId, entryId, oldHash });
}

function rollbackTargetHash(receipt: StoredMigrationReceipt): string {
  return digest({ schema: "original_payload_paused-v1", migrationId: receipt.migrationId, userId: receipt.userId, runId: receipt.runId,
    originalBinding: { taskType: receipt.originalRun.task_type, agentId: receipt.originalRun.agent_id, conversationId: receipt.originalRun.session_id },
    contract: receipt.originalRun.contract_json, result: receipt.originalRun.result_json, error: receipt.originalRun.error_json,
    status: "paused", executionOwner: "worker", inputSourceHash: inputSourceHash(receipt.originalInputs) });
}

function validateApproval(principal: ExecutionPrincipal, manifest: { userId: string; operatorId: string; approvalScopeHash: string; entries: Array<{ entryId: string }> }, approval: LegacyRunMigrationApproval) {
  const { approvalScopeHash, ...content } = manifest;
  if (principal.userId !== manifest.userId || digest(content) !== approvalScopeHash) throw new Error("Legacy migration manifest is changed or belongs to another owner");
  requiredIdentity(approval.approvalId, "approval identity"); requiredIdentity(approval.approvedBy, "approver");
  if (approval.operatorId !== manifest.operatorId || approval.scopeHash !== approvalScopeHash
    || canonical(validatedIds(approval.entryIds)) !== canonical(validatedIds(manifest.entries.map((entry) => entry.entryId)))) {
    throw new Error("Legacy migration approval does not match the exact reviewed scope");
  }
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(JSON.parse(JSON.stringify(value)))).digest("hex");
}

function validatedIds(ids: string[]): string[] {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 || ids.some((id) => typeof id !== "string" || !id.trim())
    || new Set(ids).size !== ids.length) throw new Error("Legacy migration scope requires 1 to 100 unique stable IDs");
  return [...ids].sort();
}

function requiredIdentity(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) throw new Error("Legacy migration requires an explicit " + label);
  return value.trim();
}

function migrationTargetHash(plan: LegacyRunMigrationPlan): string {
  return digest({ schema: "worker_all-v1", runId: plan.runId, userId: plan.userId, conversationId: plan.conversationId,
    originalBinding: plan.originalBinding, effectiveContract: plan.effectiveContract, status: "paused",
    inputSourceHash: plan.evidence.inputSourceHash, requiredChecks: plan.requiredChecks });
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
