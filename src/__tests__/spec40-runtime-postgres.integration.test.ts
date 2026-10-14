import { randomUUID } from "crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DurableAgentRunService } from "@/lib/agent/runtime/durable-agent-run";
import { PostgresAgentRunStore } from "@/lib/agent/runtime/postgres-agent-run-store";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";
import { AgentWorker } from "@/lib/agent/runtime/agent-worker";
import { LegacyRunMigrationService } from "@/lib/agent/runtime/legacy-run-migration";
import { buildContractForTask } from "@/lib/agent/run-admission";
import type { ExecutionConversationMessage } from "@/lib/agent/runtime/execution-session-service";
import * as intentEnvelope from "@/lib/agent/intent-envelope";

const connectionString = process.env.SPEC40_RUNTIME_DATABASE_URL;
const fixtureOwner = "spec40-runtime-" + randomUUID();
let pool: Pool;
let runtime: DurableAgentRunService;
const withClient = async <Result>(operation: (client: PoolClient) => Promise<Result>) => {
  const client = await pool.connect();
  try { return await operation(client); } finally { client.release(); }
};

describe.skipIf(!connectionString)("Spec 40 isolated PostgreSQL Runtime", () => {
  beforeAll(async () => {
    const target = new URL(connectionString!);
    if (target.hostname !== "127.0.0.1" || target.port !== "55440" || target.pathname !== "/spec40_runtime") {
      throw new Error("Spec 40 Runtime integration requires the dedicated local spec40_runtime database");
    }
    pool = new Pool({ connectionString, max: 1 });
    const identity = await pool.query("SELECT current_database() AS database");
    expect(identity.rows[0].database).toBe("spec40_runtime");
    await pool.query("INSERT INTO users (id, username, password_hash, display_name, status) VALUES ($1, $1, 'fixture', 'Runtime fixture', 'active')", [fixtureOwner]);
    runtime = new DurableAgentRunService(new PostgresAgentRunStore(withClient));
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM agent_runs WHERE user_id = $1", [fixtureOwner]);
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [fixtureOwner]);
    await pool.query("DELETE FROM users WHERE id = $1", [fixtureOwner]);
    await pool.end();
  });

  async function conversation() {
    const inserted = await pool.query("INSERT INTO sessions (user_id, title) VALUES ($1, 'Spec 40 Runtime fixture') RETURNING id", [fixtureOwner]);
    const conversationId = Number(inserted.rows[0].id);
    return { conversationId,
      loadConversation: async () => (await pool.query("SELECT messages_json FROM sessions WHERE id = $1 AND user_id = $2", [conversationId, fixtureOwner])).rows[0].messages_json as ExecutionConversationMessage[],
      saveConversation: async (_principal: { userId: string }, _conversationId: number | null, messages: ExecutionConversationMessage[]) => {
        await pool.query("UPDATE sessions SET messages_json = $3::jsonb WHERE id = $1 AND user_id = $2", [conversationId, fixtureOwner, JSON.stringify(messages)]);
      } };
  }

  it("keeps pending input and checkpoint identity across concurrent claims, interrupted execution and replay", async () => {
    const session = await conversation();
    const principal = { userId: fixtureOwner };
    const source = "只整理 Offer 事实，不保存报告：月薪20K，公积金0%。";
    const created = await runtime.createRun(principal, { requestId: randomUUID(), conversationId: session.conversationId,
      taskType: "general_chat", agentId: "general", input: { content: source },
      contract: buildContractForTask("general_chat", source) });
    const claimTime = new Date();
    const claims = await Promise.all([runtime.claimNextRun({ workerId: "pg-worker-a", now: claimTime, leaseMs: 1_000 }),
      runtime.claimNextRun({ workerId: "pg-worker-b", now: claimTime, leaseMs: 1_000 })]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const claimed = claims.find(Boolean)!;
    const pendingIds = (await runtime.listPendingInputs(principal, created.run.id)).map((item) => item.id);
    vi.spyOn(intentEnvelope, "resolveIntentEnvelope").mockResolvedValue({ kind: "resolved", source: "fast_path",
      envelope: { primaryTask: "offer_evaluation", confidence: "high", referencedMaterials: [], audit: [],
        constraints: { writePolicy: "forbidden", noProfileWrite: false, noResumeWrite: false, noReferenceResumeWrite: false } } });
    const model = vi.fn(async function* () { throw new Error("Read-only facts must not invoke a model"); });
    const engine = new DurableOrchestratorExecutionEngine({ runtime, ...session, orchestrate: model });
    const originalSave = runtime.saveCheckpoint.bind(runtime);
    const interruption = vi.spyOn(runtime, "saveCheckpoint").mockImplementation(async (command) => {
      if (command.boundary === "intent_resolved") throw new Error("process interrupted after input consumption");
      return originalSave(command);
    });
    await expect(engine.execute({ run: claimed, checkpoint: null, signal: new AbortController().signal })).rejects.toThrow("process interrupted");
    interruption.mockRestore();
    expect(await runtime.listPendingInputs(principal, created.run.id)).toEqual([]);
    const beforeRestart = await runtime.getLatestCheckpoint(principal, created.run.id);
    expect(beforeRestart?.context.conversationMessages).toEqual(expect.arrayContaining([expect.objectContaining({ content: source })]));
    const reclaimed = await runtime.claimNextRun({ workerId: "pg-restarted-worker", now: new Date(claimTime.getTime() + 1_001) });
    expect(reclaimed).toMatchObject({ id: created.run.id, fencingToken: claimed.fencingToken + 1 });
    await expect(runtime.consumeInputs({ runId: claimed.id, workerId: claimed.ownerId!, fencingToken: claimed.fencingToken, inputIds: pendingIds })).rejects.toThrow("Stale Agent Run owner");
    expect(await engine.execute({ run: reclaimed!, checkpoint: beforeRestart, signal: new AbortController().signal })).toEqual({ outcome: "succeeded" });
    const current = await runtime.getRun(principal, created.run.id);
    expect(current).toMatchObject({ id: created.run.id, taskType: "offer_evaluation", agentId: "offer",
      contract: { routing: { completionMode: "read_only_facts" } } });
    const completion = await runtime.getLatestCheckpoint(principal, created.run.id);
    expect(await engine.execute({ run: current!, checkpoint: completion, signal: new AbortController().signal })).toEqual({ outcome: "succeeded" });
    expect((await session.loadConversation()).filter((message) => message.role === "user")).toHaveLength(1);
    expect((await session.loadConversation()).filter((message) => message.role === "assistant")).toHaveLength(1);
    expect((await runtime.listEvents(principal, created.run.id, 0)).filter((event) => event.type === "run.model_output_complete")).toHaveLength(1);
    expect(model).not.toHaveBeenCalled();
    await runtime.transitionRun({ runId: current!.id, workerId: current!.ownerId!, fencingToken: current!.fencingToken, nextStatus: "verifying" });
    await runtime.transitionRun({ runId: current!.id, workerId: current!.ownerId!, fencingToken: current!.fencingToken, nextStatus: "succeeded" });
  });

  it("dry-runs and applies legacy migration in place, retains evidence, rejects changed source, and pauses unverifiable facts", async () => {
    const session = await conversation();
    const principal = { userId: fixtureOwner };
    const runId = "legacy-spec40-" + randomUUID();
    const contract = buildContractForTask("resume_edit", "修改简历");
    await pool.query(`INSERT INTO agent_runs (id, user_id, session_id, task_type, agent_id, status, contract_json, result_json)
      VALUES ($1, $2, $3, 'resume_edit', 'resume', 'waiting_user', $4::jsonb, $5::jsonb)`,
      [runId, fixtureOwner, session.conversationId, JSON.stringify(contract), JSON.stringify({ success: true, modelClaim: "已保存" })]);
    const service = new LegacyRunMigrationService(withClient);
    const plan = await service.inspect(principal, runId);
    expect(plan).toMatchObject({ runId, action: "pause_for_revalidation", originalBinding: { taskType: "resume_edit", agentId: "resume" } });
    expect(plan.requiredChecks).toContain("renewed_user_material");
    expect((await pool.query("SELECT legacy, status FROM agent_runs WHERE id = $1", [runId])).rows[0]).toEqual({ legacy: true, status: "waiting_user" });
    await pool.query("UPDATE agent_runs SET snapshot_version = snapshot_version + 1 WHERE id = $1", [runId]);
    await expect(service.apply(principal, runId, plan.sourceHash)).rejects.toThrow("changed after migration inspection");
    const reviewed = await service.inspect(principal, runId);
    expect(await service.apply(principal, runId, reviewed.sourceHash)).toMatchObject({ runId, status: "paused", readBackVerified: true });
    expect(await runtime.getRun(principal, runId)).toMatchObject({ id: runId, conversationId: session.conversationId, taskType: "resume_edit", status: "paused" });
    const checkpoint = await runtime.getLatestCheckpoint(principal, runId);
    expect(checkpoint?.context.legacyMigration).toMatchObject({ sourceHash: reviewed.sourceHash, originalResult: { success: true, modelClaim: "已保存" } });
    expect(checkpoint?.context.modelCompletion).toBeUndefined();
    expect(checkpoint?.plan).toMatchObject({ legacyRevalidationRequired: true, stage: "preflight" });
    expect(await service.apply(principal, runId, reviewed.sourceHash)).toMatchObject({ action: "already_migrated", status: "paused" });
    expect((await runtime.listEvents(principal, runId, 0)).filter((event) => event.type === "run.legacy_migrated")).toHaveLength(1);
    expect(await runtime.claimNextRun({ workerId: "legacy-should-not-run" })).toBeNull();
    await expect(service.inspect({ userId: "foreign-owner" }, runId)).rejects.toThrow("Agent Run not found");
  });

  it("preserves legacy terminal history without rewriting a claimed success", async () => {
    const runId = "terminal-spec40-" + randomUUID();
    await pool.query("INSERT INTO agent_runs (id, user_id, task_type, agent_id, status) VALUES ($1, $2, 'general_chat', 'general', 'succeeded')", [runId, fixtureOwner]);
    const service = new LegacyRunMigrationService(withClient);
    const principal = { userId: fixtureOwner };
    const plan = await service.inspect(principal, runId);
    expect(await service.apply(principal, runId, plan.sourceHash)).toMatchObject({ action: "preserve_terminal", status: "succeeded" });
    expect((await pool.query("SELECT legacy, status FROM agent_runs WHERE id = $1", [runId])).rows[0]).toEqual({ legacy: true, status: "succeeded" });
  });

  it("retains legacy source inputs without automatically re-executing them when a paused Run is resumed", async () => {
    const session = await conversation();
    const runId = "source-legacy-spec40-" + randomUUID();
    const principal = { userId: fixtureOwner };
    const source = "仅整理 Offer 事实，不要保存报告：月薪20K，公积金0%。";
    await pool.query("INSERT INTO agent_runs (id, user_id, session_id, task_type, agent_id, status, contract_json) VALUES ($1, $2, $3, 'offer_evaluation', 'offer', 'running', $4::jsonb)",
      [runId, fixtureOwner, session.conversationId, JSON.stringify(buildContractForTask("offer_evaluation", source))]);
    await pool.query("INSERT INTO agent_run_inputs (run_id, user_id, request_id, content_json) VALUES ($1, $2, $3, $4::jsonb)",
      [runId, fixtureOwner, randomUUID(), JSON.stringify({ content: source })]);
    const migration = new LegacyRunMigrationService(withClient);
    const plan = await migration.inspect(principal, runId);
    expect(plan.evidence.inputIds).toHaveLength(1);
    await migration.apply(principal, runId, plan.sourceHash);
    expect(await runtime.listPendingInputs(principal, runId)).toEqual([]);
    await runtime.resumeRun(principal, runId, randomUUID());
    const model = vi.fn(async function* () { throw new Error("Unverified legacy input must not execute"); });
    vi.spyOn(intentEnvelope, "resolveIntentEnvelope").mockResolvedValue({ kind: "resolved", source: "fast_path",
      envelope: { primaryTask: "offer_evaluation", confidence: "high", referencedMaterials: [], audit: [],
        constraints: { writePolicy: "forbidden", noProfileWrite: false, noResumeWrite: false, noReferenceResumeWrite: false } } });
    const worker = new AgentWorker({ workerId: "legacy-resume-worker", runtime,
      engine: new DurableOrchestratorExecutionEngine({ runtime, ...session, orchestrate: model }) });
    expect(await worker.runOnce()).toMatchObject({ id: runId, status: "waiting_user" });
    expect((await runtime.getLatestCheckpoint(principal, runId))?.context.readOnlyFacts).toBeUndefined();
    expect((await session.loadConversation()).findLast((message) => message.role === "assistant")?.content).toContain("尚未独立核对");
    expect(model).not.toHaveBeenCalled();
    await runtime.submitInput(principal, runId, randomUUID(), { content: "确认重新核对，只整理事实：月薪22K。" });
    expect(await worker.runOnce()).toMatchObject({ id: runId, status: "succeeded" });
    expect((await runtime.getLatestCheckpoint(principal, runId))?.context.readOnlyFacts).toMatchObject({ facts: { monthlySalary: 22_000 } });
    expect((await session.loadConversation()).filter((message) => message.role === "user" && message.content === source)).toHaveLength(1);
  });

  it.each(["contract", "input", "plan"])("does not report migration success if independent read-back finds corrupted %s after commit", async (fault) => {
    const runId = "corrupt-legacy-spec40-" + randomUUID();
    const principal = { userId: fixtureOwner };
    await pool.query("INSERT INTO agent_runs (id, user_id, task_type, agent_id, status, contract_json) VALUES ($1, $2, 'offer_evaluation', 'offer', 'waiting_user', $3::jsonb)",
      [runId, fixtureOwner, JSON.stringify(buildContractForTask("offer_evaluation", "评估Offer"))]);
    await pool.query("INSERT INTO agent_run_inputs (run_id, user_id, request_id, content_json) VALUES ($1, $2, $3, $4::jsonb)",
      [runId, fixtureOwner, randomUUID(), JSON.stringify({ content: "月薪20K，公积金0%" })]);
    const normal = new LegacyRunMigrationService(withClient);
    const plan = await normal.inspect(principal, runId);
    let corrupted = false;
    const failing = new LegacyRunMigrationService(async (operation) => withClient(async (client) => {
      const query = client.query.bind(client);
      const proxy = new Proxy(client, { get(target, property) {
        if (property !== "query") return Reflect.get(target, property);
        return async (sql: string, params?: unknown[]) => {
          const result = await query(sql, params);
          if (sql === "COMMIT" && !corrupted) {
            corrupted = true;
            if (fault === "contract") await query("UPDATE agent_runs SET contract_json = '{}'::jsonb WHERE id = $1", [runId]);
            if (fault === "input") await query("UPDATE agent_run_inputs SET content_json = '{\"content\":\"月薪伪造\"}'::jsonb WHERE run_id = $1", [runId]);
            if (fault === "plan") await query("UPDATE agent_run_checkpoints SET plan_json = '{\"stage\":\"complete\",\"legacyRevalidationRequired\":false}'::jsonb WHERE run_id = $1", [runId]);
          }
          return result;
        };
      } });
      return operation(proxy);
    }));
    await expect(failing.apply(principal, runId, plan.sourceHash)).rejects.toThrow("read-back failed");
    expect(await runtime.getRun(principal, runId)).toMatchObject({ id: runId, status: "paused", ...(fault === "contract" ? { contract: {} } : {}) });
    await expect(normal.apply(principal, runId, plan.sourceHash)).rejects.toThrow("read-back failed");
  });
});
