import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import { DurableAgentRunService, InMemoryAgentRunStore } from "@/lib/agent/runtime/durable-agent-run";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";
import { AgentWorker } from "@/lib/agent/runtime/agent-worker";
import { createAgentTaskContract } from "@/lib/agent/task-contract";
import { delegateResearch } from "@/lib/agent/tools/action/delegate-research";
import { transferToAgent } from "@/lib/agent/tools/action/transfer-to-agent";
import { ResearchDelegationService } from "@/lib/agent/runtime/research-delegation";
import { agentLoopServer } from "@/lib/agent/loop/server-runner";
import { registry } from "@/lib/agent/tools";
import { GovernedToolAttemptExecutor, InMemoryToolAttemptStore } from "@/lib/agent/runtime/governed-tool-attempt";
import type { GovernedRuntimeToolInput } from "@/lib/agent/runtime/governed-tool-runtime";
import * as intentEnvelope from "@/lib/agent/intent-envelope";
import type { ExecutionConversationMessage } from "@/lib/agent/runtime/execution-session-service";
import * as agentReadService from "@/lib/agent/runtime/agent-read-service";

const fixture = vi.hoisted(() => ({ runtime: null as DurableAgentRunService | null, executor: null as GovernedToolAttemptExecutor | null }));
vi.mock("@/lib/agent/runtime/runtime-factory", () => ({ getDurableAgentRuntime: () => fixture.runtime }));
vi.mock("@/lib/agent/runtime/governed-tool-runtime", () => ({ executeGovernedRuntimeTool: (input: GovernedRuntimeToolInput) =>
  fixture.executor!.execute({ ...input, idempotencyKey: input.requestId }) }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Runtime governed collaboration", () => {
  it.each([
    { content: "请委派 general 专家研究如何核对星河公司风险。", goal: "如何核对星河公司风险", kind: "research" },
    { content: "请委派 general 专家研究《星河公司年报》。", goal: "《星河公司年报》", kind: "research" },
    { content: "请委派 general 专家研究“星河公司的经营风险”。", goal: "“星河公司的经营风险”", kind: "research" },
    { content: "请交接给 evaluate 专家解释星河公司的经营风险。", goal: "解释星河公司的经营风险", kind: "handoff" },
    { content: "请将当前目标交接给 evaluate 专家，继续核对星河公司的经营风险。", goal: "核对星河公司的经营风险", kind: "handoff" },
  ])("accepts an explicit action even when its goal contains explanatory words or a quoted title: $content", async ({ content, goal, kind }) => {
    const { runtime, principal, run, context } = await collaborationFixture(content,
      ["delegate_research", "web_search", "transfer_to_agent", "get_recent_jd_context"]);
    fixture.runtime = runtime;
    if (kind === "research") expect(await new ResearchDelegationService(runtime).prepare({
      target_agent_id: "general", goal, dependency: "required" }, context)).toMatchObject({ purpose: goal });
    else {
      const checkpoint = (await runtime.getLatestCheckpoint(principal, run.id))!;
      const contract = createAgentTaskContract({ taskType: "general_chat", target: goal });
      await runtime.saveCheckpoint({ runId: run.id, workerId: run.ownerId!, fencingToken: run.fencingToken,
        boundary: "goal_bound", effectiveTask: { contract, agentId: "general" }, context: checkpoint.context,
        plan: checkpoint.plan, budgets: checkpoint.budgets, factRefs: checkpoint.factRefs });
      expect(await transferToAgent.handler({ target_agent_id: "evaluate", goal, reason: "模型建议" }, context))
        .toMatchObject({ success: true, data: { handoff: { reason: content } } });
    }
  });
  it.each([
    "请解释“委派 general 专家研究星河公司的经营风险”是什么意思。",
    "如果需要，请委派 general 专家研究星河公司的经营风险。",
    "不要委派 general 专家研究星河公司的经营风险。",
    "能否委派 general 专家研究星河公司的经营风险？",
    "只是讨论：委派 general 专家研究星河公司的经营风险。",
  ])("rejects non-execution research authorization: %s", async (content) => {
    const { runtime, principal, run, context } = await collaborationFixture(content, ["delegate_research", "web_search"]);
    fixture.runtime = runtime;
    const before = await runtime.listEvents(principal, run.id, 0);
    const result = await delegateResearch.handler({ target_agent_id: "general", goal: "星河公司的经营风险", dependency: "required" }, context);
    expect(result).toMatchObject({ success: false, errorCategory: "policy_denied" });
    expect(await runtime.listRuns(principal)).toHaveLength(1);
    expect(await runtime.listEvents(principal, run.id, 0)).toEqual(before);
  });
  it.each([
    "请解释“交接给 evaluate 专家继续星河公司的经营风险”是什么意思。",
    "如果需要，请交接给 evaluate 专家继续星河公司的经营风险。",
    "不要交接给 evaluate 专家继续星河公司的经营风险。",
    "能否交接给 evaluate 专家继续星河公司的经营风险？",
    "只是讨论：交接给 evaluate 专家继续星河公司的经营风险。",
  ])("rejects non-execution handoff authorization: %s", async (content) => {
    const { runtime, principal, run, context } = await collaborationFixture(content, ["transfer_to_agent", "get_recent_jd_context"]);
    fixture.runtime = runtime;
    const before = await runtime.getRun(principal, run.id);
    const events = await runtime.listEvents(principal, run.id, 0);
    const result = await transferToAgent.handler({ target_agent_id: "evaluate", goal: "星河公司的经营风险", reason: "核对" }, context);
    expect(result).toMatchObject({ success: false, errorCategory: "policy_denied" });
    expect(await runtime.getRun(principal, run.id)).toEqual(before);
    expect(await runtime.listEvents(principal, run.id, 0)).toEqual(events);
  });
  it.each(["research", "handoff"] as const)("rejects a different receiving specialist mentioned only in the goal (%s)", async (kind) => {
    const goal = "简历行业的经营风险";
    const content = kind === "research" ? "请委派 general 专家研究简历行业的经营风险。"
      : "请交接给 evaluate 专家继续简历行业的经营风险。";
    const { runtime, principal, run, context } = await collaborationFixture(content,
      ["delegate_research", "read_file", "transfer_to_agent", "get_recent_jd_context"]);
    fixture.runtime = runtime;
    const before = await runtime.getRun(principal, run.id);
    if (kind === "research") await expect(new ResearchDelegationService(runtime).prepare({
      target_agent_id: "resume", goal, dependency: "required" }, context)).rejects.toThrow();
    else expect(await transferToAgent.handler({ target_agent_id: "resume", goal, reason: "模型自选" }, context))
      .toMatchObject({ success: false, errorCategory: "policy_denied" });
    expect(await runtime.getRun(principal, run.id)).toEqual(before);
    expect(await runtime.listRuns(principal)).toHaveLength(1);
  });
  it.each(["custom", "default", "default_readonly", "default_empty"] as const)("recovers an interrupted handoff through normal Worker execution (%s) and retains its specialist, authorization and tool scope", async (adapter) => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    fixture.runtime = runtime;
    fixture.executor = new GovernedToolAttemptExecutor(registry, new InMemoryToolAttemptStore(), undefined, runtime);
    const principal = { userId: "handoff-worker-recovery-owner" };
    const goal = "核对星河公司的经营风险";
    const content = "请交接给 evaluate 专家继续核对星河公司的经营风险。";
    const original = createAgentTaskContract({ taskType: "general_chat", target: goal });
    const created = await runtime.createRun(principal, { requestId: "handoff-worker-recovery-turn", conversationId: 97,
      taskType: "general_chat", agentId: "general", input: { content }, contract: original });
    vi.spyOn(intentEnvelope, "resolveIntentEnvelope").mockResolvedValue({ kind: "resolved", source: "fast_path",
      envelope: { primaryTask: "general_chat", confidence: "high", referencedMaterials: [], audit: [],
        constraints: { writePolicy: "allowed", noProfileWrite: false, noResumeWrite: false, noReferenceResumeWrite: false } } });
    const responses = [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "worker-handoff-call", function: { name: "transfer_to_agent",
        arguments: JSON.stringify({ target_agent_id: "evaluate", goal, reason: "继续核对" }) } }] } }] },
      { choices: [{ delta: { content: "交接审计尚未完成，需要恢复。" } }] },
      { choices: [{ delta: { content: "公开资料不足，建议先核对来源。" } }] },
    ];
    if (adapter === "default_empty") responses.splice(2, 0, { choices: [{ delta: {
      tool_calls: [{ index: 0, id: "hallucinated-profile-call", function: { name: "get_profile", arguments: "{}" } }],
    } }] });
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-model-key"); vi.stubEnv("ZHIPU_API_KEY", "");
    const model = vi.fn(async () => new Response("data: " + JSON.stringify(responses.shift()) + "\n\ndata: [DONE]\n\n",
      { headers: { "Content-Type": "text/event-stream" } }));
    vi.stubGlobal("fetch", model);
    let conversation: ExecutionConversationMessage[] = [];
    const receivingAgents: string[] = [];
    const initialTools = adapter === "default_empty" ? ["transfer_to_agent", "update_report_metadata"]
      : adapter === "default_readonly" ? ["transfer_to_agent", "get_recent_jd_context", "update_report_metadata"]
        : ["transfer_to_agent", "get_recent_jd_context"];
    const frozenTools = initialTools.filter((tool) => tool !== "transfer_to_agent");
    let source: { type: string; id: string; version: string; hash: string } | undefined;
    const readProfile = vi.fn(async () => null);
    vi.spyOn(agentReadService, "getAgentReadService").mockReturnValue({ getProfile: readProfile } as unknown as ReturnType<typeof agentReadService.getAgentReadService>);
    const engine = new DurableOrchestratorExecutionEngine({ runtime, loadConversation: async () => conversation,
      saveConversation: async (_principal, _conversationId, messages) => { conversation = messages; },
      orchestrate: async function* (input) {
        receivingAgents.push(input.agentId);
        if (!source) source = await attachSource(runtime, principal, (await runtime.getRun(principal, input.runId))!);
        const tools = input.toolAllowlist || initialTools;
        yield* agentLoopServer({ systemPrompt: "继续原目标，使用冻结来源与权限。", messages: input.messages,
          tools: registry.toOpenAITools(tools, true), taskContract: input.taskContract,
          executionContext: { principal, runId: input.runId, workerId: input.workerId, fencingToken: input.fencingToken,
            allowlist: tools, signal: input.signal } });
      } });
    const append = runtime.recordEvent.bind(runtime);
    const interruption = vi.spyOn(runtime, "recordEvent").mockImplementation(async (command) => {
      if (command.type === "run.handoff_completed") throw new Error("handoff audit interrupted");
      return append(command);
    });
    const first = await new AgentWorker({ workerId: "handoff-first-worker", runtime, engine }).runOnce();
    expect(first).toMatchObject({ id: created.run.id, status: "queued", agentId: "evaluate" });
    const interruptedCheckpoint = (await runtime.getLatestCheckpoint(principal, created.run.id))!;
    const handoff = interruptedCheckpoint.context.specialistHandoff as { handoffId: string; authorization: unknown; sourceArtifactIds: string[] };
    expect(handoff).toMatchObject({ agentId: "evaluate", goal, allowedTools: frozenTools,
      reason: content, authorization: { quote: content },
      sourceArtifactIds: [expect.stringContaining("run:" + created.run.id), source!.id].sort(),
      sourceContents: [{ id: source!.id, content: "原始经营材料：星河公司公开资料不足。", contentHash: expect.any(String) }] });
    expect((await runtime.listEvents(principal, created.run.id, 0)).filter((entry) => entry.type === "run.handoff_completed")).toHaveLength(0);
    interruption.mockRestore();
    const restricted = adapter === "default_readonly" || adapter === "default_empty";
    if (restricted) await runtime.submitInput(principal, created.run.id, "handoff-read-only-turn", { content: "不要保存报告或任何写入，只整理事实。" });
    const resumeEngine = adapter !== "custom" ? new DurableOrchestratorExecutionEngine({ runtime,
      loadConversation: async () => conversation, saveConversation: async (_principal, _conversationId, messages) => { conversation = messages; } }) : engine;
    const restored = await new AgentWorker({ workerId: "handoff-restored-worker", runtime, engine: resumeEngine }).runOnce();
    expect(restored?.status, JSON.stringify((await runtime.getLatestCheckpoint(principal, created.run.id))?.context.recovery))
      .toBe(adapter === "default_empty" ? "queued" : "succeeded");
    expect(restored).toMatchObject({ id: created.run.id, status: adapter === "default_empty" ? "queued" : "succeeded", agentId: "evaluate",
      taskType: "general_chat", contract: { target: goal, program: original.program } });
    const completion = await runtime.getLatestCheckpoint(principal, created.run.id);
    expect(completion?.context.specialistHandoff).toMatchObject({ handoffId: handoff.handoffId,
      authorization: handoff.authorization, sourceArtifactIds: handoff.sourceArtifactIds, allowedTools: frozenTools });
    const audited = (await runtime.listEvents(principal, created.run.id, 0)).filter((entry) => entry.type === "run.handoff_completed");
    expect(audited).toHaveLength(1);
    expect(audited[0].payload.handoff).toMatchObject({ handoffId: handoff.handoffId });
    expect(receivingAgents).toEqual(adapter !== "custom" ? ["general"] : ["general", "evaluate"]);
    const resumedRequest = JSON.parse(((model.mock.calls as unknown[][]).at(-1)![1] as { body: string }).body);
    expect((resumedRequest.tools || []).map((entry: { function: { name: string } }) => entry.function.name)).toEqual(adapter === "default_empty" ? [] : ["get_recent_jd_context"]);
    expect(JSON.stringify(resumedRequest.messages)).toContain(handoff.handoffId);
    expect(JSON.stringify(resumedRequest.messages)).toContain(content);
    expect(JSON.stringify(resumedRequest.messages)).toContain("原始经营材料：星河公司公开资料不足。");
    expect(JSON.stringify(resumedRequest.messages)).toContain(source!.hash);
    if (restricted) {
      expect(restored?.contract).toMatchObject({ target: goal, routing: { intentConstraints: { writePolicy: "forbidden" } } });
      expect(JSON.stringify(resumedRequest.messages)).toContain("不要保存报告或任何写入");
    }
    if (adapter === "default_empty") {
      expect(readProfile).toHaveBeenCalledTimes(1);
      const events = await runtime.listEvents(principal, created.run.id, 0);
      expect(events.some((entry) => {
        const event = entry.payload.event as Record<string, unknown> | undefined;
        return event?.type === "tool_result" && event.name === "get_profile" && event.success === false;
      })).toBe(true);
      expect(events.some((entry) => entry.type === "run.model_output_complete")).toBe(false);
      expect(completion?.context.recovery).toMatchObject({ decision: { action: "safe_tool_replan", terminal: false } });
      const completed = await new AgentWorker({ workerId: "handoff-replanned-worker", runtime, engine: resumeEngine }).runOnce();
      expect(completed).toMatchObject({ id: created.run.id, status: "succeeded", agentId: "evaluate",
        contract: { target: goal, routing: { intentConstraints: { writePolicy: "forbidden" } } } });
      const finalRequest = JSON.parse(((model.mock.calls as unknown[][]).at(-1)![1] as { body: string }).body);
      expect(finalRequest.tools || []).toEqual([]);
      expect((await runtime.listEvents(principal, created.run.id, 0)).filter((entry) => entry.type === "run.handoff_completed")).toHaveLength(1);
      expect(readProfile).toHaveBeenCalledTimes(2);
    }
  });
  it("cannot downgrade Program-required research even when the user describes it as optional", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const principal = { userId: "program-research-owner" };
    const content = "可选辅助研究：请委派 evaluate 专家研究星河公司的经营风险。";
    await runtime.createRun(principal, { requestId: "program-required-turn", conversationId: null, taskType: "jd_evaluation",
      agentId: "evaluate", input: { content }, contract: createAgentTaskContract({ taskType: "jd_evaluation", target: content }) });
    const run = (await runtime.claimNextRun({ workerId: "program-required-worker" }))!;
    await runtime.saveCheckpoint({ runId: run.id, workerId: run.ownerId!, fencingToken: run.fencingToken,
      boundary: "before_model", context: { conversationMessages: [{ id: "program-source", role: "user", content }] },
      plan: {}, budgets: {}, factRefs: [] });
    const service = new ResearchDelegationService(runtime);
    const context = { principal, runId: run.id, workerId: run.ownerId!, fencingToken: run.fencingToken,
      allowlist: ["delegate_research", "read_file"] };
    await expect(service.prepare({ target_agent_id: "evaluate", goal: "星河公司的经营风险", dependency: "supporting" }, context)).rejects.toThrow();
    expect(await service.prepare({ target_agent_id: "evaluate", goal: "星河公司的经营风险", dependency: "required" }, context)).toMatchObject({ dependency: "required" });
  });
  it.each(["source", "authorization", "tools"] as const)("rejects a changed frozen handoff before resumed model execution (%s)", async (changed) => {
    const { runtime, principal, run, context } = await collaborationFixture(
      "请交接给 evaluate 专家继续星河公司的经营风险。", ["transfer_to_agent", "get_recent_jd_context"]);
    fixture.runtime = runtime;
    await attachSource(runtime, principal, run);
    expect((await transferToAgent.handler({ target_agent_id: "evaluate", goal: "星河公司的经营风险", reason: "核对" }, context)).success).toBe(true);
    const checkpoint = (await runtime.getLatestCheckpoint(principal, run.id))!;
    const handoff = checkpoint.context.specialistHandoff as Record<string, unknown>;
    const material = checkpoint.context.attachmentMaterial as Record<string, unknown>;
    await runtime.saveCheckpoint({ runId: run.id, workerId: context.workerId, fencingToken: context.fencingToken,
      boundary: "resume_source_review", context: { ...checkpoint.context,
        ...(changed === "source" ? { attachmentMaterial: { ...material, intake: { extractedText: "已变更的来源正文" } } } : {}),
        ...(changed === "authorization" ? { conversationMessages: [{ id: "collaboration-boundary-source", role: "user", content: "不要交接给 evaluate 专家继续星河公司的经营风险。" }] } : {}),
        ...(changed === "tools" ? { specialistHandoff: { ...handoff, allowedTools: ["get_recent_jd_context", "update_report_metadata"] } } : {}),
      }, plan: checkpoint.plan, budgets: checkpoint.budgets, factRefs: checkpoint.factRefs });
    const current = (await runtime.getRun(principal, run.id))!;
    const before = await runtime.listEvents(principal, run.id, 0);
    const orchestrate = vi.fn(async function* () { yield { type: "text", content: "不应执行" }; });
    const saveConversation = vi.fn(async () => undefined);
    const engine = new DurableOrchestratorExecutionEngine({ runtime, orchestrate,
      loadConversation: async () => [], saveConversation });
    await expect(engine.execute({ run: current, checkpoint: await runtime.getLatestCheckpoint(principal, run.id),
      signal: new AbortController().signal })).rejects.toThrow();
    expect(orchestrate).not.toHaveBeenCalled();
    expect(saveConversation).not.toHaveBeenCalled();
    expect(await runtime.listEvents(principal, run.id, 0)).toEqual(before);
    expect(await runtime.getRun(principal, run.id)).toEqual(current);
  });
  it("signals an executing research child when its parent cancels and records no successful findings", async () => {
    const { runtime, principal, run, context } = await collaborationFixture(
      "请委派 general 专家研究星河公司的经营风险。", ["delegate_research", "web_search"]);
    let childSignal: AbortSignal | undefined;
    const engine = new DurableOrchestratorExecutionEngine({ runtime, researchLoop: async function* (input) {
      childSignal = input.signal;
      await new Promise<void>((resolve) => input.signal!.addEventListener("abort", () => resolve(), { once: true }));
      yield { type: "text", content: "取消后不完整文本" }; yield { type: "done" };
    } });
    const worker = new AgentWorker({ workerId: "executing-cancel-child", runtime, engine });
    const stop = new AbortController();
    const pending = new ResearchDelegationService(runtime, 500).execute({
      target_agent_id: "general", goal: "星河公司的经营风险", dependency: "required" }, context);
    const queue = worker.runForever({ signal: stop.signal, concurrency: 1, pollIntervalMs: 1 });
    try {
      for (let attempt = 0; !childSignal && attempt < 100; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 1));
      expect(childSignal).toBeDefined();
      await runtime.requestCancel(principal, run.id, "cancel-executing-parent");
      await pending;
      for (let attempt = 0; !childSignal!.aborted && attempt < 100; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 1));
      expect(childSignal!.aborted).toBe(true);
      const child = (await runtime.listRuns(principal)).find((entry) => entry.parentRunId === run.id)!;
      const checkpoint = await runtime.getLatestCheckpoint(principal, child.id);
      expect(checkpoint?.context.researchFindings).toBeUndefined();
    } finally { stop.abort(); if (!childSignal?.aborted) worker.drain(); }
    await queue;
  });
  it("recovers a persisted handoff after its audit append fails without applying a second handoff", async () => {
    const { runtime, principal, run, context } = await collaborationFixture(
      "请交接给 evaluate 专家继续星河公司的经营风险。", ["transfer_to_agent", "get_recent_jd_context"]);
    fixture.runtime = runtime;
    const append = runtime.recordEvent.bind(runtime);
    const interruption = vi.spyOn(runtime, "recordEvent").mockImplementation(async (command) => {
      if (command.type === "run.handoff_completed") throw new Error("audit append interrupted");
      return append(command);
    });
    const params = { target_agent_id: "evaluate", goal: "星河公司的经营风险", reason: "继续核对" };
    const interrupted = await transferToAgent.handler(params, context);
    expect(interrupted).toMatchObject({ success: false, errorCategory: "transient", data: { state: "audit_pending" } });
    expect(await runtime.getRun(principal, run.id)).toMatchObject({ agentId: "evaluate" });
    const checkpoint = await runtime.getLatestCheckpoint(principal, run.id);
    expect(checkpoint?.context.specialistHandoff).toMatchObject({ authorization: { turnId: "collaboration-boundary-source" },
      allowedTools: ["get_recent_jd_context"], sourceArtifactIds: ["collaboration-boundary-source"] });
    interruption.mockRestore();
    const restored = await transferToAgent.handler(params, context);
    expect(restored.success).toBe(true);
    expect((await runtime.getLatestCheckpoint(principal, run.id))?.id).toBe(checkpoint?.id);
    expect((await runtime.listEvents(principal, run.id, 0)).filter((entry) => entry.type === "run.handoff_completed")).toHaveLength(1);
  });
  it("refuses unauthorized, foreign-source, empty-permission and stale-fence handoffs without modifying the Run", async () => {
    const cases = [
      { content: "继续星河公司的经营风险。", allowlist: ["transfer_to_agent", "get_recent_jd_context"], params: {}, stale: false },
      { content: "不要交接给 evaluate 专家继续星河公司的经营风险。", allowlist: ["transfer_to_agent", "get_recent_jd_context"], params: {}, stale: false },
      { content: "请交接给 evaluate 专家继续星河公司的经营风险。", allowlist: ["transfer_to_agent", "get_recent_jd_context"], params: { source_artifact_ids: ["foreign-source"] }, stale: false },
      { content: "请交接给 evaluate 专家继续星河公司的经营风险。", allowlist: [], params: {}, stale: false },
      { content: "请交接给 evaluate 专家继续星河公司的经营风险。", allowlist: ["transfer_to_agent", "get_recent_jd_context"], params: {}, stale: true },
    ];
    for (const scenario of cases) {
      const { runtime, principal, run, context } = await collaborationFixture(scenario.content, scenario.allowlist);
      fixture.runtime = runtime;
      const before = await runtime.getRun(principal, run.id);
      const result = await transferToAgent.handler({ target_agent_id: "evaluate", goal: "星河公司的经营风险",
        reason: "继续核对", ...scenario.params }, { ...context, fencingToken: run.fencingToken + (scenario.stale ? 1 : 0) });
      expect(result).toMatchObject({ success: false, errorCategory: "policy_denied" });
      expect(await runtime.getRun(principal, run.id)).toEqual(before);
    }
  });
  it("returns admission_required for an authorized different goal and retains the old Run contract", async () => {
    const { runtime, principal, run, context } = await collaborationFixture(
      "请交接给 evaluate 专家评估新的JD。", ["transfer_to_agent", "get_recent_jd_context"]);
    fixture.runtime = runtime;
    const before = await runtime.getRun(principal, run.id);
    const result = await transferToAgent.handler({ target_agent_id: "evaluate", goal: "评估新的JD", reason: "用户新目标" }, context);
    expect(result).toMatchObject({ success: false, errorCategory: "need_user_input",
      data: { state: "admission_required", admissionRequired: true }, uiPayload: { admissionRequired: true } });
    expect(await runtime.getRun(principal, run.id)).toEqual(before);
    expect(await runtime.listRuns(principal)).toHaveLength(1);
  });
  it("times out queued research honestly, requests cancellation and lets the normal queue cancel the child", async () => {
    const { runtime, principal, run, context } = await collaborationFixture(
      "请委派 general 专家研究星河公司的经营风险。", ["delegate_research", "web_search"]);
    const result = await new ResearchDelegationService(runtime, 25).execute({
      target_agent_id: "general", goal: "星河公司的经营风险", dependency: "required" }, context);
    expect(result).toMatchObject({ success: false, errorCategory: "need_user_input", data: { dependency: "required", state: "failed" } });
    expect(result.error).toContain("超时");
    const child = (await runtime.listRuns(principal)).find((entry) => entry.parentRunId === run.id)!;
    expect(child.status).toBe("cancel_requested");
    const model = vi.fn();
    const worker = new AgentWorker({ workerId: "timeout-child-worker", runtime, engine: { execute: model } });
    expect(await worker.runOnce()).toMatchObject({ id: child.id, status: "cancelled", ownerId: "timeout-child-worker" });
    expect(model).not.toHaveBeenCalled();
    expect(await runtime.getLatestCheckpoint(principal, child.id)).toBeNull();
  });
  it("propagates parent cancellation to queued research without consuming or adopting a child result", async () => {
    const { runtime, principal, run, context } = await collaborationFixture(
      "请委派 general 专家研究星河公司的经营风险。", ["delegate_research", "web_search"]);
    const signal = new AbortController();
    const pending = new ResearchDelegationService(runtime, 500).execute({
      target_agent_id: "general", goal: "星河公司的经营风险", dependency: "required" }, { ...context, signal: signal.signal });
    let children = (await runtime.listRuns(principal)).filter((entry) => entry.parentRunId === run.id);
    for (let attempt = 0; !children.length && attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1));
      children = (await runtime.listRuns(principal)).filter((entry) => entry.parentRunId === run.id);
    }
    expect(children).toHaveLength(1);
    await runtime.requestCancel(principal, run.id, "cancel-parent");
    signal.abort();
    expect(await pending).toMatchObject({ success: false, errorCategory: "need_user_input", data: { state: "failed" } });
    expect(await runtime.getRun(principal, children[0].id)).toMatchObject({ status: "cancel_requested" });
    await runtime.transitionRun({ runId: run.id, workerId: run.ownerId!, fencingToken: run.fencingToken, nextStatus: "cancelled" });
    const worker = new AgentWorker({ workerId: "cancel-cascade-worker", runtime, engine: { execute: vi.fn() } });
    expect(await worker.runOnce()).toMatchObject({ status: "cancelled" });
    expect(await runtime.getRun(principal, run.id)).toMatchObject({ status: "cancelled" });
    expect(await runtime.getRun(principal, children[0].id)).toMatchObject({ status: "cancelled" });
    expect((await runtime.listEvents(principal, run.id, 0)).some((event) => event.type === "subagent.consumed")).toBe(false);
  });
  it("fails closed when bound source bytes or owner change before handoff or delegation", async () => {
    for (const corruption of ["bytes", "owner"]) {
      const content = "请委派 general 专家研究星河公司的经营风险，并交接给 evaluate 专家继续星河公司的经营风险。";
      const { runtime, principal, run, context } = await collaborationFixture(content,
        ["delegate_research", "web_search", "transfer_to_agent", "get_recent_jd_context"]);
      fixture.runtime = runtime;
      await attachSource(runtime, principal, run);
      const checkpoint = (await runtime.getLatestCheckpoint(principal, run.id))!;
      const material = checkpoint.context.attachmentMaterial as Record<string, unknown>;
      await runtime.saveCheckpoint({ runId: run.id, workerId: run.ownerId!, fencingToken: run.fencingToken,
        boundary: "source_changed", context: { ...checkpoint.context, attachmentMaterial: { ...material,
          ...(corruption === "bytes" ? { images: ["changed-source-image"] } : { userId: "foreign-owner" }) } },
        plan: checkpoint.plan, budgets: checkpoint.budgets, factRefs: checkpoint.factRefs });
      const before = await runtime.listEvents(principal, run.id, 0);
      const delegation = await delegateResearch.handler({ target_agent_id: "general", goal: "星河公司的经营风险", dependency: "required" }, context);
      const handoff = await transferToAgent.handler({ target_agent_id: "evaluate", goal: "星河公司的经营风险", reason: "核对" }, context);
      expect(delegation).toMatchObject({ success: false, errorCategory: "policy_denied" });
      expect(handoff).toMatchObject({ success: false, errorCategory: "policy_denied" });
      expect(await runtime.listRuns(principal)).toHaveLength(1);
      expect(await runtime.getRun(principal, run.id)).toMatchObject({ agentId: "general" });
      expect(await runtime.listEvents(principal, run.id, 0)).toEqual(before);
    }
  });
  it("rejects missing user authorization, unbound sources, empty permissions and stale worker fences before creating children", async () => {
    const cases = [
      { name: "no authorization", content: "请研究星河公司的经营风险。", allowlist: ["delegate_research", "web_search"], params: {}, stale: false },
      { name: "denied authorization", content: "不要委派 general 专家研究星河公司的经营风险。", allowlist: ["delegate_research", "web_search"], params: {}, stale: false },
      { name: "unbound source", content: "请委派 general 专家研究星河公司的经营风险。", allowlist: ["delegate_research", "web_search"], params: { source_artifact_ids: ["foreign-jd"] }, stale: false },
      { name: "empty allowlist", content: "请委派 general 专家研究星河公司的经营风险。", allowlist: [], params: {}, stale: false },
      { name: "missing tool permission", content: "请委派 general 专家研究星河公司的经营风险。", allowlist: ["web_search"], params: {}, stale: false },
      { name: "stale fence", content: "请委派 general 专家研究星河公司的经营风险。", allowlist: ["delegate_research", "web_search"], params: {}, stale: true },
    ];
    for (const scenario of cases) {
      const { runtime, principal, run, context } = await collaborationFixture(scenario.content, scenario.allowlist);
      fixture.runtime = runtime;
      const before = await runtime.listEvents(principal, run.id, 0);
      const result = await delegateResearch.handler({ target_agent_id: "general", goal: "星河公司的经营风险",
        dependency: "required", ...scenario.params }, { ...context, fencingToken: run.fencingToken + (scenario.stale ? 1 : 0) });
      expect(result.success, scenario.name).toBe(false);
      expect(result.errorCategory, scenario.name).toBe("policy_denied");
      expect(await runtime.listRuns(principal), scenario.name).toHaveLength(1);
      expect(await runtime.listEvents(principal, run.id, 0), scenario.name).toEqual(before);
    }
  });
  it("passes durable handoff sources and constraints to the receiving expert without widening its tools", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    fixture.runtime = runtime;
    fixture.executor = new GovernedToolAttemptExecutor(registry, new InMemoryToolAttemptStore(), undefined, runtime);
    const principal = { userId: "handoff-loop-owner" };
    const goal = "核对星河公司的经营风险";
    const content = "请将当前目标交接给 evaluate 专家，继续核对星河公司的经营风险。";
    const contract = createAgentTaskContract({ taskType: "general_chat", target: goal });
    await runtime.createRun(principal, { requestId: "handoff-loop-turn", conversationId: 95, taskType: "general_chat",
      agentId: "general", input: { content }, contract });
    const run = (await runtime.claimNextRun({ workerId: "handoff-loop-worker" }))!;
    await runtime.saveCheckpoint({ runId: run.id, workerId: run.ownerId!, fencingToken: run.fencingToken,
      boundary: "before_model", context: { conversationMessages: [{ id: "handoff-loop-source", role: "user", content }] },
      plan: {}, budgets: {}, factRefs: [] });
    const source = await attachSource(runtime, principal, run);
    const responses = [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "handoff-call", function: { name: "transfer_to_agent",
        arguments: JSON.stringify({ target_agent_id: "evaluate", goal, reason: "核对经营风险", source_artifact_ids: [source.id] }) } }] } }] },
      { choices: [{ delta: { content: "需要先核对来源，再讨论经营风险。" } }] },
    ];
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-model-key"); vi.stubEnv("ZHIPU_API_KEY", "");
    const model = vi.fn(async () => new Response("data: " + JSON.stringify(responses.shift()) + "\n\ndata: [DONE]\n\n",
      { headers: { "Content-Type": "text/event-stream" } }));
    vi.stubGlobal("fetch", model);
    const events = [];
    for await (const event of agentLoopServer({ systemPrompt: "只核对原目标，禁止保存报告。", messages: [{ role: "user", content }],
      tools: registry.toOpenAITools(["transfer_to_agent", "get_recent_jd_context"], true), taskContract: contract,
      executionContext: { principal, runId: run.id, workerId: run.ownerId!, fencingToken: run.fencingToken,
        allowlist: ["transfer_to_agent", "get_recent_jd_context"] } })) events.push(event);
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "agent_switch", agentId: "evaluate" })]));
    const request = JSON.parse(((model.mock.calls as unknown[][])[1][1] as { body: string }).body);
    expect(request.tools.map((entry: { function: { name: string } }) => entry.function.name)).toEqual(["get_recent_jd_context"]);
    expect(JSON.stringify(request.messages)).toContain(source.id);
    expect(JSON.stringify(request.messages)).toContain(source.hash);
    expect(JSON.stringify(request.messages)).toContain("原始经营材料");
    expect(JSON.stringify(request.messages)).toContain("核对星河公司的经营风险");
    expect(JSON.stringify(request.messages)).toContain("禁止保存报告");
  });
  it("persists an authorized specialist handoff in the same Run without changing its goal, Program or sources", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    fixture.runtime = runtime;
    const principal = { userId: "handoff-owner" };
    const goal = "核对星河公司的经营风险";
    const content = "请将当前目标交接给 evaluate 专家，继续核对星河公司的经营风险。";
    const contract = createAgentTaskContract({ taskType: "general_chat", target: goal });
    const created = await runtime.createRun(principal, { requestId: "handoff-turn", conversationId: 94,
      taskType: contract.taskType, agentId: "general", input: { content }, contract });
    const run = (await runtime.claimNextRun({ workerId: "handoff-worker" }))!;
    await runtime.saveCheckpoint({ runId: run.id, workerId: run.ownerId!, fencingToken: run.fencingToken,
      boundary: "before_model", context: { conversationMessages: [{ id: "handoff-source", role: "user", content }] },
      plan: { completedCriteria: ["source read"] }, budgets: {}, factRefs: [] });
    const source = await attachSource(runtime, principal, run);
    const context = { principal, runId: run.id, workerId: run.ownerId!, fencingToken: run.fencingToken,
      allowlist: ["transfer_to_agent", "get_recent_jd_context"] };
    const params = { target_agent_id: "evaluate", goal, reason: "专家继续核对", source_artifact_ids: [source.id],
      summary_for_target: "模型伪造的已验证个人经历" };
    const result = await transferToAgent.handler(params, context);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ handoff: { runId: created.run.id, agentId: "evaluate", goal,
      fromTask: "general_chat", toTask: "general_chat", sourceArtifactIds: ["handoff-source", source.id].sort(),
      sourceRefs: [source], readBackVerified: true } });
    expect(JSON.stringify(result.data)).not.toContain("模型伪造的已验证个人经历");
    expect(await runtime.getRun(principal, run.id)).toMatchObject({ id: created.run.id, agentId: "evaluate", contract });
    expect((await runtime.getLatestCheckpoint(principal, run.id))?.plan).toEqual({ completedCriteria: ["source read"] });
    const replay = await transferToAgent.handler(params, context);
    expect(replay.data).toEqual(result.data);
    expect((await runtime.listRuns(principal))).toHaveLength(1);
    expect((await runtime.listEvents(principal, run.id, 0)).filter((entry) => entry.type === "run.handoff_completed")).toHaveLength(1);
  });
  it("continues after explicitly optional research fails and appends the limitation even when the model omits it", async () => {
    const result = await executeParentWithInvalidResearch("supporting");
    expect(result.parent?.status).toBe("succeeded");
    expect(result.model).toHaveBeenCalledTimes(2);
    const answer = result.conversation.filter((entry) => entry.role === "assistant").map((entry) => entry.content).join("\n");
    expect(answer).toContain("建议先核对企业资料再做决定。");
    expect(answer).toContain("本次结论缺少这项辅助研究");
    expect(answer).not.toContain("未验证的部分文本");
    expect(result.child?.status).toBe("failed");
  });
  it("keeps a parent waiting on required invalid research and never adopts partial child text", async () => {
    const result = await executeParentWithInvalidResearch("required");
    expect(result.parent?.status).toBe("waiting_user");
    expect(result.model).toHaveBeenCalledTimes(1);
    expect(result.conversation.filter((entry) => entry.role === "assistant").map((entry) => entry.content).join("\n")).toContain("主任务等待恢复");
    expect(result.conversation.some((entry) => entry.content.includes("未验证的部分文本"))).toBe(false);
    expect(result.child?.status).toBe("failed");
  });
  it("preserves one identity from start through child result and parent consumption, then uses structured findings in the next model call", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    fixture.runtime = runtime;
    fixture.executor = new GovernedToolAttemptExecutor(registry, new InMemoryToolAttemptStore(), undefined, runtime);
    const principal = { userId: "collaboration-loop-owner" };
    const content = "请委派 general 专家研究星河公司的经营风险。";
    await runtime.createRun(principal, { requestId: "loop-research-turn", conversationId: 92, taskType: "general_chat", agentId: "general",
      input: { content }, contract: createAgentTaskContract({ taskType: "general_chat", target: content }) });
    const parent = (await runtime.claimNextRun({ workerId: "parent-loop-worker" }))!;
    await runtime.saveCheckpoint({ runId: parent.id, workerId: parent.ownerId!, fencingToken: parent.fencingToken,
      boundary: "before_model", context: { conversationMessages: [{ id: "loop-source-1", role: "user", content }] }, plan: {}, budgets: {}, factRefs: [] });
    const output = { schema: "research-findings/v1", findings: "未查到经营风险的可靠证据。", keyPoints: ["不能把未知当成安全。"],
      sourceArtifactIds: ["loop-source-1"], limitations: ["企业资料不足。"] };
    const responses = [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "delegate-call", function: { name: "delegate_research",
        arguments: JSON.stringify({ target_agent_id: "general", goal: "星河公司的经营风险", dependency: "required" }) } }] } }] },
      { choices: [{ delta: { content: "公开证据不足，建议先核对企业公告。" } }] },
    ];
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-model-key"); vi.stubEnv("ZHIPU_API_KEY", "");
    const model = vi.fn(async () => new Response("data: " + JSON.stringify(responses.shift()) + "\n\ndata: [DONE]\n\n",
      { headers: { "Content-Type": "text/event-stream" } }));
    vi.stubGlobal("fetch", model);
    const worker = new AgentWorker({ workerId: "loop-child-worker", runtime, engine: new DurableOrchestratorExecutionEngine({ runtime,
      researchLoop: async function* () { yield { type: "text", content: JSON.stringify(output) }; yield { type: "done" }; } }) });
    const stop = new AbortController();
    const queue = worker.runForever({ signal: stop.signal, concurrency: 1, pollIntervalMs: 1 });
    const events = [];
    try {
      for await (const event of agentLoopServer({ systemPrompt: "依据研究结论回答，不升级为个人事实。", messages: [{ role: "user", content }],
        tools: registry.toOpenAITools(["delegate_research"], true), executionContext: { principal, runId: parent.id, workerId: parent.ownerId!,
          fencingToken: parent.fencingToken, allowlist: ["delegate_research", "web_search"] } })) events.push(event);
      const lifecycle = events.filter((event) => event.type.startsWith("subagent."));
      expect(lifecycle.map((event) => event.type)).toEqual(["subagent.started", "subagent.finished", "subagent.consumed"]);
      const result = events.find((event) => event.type === "tool_result");
      const delegationId = (result?.type === "tool_result" ? result.data as { delegationId: string } : undefined)?.delegationId;
      expect(lifecycle.every((event) => "delegationId" in event && event.delegationId === delegationId)).toBe(true);
      expect(lifecycle[0]).toMatchObject({ dependency: "required", sourceArtifactIds: ["loop-source-1"], constraints: { readOnly: true } });
      const nextPrompt = String((model.mock.calls as unknown[][])[1][1] && ((model.mock.calls as unknown[][])[1][1] as { body: string }).body);
      expect(nextPrompt).toContain(output.findings);
      expect(nextPrompt).toContain("research-findings/v1");
      expect(nextPrompt).toContain("不属于已验证的用户个人事实");
    } finally { stop.abort(); await queue; }
  });
  it("runs research as one replayable read-only child with an independent Worker fence", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    fixture.runtime = runtime;
    const principal = { userId: "collaboration-owner" };
    const content = "请委派 general 专家研究星河公司的经营风险。";
    const created = await runtime.createRun(principal, {
      requestId: "research-user-turn", conversationId: 91, taskType: "general_chat", agentId: "general",
      input: { content }, contract: createAgentTaskContract({ taskType: "general_chat", target: content }),
    });
    const parent = (await runtime.claimNextRun({ workerId: "parent-worker" }))!;
    await runtime.saveCheckpoint({ runId: parent.id, workerId: parent.ownerId!, fencingToken: parent.fencingToken,
      boundary: "before_model", context: { latestInputRequestId: "research-user-turn",
        conversationMessages: [{ id: "user-turn-1", role: "user", content }] }, plan: {}, budgets: {}, factRefs: [] });
    const output = { schema: "research-findings/v1", findings: "公开材料尚不足以判断经营风险。",
      keyPoints: ["应核对企业公告和招聘材料。"], sourceArtifactIds: ["user-turn-1"], limitations: ["缺少企业公开材料。"] };
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-model-key");
    vi.stubEnv("ZHIPU_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      'data: ' + JSON.stringify({ choices: [{ delta: { content: JSON.stringify(output) } }] }) + '\n\ndata: [DONE]\n\n',
      { headers: { "Content-Type": "text/event-stream" } },
    )));
    const engine = new DurableOrchestratorExecutionEngine({ runtime,
      researchLoop: async function* () { yield { type: "text", content: JSON.stringify(output) }; yield { type: "done" }; } });
    const childWorker = new AgentWorker({ workerId: "research-worker", runtime, engine });
    const stop = new AbortController();
    const queue = childWorker.runForever({ signal: stop.signal, concurrency: 1, pollIntervalMs: 1 });
    const context = { principal, runId: parent.id, workerId: parent.ownerId!, fencingToken: parent.fencingToken,
      allowlist: ["delegate_research", "web_search"], requestId: "tool-attempt", signal: new AbortController().signal };
    let result;
    try {
      result = await delegateResearch.handler({ target_agent_id: "general", goal: "星河公司的经营风险", dependency: "required" }, context);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ findings: output.findings, keyPoints: output.keyPoints, dependency: "required", readBackVerified: true });
      const children = (await runtime.listRuns(principal)).filter((run) => run.parentRunId === created.run.id);
      expect(children).toHaveLength(1);
      expect(children[0]).toMatchObject({ conversationId: null, depth: 1, ownerId: "research-worker", status: "succeeded" });
      expect(children[0].id).not.toBe(parent.id);
      expect(children[0].contract).toMatchObject({ outputSchema: "research-findings/v1", allowedTools: ["web_search"],
        constraints: { readOnly: true, noUserInteraction: true, noPersonalMemoryWrite: true }, sourceArtifactIds: ["user-turn-1"] });
      const replay = await delegateResearch.handler({ target_agent_id: "general", goal: "星河公司的经营风险", dependency: "required" }, context);
      expect(replay.data).toEqual(result.data);
      expect((await runtime.listRuns(principal)).filter((run) => run.parentRunId === parent.id)).toHaveLength(1);
      expect(await runtime.getRun({ userId: "foreign-owner" }, children[0].id)).toBeNull();
    } finally { stop.abort(); await queue; }
  });
});

async function collaborationFixture(content: string, allowlist: string[]) {
  const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
  const principal = { userId: "collaboration-boundary-owner" };
  await runtime.createRun(principal, { requestId: "collaboration-boundary-turn", conversationId: 96,
    taskType: "general_chat", agentId: "general", input: { content },
    contract: createAgentTaskContract({ taskType: "general_chat", target: "星河公司的经营风险" }) });
  const run = (await runtime.claimNextRun({ workerId: "collaboration-boundary-worker" }))!;
  await runtime.saveCheckpoint({ runId: run.id, workerId: run.ownerId!, fencingToken: run.fencingToken,
    boundary: "before_model", context: { conversationMessages: [{ id: "collaboration-boundary-source", role: "user", content }] },
    plan: {}, budgets: {}, factRefs: [] });
  return { runtime, principal, run, context: { principal, runId: run.id, workerId: run.ownerId!,
    fencingToken: run.fencingToken, allowlist } };
}

async function attachSource(runtime: DurableAgentRunService, principal: { userId: string },
  run: Awaited<ReturnType<DurableAgentRunService["claimNextRun"]>> & {}) {
  const checkpoint = (await runtime.getLatestCheckpoint(principal, run.id))!;
  const images = ["synthetic-source-image"];
  const hash = createHash("sha256").update(images.join("\n")).digest("hex");
  const source = { type: "attachment", id: "source-attachment", version: "v1", hash };
  await runtime.saveCheckpoint({ runId: run.id, workerId: run.ownerId!, fencingToken: run.fencingToken,
    boundary: "source_bound", context: { ...checkpoint.context, attachmentMaterial: {
      id: source.id, userId: principal.userId, runId: run.id, images, sourceImages: images, sourceHash: hash,
      intake: { extractedText: "原始经营材料：星河公司公开资料不足。" } } },
    plan: checkpoint.plan, budgets: checkpoint.budgets, factRefs: [source] });
  return source;
}

async function executeParentWithInvalidResearch(dependency: "required" | "supporting") {
  const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
  fixture.runtime = runtime;
  fixture.executor = new GovernedToolAttemptExecutor(registry, new InMemoryToolAttemptStore(), undefined, runtime);
  const principal = { userId: "failure-owner-" + dependency };
  const content = (dependency === "supporting" ? "可选辅助研究：" : "") + "请委派 general 专家研究星河公司的经营风险。";
  const created = await runtime.createRun(principal, { requestId: "failure-turn", conversationId: 93, taskType: "general_chat", agentId: "general",
    input: { content }, contract: createAgentTaskContract({ taskType: "general_chat", target: content }) });
  vi.spyOn(intentEnvelope, "resolveIntentEnvelope").mockResolvedValue({ kind: "resolved", source: "fast_path", envelope: {
    primaryTask: "general_chat", confidence: "high", referencedMaterials: [], audit: [],
    constraints: { writePolicy: "forbidden", noProfileWrite: true, noResumeWrite: true, noReferenceResumeWrite: true },
  } });
  const responses = [
    { choices: [{ delta: { tool_calls: [{ index: 0, id: "invalid-research-call", function: { name: "delegate_research",
      arguments: JSON.stringify({ target_agent_id: "general", goal: "星河公司的经营风险", dependency }) } }] } }] },
    { choices: [{ delta: { content: "建议先核对企业资料再做决定。" } }] },
  ];
  vi.stubEnv("DEEPSEEK_API_KEY", "fixture-model-key"); vi.stubEnv("ZHIPU_API_KEY", "");
  const model = vi.fn(async () => new Response("data: " + JSON.stringify(responses.shift()) + "\n\ndata: [DONE]\n\n",
    { headers: { "Content-Type": "text/event-stream" } }));
  vi.stubGlobal("fetch", model);
  let conversation: ExecutionConversationMessage[] = [];
  const engine = new DurableOrchestratorExecutionEngine({ runtime, loadConversation: async () => conversation,
    saveConversation: async (_principal, _conversationId, messages) => { conversation = messages; },
    orchestrate: (input) => agentLoopServer({ systemPrompt: "完成原任务", messages: input.messages.map((entry) => ({ role: entry.role, content: entry.content })),
      tools: registry.toOpenAITools(["delegate_research"], true), taskContract: input.taskContract,
      executionContext: { principal, runId: input.runId, workerId: input.workerId, fencingToken: input.fencingToken,
        requestId: input.requestId, allowlist: ["delegate_research", "web_search"], signal: input.signal } }),
    researchLoop: async function* () { yield { type: "text", content: "未验证的部分文本" }; yield { type: "done" }; },
  });
  const parentWorker = new AgentWorker({ workerId: "failure-parent-worker", runtime, engine });
  const childWorker = new AgentWorker({ workerId: "failure-child-worker", runtime, engine });
  const stop = new AbortController();
  const parentExecution = parentWorker.runOnce();
  const queue = childWorker.runForever({ signal: stop.signal, concurrency: 1, pollIntervalMs: 1 });
  try {
    const parent = await parentExecution;
    const child = (await runtime.listRuns(principal)).find((run) => run.parentRunId === created.run.id);
    return { parent, child, conversation, model, runtime, principal };
  } finally { stop.abort(); await queue; }
}
