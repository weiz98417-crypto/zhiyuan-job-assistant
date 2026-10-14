import { randomUUID } from "crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DurableAgentRunService, type AgentRunFactReference } from "@/lib/agent/runtime/durable-agent-run";
import { PostgresAgentRunStore } from "@/lib/agent/runtime/postgres-agent-run-store";
import { PostgresToolAttemptStore } from "@/lib/agent/runtime/postgres-tool-attempt-store";
import { GovernedToolAttemptExecutor } from "@/lib/agent/runtime/governed-tool-attempt";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";
import { AgentWorker } from "@/lib/agent/runtime/agent-worker";
import { createAgentTaskContract } from "@/lib/agent/task-contract";
import { agentLoopServer } from "@/lib/agent/loop/server-runner";
import { registry } from "@/lib/agent/tools";
import type { GovernedRuntimeToolInput } from "@/lib/agent/runtime/governed-tool-runtime";
import { getPostgresPool } from "@/lib/postgres";
import { ResearchDelegationService } from "@/lib/agent/runtime/research-delegation";
import { PostgresRunContextSource } from "@/lib/agent/runtime/postgres-run-context-source";

const fixture = vi.hoisted(() => ({ runtime: null as DurableAgentRunService | null, executor: null as GovernedToolAttemptExecutor | null }));
vi.mock("@/lib/agent/runtime/runtime-factory", () => ({ getDurableAgentRuntime: () => fixture.runtime }));
vi.mock("@/lib/agent/runtime/governed-tool-runtime", () => ({ executeGovernedRuntimeTool: (input: GovernedRuntimeToolInput) =>
  fixture.executor!.execute({ ...input, idempotencyKey: input.requestId }) }));

const connectionString = process.env.SPEC40_COLLABORATION_DATABASE_URL;
const fixtureOwner = "spec40-collaboration-" + randomUUID();
const foreignOwner = fixtureOwner + "-foreign";
let pool: Pool;
const withClient = async <Result>(operation: (client: PoolClient) => Promise<Result>) => {
  const client = await pool.connect();
  try { return await operation(client); } finally { client.release(); }
};

describe.skipIf(!connectionString)("Spec40 isolated PostgreSQL collaboration queue", () => {
  beforeAll(async () => {
    const target = new URL(connectionString!);
    if (target.hostname !== "127.0.0.1" || target.port !== "55440" || target.pathname !== "/spec40_collaboration") {
      throw new Error("Collaboration integration requires localhost:55440/spec40_collaboration");
    }
    vi.stubEnv("DB_DRIVER", "postgres"); vi.stubEnv("DATABASE_URL", connectionString!);
    pool = new Pool({ connectionString, max: 4 });
    expect((await pool.query("SELECT current_database() AS database")).rows[0].database).toBe("spec40_collaboration");
    await pool.query("INSERT INTO users (id, username, password_hash, display_name, status) VALUES ($1, $1, 'fixture', 'Collaboration fixture', 'active')", [fixtureOwner]);
    await pool.query("INSERT INTO users (id, username, password_hash, display_name, status) VALUES ($1, $1, 'fixture', 'Foreign fixture', 'active')", [foreignOwner]);
  });
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllGlobals();
    if (pool) await pool.query("DELETE FROM agent_runs WHERE user_id=ANY($1::text[])", [[fixtureOwner, foreignOwner]]);
  });
  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM agent_runs WHERE user_id = $1", [fixtureOwner]);
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [fixtureOwner]);
    await pool.query("DELETE FROM users WHERE id=ANY($1::text[])", [[fixtureOwner, foreignOwner]]);
    await pool.end();
    await getPostgresPool().end();
    vi.unstubAllEnvs();
  });

  it.each(["forged-parent", "write-child", "paused-parent", "expired-parent", "foreign-parent", "unrelated-active", "plain-root"])(
    "keeps the normal queue serialized and refuses an unsafe collaboration exception: %s", async (scenario) => {
      const runtime = new DurableAgentRunService(new PostgresAgentRunStore(withClient));
      const principal = { userId: fixtureOwner };
      const parent = await runtime.createRun(principal, { requestId: randomUUID(), conversationId: null,
        taskType: "general_chat", agentId: "general", input: { content: "fixture parent" },
        contract: createAgentTaskContract({ taskType: "general_chat", target: "fixture parent" }) });
      const claimed = (await runtime.claimNextRun({ workerId: "pg-negative-parent" }))!;
      const child = await runtime.createRun(principal, { requestId: randomUUID(), conversationId: null,
        taskType: scenario === "write-child" ? "resume_edit" : "delegated_research", agentId: "general",
        input: { content: "fixture child" }, parentRunId: parent.run.id,
        runtimeMode: scenario === "write-child" ? "worker_all" : "worker_readonly",
        contract: { kind: "governed-research/v1", parentRunId: scenario === "forged-parent" ? "fake-parent" : parent.run.id } });
      let unrelatedId: string | undefined;
      if (scenario === "paused-parent") await pool.query("UPDATE agent_runs SET status='paused', owner_id=NULL, lease_expires_at=NULL WHERE id=$1", [parent.run.id]);
      if (scenario === "expired-parent") await pool.query("UPDATE agent_runs SET lease_expires_at=now()-interval '1 second' WHERE id=$1", [parent.run.id]);
      if (scenario === "foreign-parent") await pool.query("UPDATE agent_runs SET user_id=$2 WHERE id=$1", [parent.run.id, foreignOwner]);
      if (scenario === "plain-root") await pool.query("UPDATE agent_runs SET parent_run_id=NULL, task_type='general_chat', runtime_mode='worker_all' WHERE id=$1", [child.run.id]);
      if (scenario === "unrelated-active") {
        const unrelated = await runtime.createRun(principal, { requestId: randomUUID(), conversationId: null, taskType: "general_chat",
          agentId: "general", input: { content: "unrelated" }, contract: {} });
        unrelatedId = unrelated.run.id;
        await pool.query("UPDATE agent_runs SET status='running', owner_id='unrelated-worker', lease_expires_at=now()+interval '1 minute' WHERE id=$1", [unrelatedId]);
      }
      try {
        const next = await runtime.claimNextRun({ workerId: "pg-negative-child" });
        expect(next?.id, scenario).not.toBe(child.run.id);
        expect((await pool.query("SELECT status FROM agent_runs WHERE id=$1", [child.run.id])).rows[0].status).toBe("queued");
        expect((await pool.query("SELECT count(*)::int AS count FROM agent_run_events WHERE run_id=$1 AND event_type='run.claimed'", [child.run.id])).rows[0].count).toBe(0);
      } finally {
        if (scenario === "foreign-parent") await pool.query("UPDATE agent_runs SET user_id=$2 WHERE id=$1", [parent.run.id, fixtureOwner]);
        await pool.query("DELETE FROM agent_runs WHERE id=ANY($1::text[])", [[child.run.id, parent.run.id, ...(unrelatedId ? [unrelatedId] : [])]]);
      }
      expect(claimed.id).toBe(parent.run.id);
    });

  it("delegates only source A and preserves it when unrelated source B changes", async () => {
    const runtime = new DurableAgentRunService(new PostgresAgentRunStore(withClient));
    const store = new PostgresToolAttemptStore(withClient);
    const principal = { userId: fixtureOwner };
    const content = "请委派 general 专家研究星河公司的经营风险。";
    await runtime.createRun(principal, { requestId: randomUUID(), conversationId: null, taskType: "general_chat", agentId: "general",
      input: { content }, contract: createAgentTaskContract({ taskType: "general_chat", target: content }) });
    const run = (await runtime.claimNextRun({ workerId: "pg-source-parent" }))!;
    const refs: AgentRunFactReference[] = [];
    for (const [index, summary] of ["仅来源A的公开材料", "不得夹带的来源B"].entries()) {
      const begun = await store.beginAttempt({ principal, runId: run.id, workerId: run.ownerId!, fencingToken: run.fencingToken,
        toolName: "web_search", args: { query: "fixture" }, argsHash: "source-args-" + index, idempotencyKey: "source-" + index, capability: null });
      await store.finishAttempt(begun.attempt.id, { workerId: run.ownerId!, fencingToken: run.fencingToken,
        status: "succeeded", effectState: "verified", result: { success: true, data: null, llmSummary: summary }, observation: null });
      refs.push({ type: "tool_attempt", id: begun.attempt.id, version: "verified", hash: "source-args-" + index });
    }
    await runtime.saveCheckpoint({ runId: run.id, workerId: run.ownerId!, fencingToken: run.fencingToken,
      boundary: "source_bound", context: { conversationMessages: [{ id: "pg-source-turn", role: "user", content }] },
      plan: {}, budgets: {}, factRefs: refs });
    const service = new ResearchDelegationService(runtime);
    const context = { principal, runId: run.id, workerId: run.ownerId!, fencingToken: run.fencingToken, allowlist: ["delegate_research", "web_search"] };
    const params = { target_agent_id: "general", goal: "星河公司的经营风险", dependency: "required", source_artifact_ids: [refs[0].id] };
    const before = await service.prepare(params, context);
    expect(before.sourceContents).toEqual([expect.objectContaining({ id: refs[0].id, content: "仅来源A的公开材料" })]);
    expect(JSON.stringify(before)).not.toContain("不得夹带的来源B");
    await pool.query("UPDATE agent_tool_attempts SET result_json=$2::jsonb WHERE id=$1",
      [refs[1].id, JSON.stringify({ success: true, data: null, llmSummary: "来源B已经变更" })]);
    expect(await service.prepare(params, context)).toEqual(before);
    const material = await new PostgresRunContextSource(withClient).load(principal, run.id);
    expect(material.completedToolFacts.find((entry) => entry.sourceRef?.id === refs[0].id)?.summary).toBe("仅来源A的公开材料");
    await pool.query("UPDATE agent_tool_attempts SET result_json=$2::jsonb WHERE id=$1",
      [refs[0].id, JSON.stringify({ success: true, data: null, llmSummary: "来源A已经变更" })]);
    expect((await service.prepare(params, context)).delegationId).not.toBe(before.delegationId);
  });

  it("queues a real child, reads an owned entity under its independent Worker fence, and lets the parent consume one structured result", async () => {
    const runtime = new DurableAgentRunService(new PostgresAgentRunStore(withClient));
    const childRuntime = new DurableAgentRunService(new PostgresAgentRunStore(withClient));
    fixture.runtime = runtime;
    fixture.executor = new GovernedToolAttemptExecutor(registry, new PostgresToolAttemptStore(withClient), undefined, runtime);
    const principal = { userId: fixtureOwner };
    const session = await pool.query("INSERT INTO sessions (user_id, title) VALUES ($1, 'Collaboration queue fixture') RETURNING id", [fixtureOwner]);
    const content = "请委派 general 专家研究当前投递状态统计。";
    const created = await runtime.createRun(principal, { requestId: randomUUID(), conversationId: Number(session.rows[0].id),
      taskType: "general_chat", agentId: "general", input: { content }, contract: createAgentTaskContract({ taskType: "general_chat", target: content }) });
    const parent = (await runtime.claimNextRun({ workerId: "pg-collaboration-parent" }))!;
    await runtime.saveCheckpoint({ runId: parent.id, workerId: parent.ownerId!, fencingToken: parent.fencingToken,
      boundary: "before_model", context: { conversationMessages: [{ id: "pg-collaboration-source", role: "user", content }] },
      plan: {}, budgets: {}, factRefs: [] });
    const findings = { schema: "research-findings/v1", findings: "当前账号没有已记录的投递，不能推断历史进度。",
      keyPoints: ["当前投递记录为零。"], sourceArtifactIds: ["pg-collaboration-source"], limitations: ["历史阶段没有证据。"] };
    const parentPrompts: unknown[] = [];
    let parentCalls = 0;
    let childCalls = 0;
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-model-key"); vi.stubEnv("ZHIPU_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      const child = JSON.stringify(request.messages).includes("执行已由用户授权的只读研究子任务");
      let delta;
      if (child) {
        childCalls += 1;
        delta = childCalls === 1 ? { tool_calls: [{ index: 0, id: "pg-child-read", function: { name: "get_pipeline_status", arguments: "{}" } }] }
          : { content: JSON.stringify(findings) };
      } else {
        parentCalls += 1;
        parentPrompts.push(request);
        delta = parentCalls === 1 ? { tool_calls: [{ index: 0, id: "pg-parent-delegate", function: { name: "delegate_research",
          arguments: JSON.stringify({ target_agent_id: "general", goal: "当前投递状态统计", dependency: "required" }) } }] }
          : { content: "目前没有投递记录，历史进度资料不足。" };
      }
      return new Response("data: " + JSON.stringify({ choices: [{ delta }] }) + "\n\ndata: [DONE]\n\n",
        { headers: { "Content-Type": "text/event-stream" } });
    }));
    const stop = new AbortController();
    const worker = new AgentWorker({ workerId: "pg-collaboration-child", runtime: childRuntime,
      engine: new DurableOrchestratorExecutionEngine({ runtime: childRuntime }) });
    const queue = worker.runForever({ signal: stop.signal, concurrency: 1, pollIntervalMs: 5 });
    const events = [];
    try {
      for await (const event of agentLoopServer({ systemPrompt: "依据研究结论回答并保留限制。", messages: [{ role: "user", content }],
        tools: registry.toOpenAITools(["delegate_research"], true), executionContext: { principal, runId: parent.id,
          workerId: parent.ownerId!, fencingToken: parent.fencingToken, allowlist: ["delegate_research", "get_pipeline_status"] } })) events.push(event);
    } finally { stop.abort(); await queue; }
    const lifecycle = events.filter((event) => event.type.startsWith("subagent."));
    expect(lifecycle.map((event) => event.type)).toEqual(["subagent.started", "subagent.finished", "subagent.consumed"]);
    const result = events.find((event) => event.type === "tool_result");
    expect(result).toMatchObject({ success: true, data: { findings: findings.findings, readBackVerified: true } });
    const delegation = result!.type === "tool_result" ? result!.data as { delegationId: string; childRunId: string } : null;
    expect(lifecycle.every((event) => "delegationId" in event && event.delegationId === delegation!.delegationId)).toBe(true);
    const independent = await pool.query("SELECT id, parent_run_id, session_id, owner_id, fencing_token, depth, status, contract_json FROM agent_runs WHERE user_id = $1 AND parent_run_id = $2", [fixtureOwner, created.run.id]);
    expect(independent.rows).toHaveLength(1);
    expect(independent.rows[0]).toMatchObject({ id: delegation!.childRunId, parent_run_id: parent.id, session_id: null,
      owner_id: null, depth: 1, status: "succeeded",
      contract_json: { allowedTools: ["get_pipeline_status"], constraints: { readOnly: true, noPersonalMemoryWrite: true } } });
    const checkpoint = await pool.query("SELECT context_json FROM agent_run_checkpoints WHERE run_id = $1 ORDER BY snapshot_version DESC LIMIT 1", [delegation!.childRunId]);
    expect(Number(independent.rows[0].fencing_token)).toBe(1);
    const childClaims = await pool.query("SELECT payload_json FROM agent_run_events WHERE run_id = $1 AND event_type = 'run.claimed'", [delegation!.childRunId]);
    expect(childClaims.rows).toHaveLength(1);
    expect(childClaims.rows[0].payload_json).toMatchObject({ workerId: "pg-collaboration-child", fencingToken: 1 });
    expect(checkpoint.rows[0].context_json.researchFindings).toEqual(findings);
    const attempts = await pool.query("SELECT run_id, tool_name, owner_id, status, result_json FROM agent_tool_attempts WHERE user_id = $1 ORDER BY tool_name", [fixtureOwner]);
    expect(attempts.rows).toHaveLength(2);
    expect(attempts.rows.find((entry) => entry.tool_name === "get_pipeline_status")).toMatchObject({
      run_id: delegation!.childRunId, owner_id: "pg-collaboration-child", status: "succeeded",
      result_json: { success: true, data: { total: 0 } } });
    expect(JSON.stringify(parentPrompts[1])).toContain(findings.findings);
    expect(parentCalls).toBe(2); expect(childCalls).toBe(2);
    expect(await runtime.getRun({ userId: "foreign-owner" }, delegation!.childRunId)).toBeNull();
  }, 20_000);
});
