import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { LegacyRunMigrationService } from "@/lib/agent/runtime/legacy-run-migration";
import { buildContractForTask } from "@/lib/agent/run-admission";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PostgresSessionMemoryAdapter } from "@/lib/memory/postgres-memory";

const postgresAccess = vi.hoisted(() => ({ withClient: vi.fn() }));
vi.mock("@/lib/postgres", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/postgres")>(),
  withPostgresClient: postgresAccess.withClient,
}));

const connectionString = process.env.SPEC40_RUNTIME_DATABASE_URL;
const userId = "spec40-third-runtime-" + randomUUID();
const principal = { userId };
const operatorId = "spec40-maintainer";
let pool: Pool;
let service: LegacyRunMigrationService;
const withClient = async <Result>(operation: (client: PoolClient) => Promise<Result>) => {
  const client = await pool.connect();
  try { return await operation(client); } finally { client.release(); }
};

describe.skipIf(!connectionString)("legacy Run batch migration and safe rollback in isolated PostgreSQL", () => {
  beforeAll(async () => {
    const target = new URL(connectionString!);
    if (target.hostname !== "127.0.0.1" || target.port !== "55440" || target.pathname !== "/spec40_runtime") {
      throw new Error("Legacy batch fixtures require the dedicated local spec40_runtime database");
    }
    pool = new Pool({ connectionString, max: 1 });
    postgresAccess.withClient.mockImplementation(withClient);
    await pool.query("INSERT INTO users (id, username, password_hash, display_name, status) VALUES ($1, $1, 'fixture', 'Legacy batch fixture', 'active')", [userId]);
    service = new LegacyRunMigrationService(withClient);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM agent_runs WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM session_memory WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    await pool.end();
  });

  async function legacyRun(status = "waiting_user") {
    const session = await pool.query("INSERT INTO sessions (user_id, title, messages_json) VALUES ($1, 'Legacy migration source', $2::jsonb) RETURNING id", [userId,
      JSON.stringify([{ role: "user", content: "仅整理Offer事实：月薪20K", itemId: "legacy-source" }])]);
    const conversationId = Number(session.rows[0].id);
    const runId = "spec40-third-legacy-" + randomUUID();
    const contract = buildContractForTask("offer_evaluation", "只整理 Offer 事实，不保存报告：月薪20K");
    await pool.query(`INSERT INTO agent_runs (id, user_id, session_id, task_type, agent_id, status, contract_json, result_json)
      VALUES ($1, $2, $3, 'offer_evaluation', 'offer', $4, $5::jsonb, '{"modelClaim":"历史已保存声明"}'::jsonb)`,
    [runId, userId, conversationId, status, JSON.stringify(contract)]);
    await pool.query("INSERT INTO agent_run_inputs (run_id, user_id, request_id, content_json) VALUES ($1, $2, $3, $4::jsonb)",
      [runId, userId, randomUUID(), JSON.stringify({ content: "只整理 Offer 事实，不保存报告：月薪20K", images: ["fixture-original-image"] })]);
    return { runId, conversationId, contract: JSON.parse(JSON.stringify(contract)) };
  }

  function approval(manifest: { operatorId: string; approvalScopeHash: string; entries: Array<{ entryId: string }> }) {
    return { approvalId: "synthetic-review-" + randomUUID(), approvedBy: "synthetic-fixture-reviewer", operatorId: manifest.operatorId,
      scopeHash: manifest.approvalScopeHash, entryIds: manifest.entries.map((entry) => entry.entryId) };
  }

  it("exports a stable, owner-bound, read-only impact manifest with exact hashes, operator and rollback strategy", async () => {
    const first = await legacyRun();
    const terminal = await legacyRun("succeeded");
    const before = (await pool.query("SELECT row_to_json(run) AS snapshot FROM agent_runs run WHERE id = $1", [first.runId])).rows[0].snapshot;
    const manifest = await service.inspectBatch(principal, { operatorId, runIds: [terminal.runId, first.runId] });
    const repeated = await service.inspectBatch(principal, { operatorId, runIds: [first.runId, terminal.runId] });
    expect(repeated).toEqual(manifest);
    expect(manifest).toMatchObject({ version: 1, userId, operatorId, operation: "apply", schemaFrom: "legacy-v0", schemaTo: "worker_all-v1" });
    expect(manifest.approvalScopeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.entries.find((entry) => entry.runId === first.runId)).toMatchObject({ userId, conversationId: first.conversationId,
      action: "pause_for_revalidation", oldHash: expect.stringMatching(/^[a-f0-9]{64}$/), newHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      rollbackStrategy: "restore_original_payload_paused", forwardStrategy: expect.stringContaining("同一 Run") });
    expect(manifest.entries.find((entry) => entry.runId === terminal.runId)?.action).toBe("preserve_terminal");
    expect((await pool.query("SELECT row_to_json(run) AS snapshot FROM agent_runs run WHERE id = $1", [first.runId])).rows[0].snapshot).toEqual(before);
    expect((await pool.query("SELECT count(*) AS count FROM agent_run_checkpoints WHERE run_id = $1", [first.runId])).rows[0].count).toBe("0");
    await expect(service.inspectBatch({ userId: "foreign-owner" }, { operatorId, runIds: [first.runId] })).rejects.toThrow("not found");
  });

  it("binds apply to the exact reviewed scope, persists original snapshots and independently reads back one idempotent migration", async () => {
    const fixture = await legacyRun();
    const manifest = await service.inspectBatch(principal, { operatorId, runIds: [fixture.runId] });
    const approved = approval(manifest);
    await expect(service.applyBatch(principal, manifest, { ...approved, entryIds: ["unapproved-entry"] })).rejects.toThrow(/scope/);
    await expect(service.applyBatch(principal, { ...manifest, entries: [{ ...manifest.entries[0], newHash: "0".repeat(64) }] }, approved)).rejects.toThrow(/manifest/);
    expect((await pool.query("SELECT legacy FROM agent_runs WHERE id = $1", [fixture.runId])).rows[0].legacy).toBe(true);
    const result = await service.applyBatch(principal, manifest, approved);
    expect(result, JSON.stringify(result)).toMatchObject({ canClaimSuccess: true, results: [{ runId: fixture.runId, status: "applied", readBackVerified: true,
      receipt: { operatorId, approvedBy: approved.approvedBy, approvalId: approved.approvalId, approvalScopeHash: manifest.approvalScopeHash,
        oldHash: manifest.entries[0].oldHash, newHash: manifest.entries[0].newHash, beforeHash: expect.stringMatching(/^[a-f0-9]{64}$/), afterHash: expect.stringMatching(/^[a-f0-9]{64}$/) } }] });
    const stored = (await pool.query("SELECT context_json FROM agent_run_checkpoints WHERE run_id = $1 AND boundary = 'legacy_migration'", [fixture.runId])).rows[0].context_json.legacyBatchReceipt;
    expect(stored.originalRun).toMatchObject({ id: fixture.runId, user_id: userId, session_id: String(fixture.conversationId),
      status: "waiting_user", legacy: true, result_json: { modelClaim: "历史已保存声明" } });
    expect(stored.originalInputs).toEqual(expect.arrayContaining([expect.objectContaining({ status: "pending", content_json: { content: "只整理 Offer 事实，不保存报告：月薪20K", images: ["fixture-original-image"] } })]));
    const replay = await service.applyBatch(principal, manifest, approved);
    expect(replay).toMatchObject({ canClaimSuccess: true, results: [{ status: "already_applied", readBackVerified: true }] });
    expect((await pool.query("SELECT count(*) AS count FROM agent_run_events WHERE run_id = $1 AND event_type = 'run.legacy_migrated'", [fixture.runId])).rows[0].count).toBe("1");
  });

  it("reports partial batch progress honestly and never changes a stale reviewed Run", async () => {
    const first = await legacyRun();
    const stale = await legacyRun();
    const manifest = await service.inspectBatch(principal, { operatorId, runIds: [first.runId, stale.runId] });
    await pool.query("UPDATE agent_runs SET snapshot_version = snapshot_version + 1 WHERE id = $1", [stale.runId]);
    const result = await service.applyBatch(principal, manifest, approval(manifest));
    expect(result.canClaimSuccess).toBe(false);
    expect(result.results.find((entry) => entry.runId === first.runId), JSON.stringify(result)).toMatchObject({ status: "applied", readBackVerified: true });
    expect(result.results.find((entry) => entry.runId === stale.runId)).toMatchObject({ status: "blocked", forwardStrategy: expect.stringContaining("同一 Run") });
    expect((await pool.query("SELECT legacy, status FROM agent_runs WHERE id = $1", [stale.runId])).rows[0]).toEqual({ legacy: true, status: "waiting_user" });
  });

  it("rolls original payload back in place while preserving consumed source inputs, historical declarations, audit and safe Worker ownership", async () => {
    const fixture = await legacyRun();
    const manifest = await service.inspectBatch(principal, { operatorId, runIds: [fixture.runId] });
    const migrated = await service.applyBatch(principal, manifest, approval(manifest));
    const receipt = migrated.results[0].receipt!;
    const migratedRow = (await pool.query("SELECT fencing_token, snapshot_version FROM agent_runs WHERE id = $1", [fixture.runId])).rows[0];
    const rollback = await service.inspectRollbackBatch(principal, { operatorId, migrationIds: [receipt.migrationId] });
    expect(rollback.entries[0]).toMatchObject({ runId: fixture.runId, action: "restore_original_payload_paused", oldHash: receipt.afterHash,
      newHash: expect.stringMatching(/^[a-f0-9]{64}$/), blockers: [] });
    const approved = approval(rollback);
    expect(await service.rollbackBatch(principal, rollback, approved)).toMatchObject({ canClaimSuccess: true,
      results: [{ runId: fixture.runId, status: "rolled_back", readBackVerified: true }] });
    const row = (await pool.query("SELECT * FROM agent_runs WHERE id = $1", [fixture.runId])).rows[0];
    expect(row).toMatchObject({ id: fixture.runId, user_id: userId, session_id: String(fixture.conversationId), task_type: "offer_evaluation",
      agent_id: "offer", contract_json: fixture.contract, result_json: { modelClaim: "历史已保存声明" }, legacy: false,
      runtime_mode: "worker_all", execution_owner: "worker", status: "paused", owner_id: null, lease_expires_at: null });
    expect(Number(row.fencing_token)).toBeGreaterThan(Number(migratedRow.fencing_token));
    expect(Number(row.snapshot_version)).toBeGreaterThan(Number(migratedRow.snapshot_version));
    expect((await pool.query("SELECT status, content_json FROM agent_run_inputs WHERE run_id = $1", [fixture.runId])).rows).toEqual([
      { status: "consumed", content_json: { content: "只整理 Offer 事实，不保存报告：月薪20K", images: ["fixture-original-image"] } },
    ]);
    expect((await pool.query("SELECT count(*) AS count FROM agent_run_checkpoints WHERE run_id = $1 AND boundary = 'legacy_migration'", [fixture.runId])).rows[0].count).toBe("1");
    expect(await service.rollbackBatch(principal, rollback, approved)).toMatchObject({ canClaimSuccess: true, results: [{ status: "already_rolled_back", readBackVerified: true }] });
    expect((await pool.query("SELECT count(*) AS count FROM agent_run_events WHERE run_id = $1 AND event_type = 'run.legacy_migration_rolled_back'", [fixture.runId])).rows[0].count).toBe("1");
  });

  it.each(["input", "state", "conversation", "checkpoint"])("refuses rollback over newer %s and retains a readable original receipt for forward recovery", async (change) => {
    const fixture = await legacyRun();
    const manifest = await service.inspectBatch(principal, { operatorId, runIds: [fixture.runId] });
    const migrated = await service.applyBatch(principal, manifest, approval(manifest));
    const migrationId = migrated.results[0].receipt!.migrationId;
    if (change === "input") await pool.query("INSERT INTO agent_run_inputs (run_id, user_id, request_id, content_json) VALUES ($1, $2, $3, '{\"content\":\"新用户材料不可覆盖\"}'::jsonb)", [fixture.runId, userId, randomUUID()]);
    if (change === "state") await pool.query("UPDATE agent_runs SET status = 'waiting_user', snapshot_version = snapshot_version + 1 WHERE id = $1", [fixture.runId]);
    if (change === "conversation") await pool.query("UPDATE sessions SET messages_json = messages_json || '[{\"role\":\"user\",\"content\":\"新会话输入\"}]'::jsonb WHERE id = $1", [fixture.conversationId]);
    if (change === "checkpoint") await pool.query("INSERT INTO agent_run_checkpoints (run_id, user_id, snapshot_version, fencing_token, boundary) VALUES ($1, $2, 99, 99, 'newer_worker_state')", [fixture.runId, userId]);
    const before = (await pool.query("SELECT row_to_json(run) AS snapshot FROM agent_runs run WHERE id = $1", [fixture.runId])).rows[0].snapshot;
    const rollback = await service.inspectRollbackBatch(principal, { operatorId, migrationIds: [migrationId] });
    expect(rollback.entries[0]).toMatchObject({ action: "forward_revalidation_required", blockers: ["post_migration_state_changed"],
      forwardStrategy: expect.stringContaining("同一 Run") });
    expect(await service.rollbackBatch(principal, rollback, approval(rollback))).toMatchObject({ canClaimSuccess: false, results: [{ status: "blocked" }] });
    expect((await pool.query("SELECT row_to_json(run) AS snapshot FROM agent_runs run WHERE id = $1", [fixture.runId])).rows[0].snapshot).toEqual(before);
    expect((await pool.query("SELECT count(*) AS count FROM agent_run_checkpoints WHERE run_id = $1 AND boundary = 'legacy_migration_rollback'", [fixture.runId])).rows[0].count).toBe("0");
    expect((await pool.query("SELECT context_json #>> '{legacyBatchReceipt,migrationId}' AS id FROM agent_run_checkpoints WHERE run_id = $1 AND boundary = 'legacy_migration'", [fixture.runId])).rows[0].id).toBe(migrationId);
  });

  it("rechecks newer input accepted after rollback review without consuming or overwriting it", async () => {
    const fixture = await legacyRun();
    const manifest = await service.inspectBatch(principal, { operatorId, runIds: [fixture.runId] });
    const migrated = await service.applyBatch(principal, manifest, approval(manifest));
    const rollback = await service.inspectRollbackBatch(principal, { operatorId, migrationIds: [migrated.results[0].receipt!.migrationId] });
    await pool.query("INSERT INTO agent_run_inputs (run_id, user_id, request_id, content_json) VALUES ($1, $2, $3, '{\"content\":\"review之后的新输入\"}'::jsonb)", [fixture.runId, userId, randomUUID()]);
    expect(await service.rollbackBatch(principal, rollback, approval(rollback))).toMatchObject({ canClaimSuccess: false, results: [{ status: "blocked" }] });
    expect((await pool.query("SELECT status FROM agent_run_inputs WHERE run_id = $1 AND content_json->>'content' = 'review之后的新输入'", [fixture.runId])).rows[0].status).toBe("pending");
  });

  it("serializes competing apply calls into one migration and one independently verified replay", async () => {
    const fixture = await legacyRun();
    const manifest = await service.inspectBatch(principal, { operatorId, runIds: [fixture.runId] });
    const approved = approval(manifest);
    const results = await Promise.all([service.applyBatch(principal, manifest, approved), service.applyBatch(principal, manifest, approved)]);
    expect(results.every((result) => result.canClaimSuccess)).toBe(true);
    expect(results.map((result) => result.results[0].status).sort()).toEqual(["already_applied", "applied"]);
    expect((await pool.query("SELECT count(*) AS count FROM agent_run_checkpoints WHERE run_id = $1 AND boundary = 'legacy_migration'", [fixture.runId])).rows[0].count).toBe("1");
  });

  it("retains task-binding review requirements after restoring an unknown legacy binding", async () => {
    const fixture = await legacyRun();
    await pool.query("UPDATE agent_runs SET task_type = 'unsupported_legacy_task', agent_id = 'unknown_agent' WHERE id = $1", [fixture.runId]);
    const manifest = await service.inspectBatch(principal, { operatorId, runIds: [fixture.runId] });
    expect(manifest.entries[0].requiredChecks).toContain("task_binding_review");
    const migrated = await service.applyBatch(principal, manifest, approval(manifest));
    const rollback = await service.inspectRollbackBatch(principal, { operatorId, migrationIds: [migrated.results[0].receipt!.migrationId] });
    expect(await service.rollbackBatch(principal, rollback, approval(rollback))).toMatchObject({ canClaimSuccess: true });
    const checkpoint = (await pool.query("SELECT context_json, plan_json FROM agent_run_checkpoints WHERE run_id = $1 AND boundary = 'legacy_migration_rollback'", [fixture.runId])).rows[0];
    expect(checkpoint.plan_json).toMatchObject({ legacyRevalidationRequired: true, legacyRequiredChecks: expect.arrayContaining(["task_binding_review"]) });
    expect(checkpoint.context_json.modelCompletion).toBeUndefined();
  });

  it("protects rejected original inputs in the reviewed source hash without using them as task facts", async () => {
    const fixture = await legacyRun();
    await pool.query("INSERT INTO agent_run_inputs (run_id, user_id, request_id, content_json, status) VALUES ($1, $2, $3, '{\"content\":\"拒绝的历史输入\"}'::jsonb, 'rejected')", [fixture.runId, userId, randomUUID()]);
    const manifest = await service.inspectBatch(principal, { operatorId, runIds: [fixture.runId] });
    expect(manifest.entries[0].evidence.inputIds).toHaveLength(1);
    await pool.query("UPDATE agent_run_inputs SET content_json = '{\"content\":\"被变更的拒绝输入\"}'::jsonb WHERE run_id = $1 AND status = 'rejected'", [fixture.runId]);
    expect(await service.applyBatch(principal, manifest, approval(manifest))).toMatchObject({ canClaimSuccess: false, results: [{ status: "blocked" }] });
    expect((await pool.query("SELECT legacy FROM agent_runs WHERE id = $1", [fixture.runId])).rows[0].legacy).toBe(true);
  });

  it("refuses apply when the owner-bound source conversation changes after the impact review", async () => {
    const fixture = await legacyRun();
    const manifest = await service.inspectBatch(principal, { operatorId, runIds: [fixture.runId] });
    await pool.query("UPDATE sessions SET messages_json = messages_json || '[{\"role\":\"user\",\"content\":\"审核后的真实续轮\"}]'::jsonb WHERE id = $1", [fixture.conversationId]);
    expect(await service.applyBatch(principal, manifest, approval(manifest))).toMatchObject({ canClaimSuccess: false, results: [{ status: "blocked" }] });
    expect((await pool.query("SELECT legacy, status FROM agent_runs WHERE id = $1", [fixture.runId])).rows[0]).toEqual({ legacy: true, status: "waiting_user" });
  });

  it.each(["initial_insert", "existing_update"])("refuses apply after the real Worker session memory adapter performs %s without changing the legacy session row", async (change) => {
    const fixture = await legacyRun();
    const adapter = new PostgresSessionMemoryAdapter();
    const identity = { userId, conversationId: fixture.conversationId };
    if (change === "existing_update") await adapter.append(identity, [{ id: "prior-durable", role: "assistant", content: "原持久回复", createdAt: "2026-10-14T00:00:00.000Z" }]);
    const before = (await pool.query("SELECT row_to_json(session) AS snapshot FROM sessions session WHERE id = $1", [fixture.conversationId])).rows[0].snapshot;
    const manifest = await service.inspectBatch(principal, { operatorId, runIds: [fixture.runId] });
    await adapter.append(identity, [{ id: "review-new-turn", role: "user", content: "审核后新增的持久会话", createdAt: "2026-10-14T01:00:00.000Z" }]);
    expect((await pool.query("SELECT row_to_json(session) AS snapshot FROM sessions session WHERE id = $1", [fixture.conversationId])).rows[0].snapshot).toEqual(before);
    expect(await service.applyBatch(principal, manifest, approval(manifest))).toMatchObject({ canClaimSuccess: false, results: [{ status: "blocked" }] });
    expect((await pool.query("SELECT legacy, status FROM agent_runs WHERE id = $1", [fixture.runId])).rows[0]).toEqual({ legacy: true, status: "waiting_user" });
    expect(await adapter.load(identity)).toEqual(expect.arrayContaining([expect.objectContaining({ id: "review-new-turn", content: "审核后新增的持久会话" })]));
  });

  it.each(["initial_insert", "existing_update"])("refuses reviewed rollback after the real Worker session memory adapter performs %s without changing the legacy session row", async (change) => {
    const fixture = await legacyRun();
    const adapter = new PostgresSessionMemoryAdapter();
    const identity = { userId, conversationId: fixture.conversationId };
    if (change === "existing_update") await adapter.append(identity, [{ id: "prior-durable", role: "assistant", content: "原持久回复", createdAt: "2026-10-14T00:00:00.000Z" }]);
    const manifest = await service.inspectBatch(principal, { operatorId, runIds: [fixture.runId] });
    const migrated = await service.applyBatch(principal, manifest, approval(manifest));
    const migrationId = migrated.results[0].receipt!.migrationId;
    const rollback = await service.inspectRollbackBatch(principal, { operatorId, migrationIds: [migrationId] });
    const before = (await pool.query("SELECT row_to_json(session) AS snapshot FROM sessions session WHERE id = $1", [fixture.conversationId])).rows[0].snapshot;
    await adapter.append(identity, [{ id: "rollback-new-turn", role: "user", content: "回滚审核后新增的持久会话", createdAt: "2026-10-14T01:00:00.000Z" }]);
    expect((await pool.query("SELECT row_to_json(session) AS snapshot FROM sessions session WHERE id = $1", [fixture.conversationId])).rows[0].snapshot).toEqual(before);
    expect(await service.rollbackBatch(principal, rollback, approval(rollback))).toMatchObject({ canClaimSuccess: false, results: [{ status: "blocked" }] });
    expect((await service.inspectRollback(principal, migrationId)).action).toBe("forward_revalidation_required");
    expect((await pool.query("SELECT count(*) AS count FROM agent_run_checkpoints WHERE run_id = $1 AND boundary = 'legacy_migration_rollback'", [fixture.runId])).rows[0].count).toBe("0");
    expect(await adapter.load(identity)).toEqual(expect.arrayContaining([expect.objectContaining({ id: "rollback-new-turn", content: "回滚审核后新增的持久会话" })]));
  });

  it("retains the real Worker conversation memory in the original audit snapshot without replacing it during migration or rollback", async () => {
    const fixture = await legacyRun();
    const adapter = new PostgresSessionMemoryAdapter();
    const identity = { userId, conversationId: fixture.conversationId };
    await adapter.append(identity, [{ id: "prior-durable", role: "assistant", content: "原持久回复", createdAt: "2026-10-14T00:00:00.000Z" }]);
    const original = (await pool.query("SELECT * FROM session_memory WHERE user_id = $1 AND session_id = $2 ORDER BY id", [userId, fixture.conversationId])).rows;
    const manifest = await service.inspectBatch(principal, { operatorId, runIds: [fixture.runId] });
    const migrated = await service.applyBatch(principal, manifest, approval(manifest));
    expect(migrated).toMatchObject({ canClaimSuccess: true });
    const stored = (await pool.query("SELECT context_json FROM agent_run_checkpoints WHERE run_id = $1 AND boundary = 'legacy_migration'", [fixture.runId])).rows[0].context_json.legacyBatchReceipt;
    expect(stored.originalConversationMemory).toEqual(JSON.parse(JSON.stringify(original)));
    expect(stored.originalConversation).toMatchObject({ id: String(fixture.conversationId), user_id: userId });
    expect(migrated.results[0].receipt).not.toHaveProperty("originalConversationMemory");
    const rollback = await service.inspectRollbackBatch(principal, { operatorId, migrationIds: [migrated.results[0].receipt!.migrationId] });
    expect(await service.rollbackBatch(principal, rollback, approval(rollback))).toMatchObject({ canClaimSuccess: true });
    expect((await pool.query("SELECT * FROM session_memory WHERE user_id = $1 AND session_id = $2 ORDER BY id", [userId, fixture.conversationId])).rows).toEqual(original);
  });

  it.each([
    { operation: "apply", change: "initial_insert" }, { operation: "apply", change: "existing_update" },
    { operation: "rollback", change: "initial_insert" }, { operation: "rollback", change: "existing_update" },
  ])("waits for the actual Worker session lock before $operation and blocks its competing $change", async ({ operation, change }) => {
    const fixture = await legacyRun();
    const adapter = new PostgresSessionMemoryAdapter();
    const identity = { userId, conversationId: fixture.conversationId };
    if (change === "existing_update") await adapter.append(identity, [{ id: "prior-durable", role: "assistant", content: "原持久回复", createdAt: "2026-10-14T00:00:00.000Z" }]);
    const manifest = await service.inspectBatch(principal, { operatorId, runIds: [fixture.runId] });
    const migrated = operation === "rollback" ? await service.applyBatch(principal, manifest, approval(manifest)) : null;
    const rollback = migrated ? await service.inspectRollbackBatch(principal, { operatorId, migrationIds: [migrated.results[0].receipt!.migrationId] }) : null;
    const competingPool = new Pool({ connectionString, max: 1 });
    let signalWorkerLocked: () => void = () => undefined;
    let releaseWorker: () => void = () => undefined;
    let signalMigrationLock: () => void = () => undefined;
    const workerLocked = new Promise<void>((resolve) => { signalWorkerLocked = resolve; });
    const workerRelease = new Promise<void>((resolve) => { releaseWorker = resolve; });
    const migrationLock = new Promise<void>((resolve) => { signalMigrationLock = resolve; });
    const racing = new LegacyRunMigrationService(async (execute) => withClient(async (client) => {
      const query = client.query.bind(client);
      return execute(new Proxy(client, { get(target, property) {
        if (property !== "query") return Reflect.get(target, property);
        return async (sql: string, params?: unknown[]) => {
          if (sql.startsWith("SELECT * FROM sessions") && sql.includes("FOR UPDATE")) signalMigrationLock();
          return query(sql, params);
        };
      } }));
    }));
    postgresAccess.withClient.mockImplementation(async (execute: (client: PoolClient) => Promise<unknown>) => {
      const client = await competingPool.connect();
      const query = client.query.bind(client);
      try {
        return await execute(new Proxy(client, { get(target, property) {
          if (property !== "query") return Reflect.get(target, property);
          return async (sql: string, params?: unknown[]) => {
            const result = await query(sql, params);
            if (sql.startsWith("SELECT messages_json, agent_state_json FROM sessions") && sql.includes("FOR UPDATE")) {
              signalWorkerLocked();
              await workerRelease;
            }
            return result;
          };
        } }));
      } finally { client.release(); }
    });
    let writing: Promise<void> | undefined;
    try {
      writing = adapter.append(identity, [{ id: "competing-durable", role: "user", content: "并发持久续轮不可覆盖", createdAt: "2026-10-14T02:00:00.000Z" }]);
      await workerLocked;
      const mutation = rollback ? racing.rollbackBatch(principal, rollback, approval(rollback)) : racing.applyBatch(principal, manifest, approval(manifest));
      await migrationLock;
      releaseWorker();
      await writing;
      expect(await mutation).toMatchObject({ canClaimSuccess: false, results: [{ status: "blocked" }] });
      expect((await pool.query("SELECT legacy, status FROM agent_runs WHERE id = $1", [fixture.runId])).rows[0]).toEqual({ legacy: !rollback, status: rollback ? "paused" : "waiting_user" });
      expect(await adapter.load(identity)).toEqual(expect.arrayContaining([expect.objectContaining({ id: "competing-durable", content: "并发持久续轮不可覆盖" })]));
      expect((await pool.query("SELECT count(*) AS count FROM agent_run_checkpoints WHERE run_id = $1 AND boundary = $2", [fixture.runId, rollback ? "legacy_migration_rollback" : "legacy_migration"])).rows[0].count).toBe("0");
    } finally {
      releaseWorker();
      await writing?.catch(() => undefined);
      postgresAccess.withClient.mockImplementation(withClient);
      await competingPool.end();
    }
  });

  it.each(["apply", "rollback"])("holds the parent session lock during %s even when no durable conversation row exists", async (operation) => {
    const fixture = await legacyRun();
    const manifest = await service.inspectBatch(principal, { operatorId, runIds: [fixture.runId] });
    const migrated = operation === "rollback" ? await service.applyBatch(principal, manifest, approval(manifest)) : null;
    const rollback = migrated ? await service.inspectRollbackBatch(principal, { operatorId, migrationIds: [migrated.results[0].receipt!.migrationId] }) : null;
    const competingPool = new Pool({ connectionString, max: 2 });
    let migrationPid = 0;
    let workerPid = 0;
    let intercepted = false;
    let signalMemoryInspected: () => void = () => undefined;
    let releaseMigration: () => void = () => undefined;
    let signalWorkerLock: () => void = () => undefined;
    const memoryInspected = new Promise<void>((resolve) => { signalMemoryInspected = resolve; });
    const migrationRelease = new Promise<void>((resolve) => { releaseMigration = resolve; });
    const workerLock = new Promise<void>((resolve) => { signalWorkerLock = resolve; });
    const racing = new LegacyRunMigrationService(async (execute) => withClient(async (client) => {
      const query = client.query.bind(client);
      migrationPid = Number((await query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      return execute(new Proxy(client, { get(target, property) {
        if (property !== "query") return Reflect.get(target, property);
        return async (sql: string, params?: unknown[]) => {
          const result = await query(sql, params);
          if (!intercepted && sql.startsWith("SELECT * FROM session_memory") && sql.includes("FOR UPDATE")) {
            intercepted = true;
            expect(result.rows).toHaveLength(0);
            signalMemoryInspected();
            await migrationRelease;
          }
          return result;
        };
      } }));
    }));
    postgresAccess.withClient.mockImplementation(async (execute: (client: PoolClient) => Promise<unknown>) => {
      const client = await competingPool.connect();
      const query = client.query.bind(client);
      workerPid = Number((await query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      try {
        return await execute(new Proxy(client, { get(target, property) {
          if (property !== "query") return Reflect.get(target, property);
          return async (sql: string, params?: unknown[]) => {
            if (sql.startsWith("SELECT messages_json, agent_state_json FROM sessions") && sql.includes("FOR UPDATE")) signalWorkerLock();
            return query(sql, params);
          };
        } }));
      } finally { client.release(); }
    });
    let mutation: ReturnType<LegacyRunMigrationService["applyBatch"]> | undefined;
    let writing: Promise<void> | undefined;
    try {
      mutation = rollback ? racing.rollbackBatch(principal, rollback, approval(rollback)) : racing.applyBatch(principal, manifest, approval(manifest));
      await memoryInspected;
      const adapter = new PostgresSessionMemoryAdapter();
      const identity = { userId, conversationId: fixture.conversationId };
      writing = adapter.append(identity, [{ id: "after-protected-empty-read", role: "user", content: "首次持久会话等待迁移锁释放", createdAt: "2026-10-14T03:00:00.000Z" }]);
      await workerLock;
      let blockers: number[] = [];
      for (let attempt = 0; attempt < 50 && !blockers.includes(migrationPid); attempt += 1) {
        blockers = (await competingPool.query("SELECT pg_blocking_pids($1) AS blockers", [workerPid])).rows[0].blockers;
        if (!blockers.includes(migrationPid)) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blockers).toContain(migrationPid);
      releaseMigration();
      const result = await mutation;
      await writing;
      expect(result.results[0].status).toBeOneOf([rollback ? "rolled_back" : "applied", "blocked"]);
      if (result.results[0].status === "blocked") expect(result.results[0].sideEffect).toBe("committed_requires_review");
      expect(await adapter.load(identity)).toEqual(expect.arrayContaining([expect.objectContaining({ id: "after-protected-empty-read", content: "首次持久会话等待迁移锁释放" })]));
      const migrationId = migrated?.results[0].receipt!.migrationId || (await pool.query("SELECT context_json #>> '{legacyBatchReceipt,migrationId}' AS id FROM agent_run_checkpoints WHERE run_id = $1 AND boundary = 'legacy_migration'", [fixture.runId])).rows[0].id;
      expect((await service.inspectRollback(principal, migrationId)).action).toBe("forward_revalidation_required");
    } finally {
      releaseMigration();
      await mutation?.catch(() => undefined);
      await writing?.catch(() => undefined);
      postgresAccess.withClient.mockImplementation(withClient);
      await competingPool.end();
    }
  });

  it.each(["apply", "rollback"])("reports committed_requires_review when the real Worker appends durable conversation immediately after %s commits", async (operation) => {
    const fixture = await legacyRun();
    const manifest = await service.inspectBatch(principal, { operatorId, runIds: [fixture.runId] });
    const migrated = operation === "rollback" ? await service.applyBatch(principal, manifest, approval(manifest)) : null;
    const rollback = migrated ? await service.inspectRollbackBatch(principal, { operatorId, migrationIds: [migrated.results[0].receipt!.migrationId] }) : null;
    const competingPool = new Pool({ connectionString, max: 1 });
    const adapter = new PostgresSessionMemoryAdapter();
    const identity = { userId, conversationId: fixture.conversationId };
    let appended = false;
    postgresAccess.withClient.mockImplementation(async (execute: (client: PoolClient) => Promise<unknown>) => {
      const client = await competingPool.connect();
      try { return await execute(client); } finally { client.release(); }
    });
    const racing = new LegacyRunMigrationService(async (execute) => withClient(async (client) => {
      const query = client.query.bind(client);
      return execute(new Proxy(client, { get(target, property) {
        if (property !== "query") return Reflect.get(target, property);
        return async (sql: string, params?: unknown[]) => {
          const result = await query(sql, params);
          if (sql === "COMMIT" && !appended) {
            appended = true;
            await adapter.append(identity, [{ id: "after-commit", role: "user", content: "提交后独立读回前新增的持久会话", createdAt: "2026-10-14T04:00:00.000Z" }]);
          }
          return result;
        };
      } }));
    }));
    try {
      const result = rollback ? await racing.rollbackBatch(principal, rollback, approval(rollback)) : await racing.applyBatch(principal, manifest, approval(manifest));
      expect(result).toMatchObject({ canClaimSuccess: false, results: [{ status: "blocked", sideEffect: "committed_requires_review" }] });
      expect(await adapter.load(identity)).toEqual(expect.arrayContaining([expect.objectContaining({ id: "after-commit", content: "提交后独立读回前新增的持久会话" })]));
    } finally {
      postgresAccess.withClient.mockImplementation(withClient);
      await competingPool.end();
    }
  });

  it("refuses a real competing input committed while rollback is waiting for the Run lock", async () => {
    const fixture = await legacyRun();
    const manifest = await service.inspectBatch(principal, { operatorId, runIds: [fixture.runId] });
    const migrated = await service.applyBatch(principal, manifest, approval(manifest));
    const rollback = await service.inspectRollbackBatch(principal, { operatorId, migrationIds: [migrated.results[0].receipt!.migrationId] });
    const competingPool = new Pool({ connectionString, max: 1 });
    const competing = await competingPool.connect();
    let signalLockAttempt: () => void = () => undefined;
    const lockAttempted = new Promise<void>((resolve) => { signalLockAttempt = resolve; });
    const racing = new LegacyRunMigrationService(async (operation) => withClient(async (client) => {
      const query = client.query.bind(client);
      return operation(new Proxy(client, { get(target, property) {
        if (property !== "query") return Reflect.get(target, property);
        return async (sql: string, params?: unknown[]) => {
          if (sql.startsWith("SELECT * FROM agent_runs") && sql.includes("FOR UPDATE")) signalLockAttempt();
          return query(sql, params);
        };
      } }));
    }));
    try {
      await competing.query("BEGIN");
      await competing.query("INSERT INTO agent_run_inputs (run_id, user_id, request_id, content_json) VALUES ($1, $2, $3, '{\"content\":\"竞争接受的新用户输入\"}'::jsonb)", [fixture.runId, userId, randomUUID()]);
      const rollingBack = racing.rollbackBatch(principal, rollback, approval(rollback));
      await lockAttempted;
      await competing.query("COMMIT");
      expect(await rollingBack).toMatchObject({ canClaimSuccess: false, results: [{ status: "blocked" }] });
      expect((await pool.query("SELECT status FROM agent_run_inputs WHERE run_id = $1 AND content_json->>'content' = '竞争接受的新用户输入'", [fixture.runId])).rows[0].status).toBe("pending");
    } finally {
      competing.release();
      await competingPool.end();
    }
  });

  it("does not claim rollback success after a committed rollback fails independent SQL read-back", async () => {
    const fixture = await legacyRun();
    const manifest = await service.inspectBatch(principal, { operatorId, runIds: [fixture.runId] });
    const migrated = await service.applyBatch(principal, manifest, approval(manifest));
    const rollback = await service.inspectRollbackBatch(principal, { operatorId, migrationIds: [migrated.results[0].receipt!.migrationId] });
    let corrupted = false;
    const failing = new LegacyRunMigrationService(async (operation) => withClient(async (client) => {
      const query = client.query.bind(client);
      return operation(new Proxy(client, { get(target, property) {
        if (property !== "query") return Reflect.get(target, property);
        return async (sql: string, params?: unknown[]) => {
          const result = await query(sql, params);
          if (sql === "COMMIT" && !corrupted) {
            corrupted = true;
            await query("UPDATE agent_runs SET contract_json = '{}'::jsonb WHERE id = $1", [fixture.runId]);
          }
          return result;
        };
      } }));
    }));
    expect(await failing.rollbackBatch(principal, rollback, approval(rollback))).toMatchObject({ canClaimSuccess: false,
      results: [{ status: "blocked", sideEffect: "committed_requires_review", reason: expect.stringContaining("committed") }] });
    expect((await pool.query("SELECT status FROM agent_runs WHERE id = $1", [fixture.runId])).rows[0].status).toBe("paused");
    expect((await service.inspectRollback(principal, migrated.results[0].receipt!.migrationId)).action).toBe("forward_revalidation_required");
  });

  it("runs the explicit-target CLI inspect/apply/rollback workflow against the isolated database with review artifacts", async () => {
    const { runLegacyRunMigrationCli } = await import("@/lib/agent/runtime/legacy-run-migration-cli");
    const fixture = await legacyRun();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "spec40-legacy-cli-pg-"));
    const flags = ["--database-url", connectionString!, "--owner", userId, "--operator", operatorId];
    try {
      const impactPath = path.join(directory, "impact.json");
      expect(await runLegacyRunMigrationCli(["inspect", ...flags, "--run", fixture.runId, "--output", impactPath])).toMatchObject({ exitCode: 0 });
      const manifest = JSON.parse(fs.readFileSync(impactPath, "utf8"));
      const approvalPath = path.join(directory, "approval.json");
      fs.writeFileSync(approvalPath, JSON.stringify(approval(manifest)));
      const applyPath = path.join(directory, "applied.json");
      expect(await runLegacyRunMigrationCli(["apply", ...flags, "--manifest", impactPath, "--approval", approvalPath, "--output", applyPath])).toMatchObject({ exitCode: 0 });
      const applied = JSON.parse(fs.readFileSync(applyPath, "utf8"));
      const rollbackPath = path.join(directory, "rollback-impact.json");
      expect(await runLegacyRunMigrationCli(["inspect-rollback", ...flags, "--migration", applied.results[0].receipt.migrationId, "--output", rollbackPath])).toMatchObject({ exitCode: 0 });
      const rollback = JSON.parse(fs.readFileSync(rollbackPath, "utf8"));
      const rollbackApprovalPath = path.join(directory, "rollback-approval.json");
      fs.writeFileSync(rollbackApprovalPath, JSON.stringify(approval(rollback)));
      expect(await runLegacyRunMigrationCli(["rollback", ...flags, "--manifest", rollbackPath, "--approval", rollbackApprovalPath, "--output", path.join(directory, "rolled-back.json")])).toMatchObject({ exitCode: 0 });
      expect((await pool.query("SELECT status, execution_owner, legacy FROM agent_runs WHERE id = $1", [fixture.runId])).rows[0]).toEqual({ status: "paused", execution_owner: "worker", legacy: false });
    } finally {
      for (const filename of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, filename));
      fs.rmdirSync(directory);
    }
  });
});
