import { describe, expect, it } from "vitest";
import {
  DurableAgentRunService,
  InMemoryAgentRunStore,
} from "@/lib/agent/runtime/durable-agent-run";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";
import { createAgentTaskContract, type AgentTaskType } from "@/lib/agent/task-contract";

const ADVISORY_TASKS: AgentTaskType[] = [
  "general_chat",
  "career_positioning_guidance",
  "resume_query",
  "interview_coaching",
];

const VERIFIED_EFFECT_TASKS: AgentTaskType[] = [
  "resume_edit",
  "jd_evaluation",
  "offer_evaluation",
  "profile_update",
  "reference_resume_save",
  "file_export",
  "job_search",
];

describe("Durable Orchestrator execution engine", () => {
  it("satisfies the durable general-chat contract with an assistant response", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const contract = createAgentTaskContract({ taskType: "general_chat", target: "给出三步计划" });
    await runtime.createRun(
      { userId: "user-general-chat" },
      {
        requestId: "request-general-chat",
        conversationId: 41,
        taskType: "general_chat",
        agentId: "general",
        input: { content: "请给我一份三步求职行动计划" },
        contract,
      },
    );
    const run = await runtime.claimNextRun({ workerId: "worker-general-chat" });
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async () => undefined,
      orchestrate: async function* () {
        yield { type: "text", content: "第一步投递，第二步复盘，第三步跟进。" };
        yield { type: "done" };
      },
    });

    const result = await engine.execute({
      run: run!,
      checkpoint: null,
      signal: new AbortController().signal,
    });

    expect(result.outcome).toBe("succeeded");
  });

  it.each(ADVISORY_TASKS)("does not mistake an internal tool-only %s result for a user delivery", async (taskType) => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const savedConversations: unknown[] = [];
    const contract = createAgentTaskContract({ taskType, target: `test:${taskType}` });
    await runtime.createRun(
      { userId: `user-advisory-${taskType}` },
      {
        requestId: `request-advisory-${taskType}`,
        conversationId: 100,
        taskType,
        agentId: "general",
        input: { content: `test:${taskType}` },
        contract,
      },
    );
    const run = await runtime.claimNextRun({ workerId: `worker-advisory-${taskType}` });
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async (_principal, _conversationId, messages) => {
        savedConversations.push(messages);
      },
      orchestrate: async function* () {
        yield { type: "tool_result", name: "test_tool", success: true, result: "工具结果可用" };
        yield { type: "done" };
      },
    });

    await expect(engine.execute({
      run: run!,
      checkpoint: null,
      signal: new AbortController().signal,
    })).rejects.toThrow("Run Contract unmet");
    expect(savedConversations.length).toBeGreaterThan(0);
    expect(savedConversations.at(-1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "user", content: `test:${taskType}` }),
      expect.objectContaining({ role: "assistant" }),
    ]));
  });

  it("turns the self-positioning framework into a real first-stage question", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const savedConversations: Array<Array<{ role: string; content: string }>> = [];
    const contract = createAgentTaskContract({
      taskType: "career_positioning_guidance",
      target: "帮我做自我定位",
    });
    await runtime.createRun(
      { userId: "user-positioning" },
      {
        requestId: "request-positioning",
        conversationId: 102,
        taskType: "career_positioning_guidance",
        agentId: "profile",
        input: { content: "帮我做自我定位" },
        contract,
      },
    );
    const run = await runtime.claimNextRun({ workerId: "worker-positioning" });
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async (_principal, _conversationId, messages) => {
        savedConversations.push(messages);
      },
      orchestrate: async function* () {
        yield {
          type: "tool_result",
          name: "self_positioning",
          success: true,
          result: "4 阶段引导框架已加载，请引导用户从第一阶段开始。",
          data: { phases: ["第一阶段：设定期望"] },
        };
        yield { type: "done" };
      },
    });

    const result = await engine.execute({
      run: run!,
      checkpoint: null,
      signal: new AbortController().signal,
    });

    expect(result.outcome).toBe("succeeded");
    expect(savedConversations.flat()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: "assistant",
        content: expect.stringMatching(/第一阶段[\s\S]*最希望得到什么/),
      }),
    ]));
    expect(JSON.stringify(savedConversations)).not.toContain("请引导用户从第一阶段开始");
  });

  it("clears a recoverable tool failure after a later tool succeeds", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const contract = createAgentTaskContract({ taskType: "general_chat", target: "查资料并回答" });
    await runtime.createRun(
      { userId: "user-tool-recovery" },
      {
        requestId: "request-tool-recovery",
        conversationId: 103,
        taskType: "general_chat",
        agentId: "general",
        input: { content: "查资料并回答" },
        contract,
      },
    );
    const run = await runtime.claimNextRun({ workerId: "worker-tool-recovery" });
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async () => undefined,
      orchestrate: async function* () {
        yield { type: "tool_result", name: "first_tool", success: false, result: "暂时失败" };
        yield { type: "tool_error", name: "first_tool", error: "暂时失败", recoverable: true, category: "transient" };
        yield { type: "tool_result", name: "safe_tool", success: true, result: "安全结果" };
        yield { type: "text", content: "我换了一种安全方法，已经完成任务。" };
        yield { type: "done" };
      },
    });

    await expect(engine.execute({
      run: run!,
      checkpoint: null,
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ outcome: "succeeded" });
  });

  it.each(VERIFIED_EFFECT_TASKS)("keeps tool-only %s effects behind recovery when verification is unmet", async (taskType) => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const contract = createAgentTaskContract({ taskType, target: `test:${taskType}` });
    await runtime.createRun(
      { userId: `user-verified-${taskType}` },
      {
        requestId: `request-verified-${taskType}`,
        conversationId: 101,
        taskType,
        agentId: "general",
        input: { content: `test:${taskType}` },
        contract,
      },
    );
    const run = await runtime.claimNextRun({ workerId: `worker-verified-${taskType}` });
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async () => undefined,
      orchestrate: async function* () {
        yield { type: "tool_result", name: "test_tool", success: true, result: "未验证的工具结果" };
        yield { type: "done" };
      },
    });

    await expect(engine.execute({
      run: run!,
      checkpoint: null,
      signal: new AbortController().signal,
    })).rejects.toThrow("Run Contract unmet");
  });

  it("consumes durable input and persists only redacted UI event envelopes", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    await runtime.createRun(
      { userId: "user-1" },
      {
        requestId: "request-1",
        conversationId: 42,
        taskType: "resume_query",
        agentId: "resume",
        input: { content: "读取我的简历" },
      },
    );
    const run = await runtime.claimNextRun({ workerId: "worker-a" });
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async () => undefined,
      orchestrate: async function* () {
        yield { type: "phase", phase: "executing" };
        yield {
          type: "tool_result",
          name: "read_file",
          success: true,
          result: "候选人姓名：张三；手机号：13800000000",
          data: { resumeText: "候选人姓名：张三；手机号：13800000000" },
          uiPayload: { type: "resume_view", version: "v3", fullText: "候选人姓名：张三" },
        };
        yield { type: "text", content: "已读取你的简历。" };
        yield { type: "done" };
      },
    });

    const result = await engine.execute({
      run: run!,
      checkpoint: null,
      signal: new AbortController().signal,
    });
    const events = await runtime.listEvents({ userId: "user-1" }, run!.id, 0);

    expect(result.outcome).toBe("succeeded");
    const serializedEvents = JSON.stringify(events);
    expect(serializedEvents).not.toContain("张三");
    expect(serializedEvents).not.toContain("13800000000");
    expect(serializedEvents).not.toContain("uiPayload");
    expect(serializedEvents).not.toContain("resumeText");
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "run.ui_event",
        payload: {
          event: expect.objectContaining({
            type: "tool_result",
            name: "read_file",
            success: true,
          }),
        },
      }),
      expect.objectContaining({
        type: "run.model_output_complete",
        payload: expect.objectContaining({ charCount: 8, toolResultCount: 1 }),
      }),
    ]));
    const checkpoint = await runtime.getLatestCheckpoint({ userId: "user-1" }, run!.id);
    expect(JSON.stringify(checkpoint?.context)).toContain("已读取你的简历");
  });

  it("does not claim success when assistant text exists but the Run Contract is unmet", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    await runtime.createRun(
      { userId: "user-contract" },
      {
        requestId: "request-contract",
        conversationId: 43,
        taskType: "resume_query",
        agentId: "resume",
        input: { content: "读取我的简历" },
        contract: createAgentTaskContract({ taskType: "resume_query", target: "读取我的简历" }),
      },
    );
    const run = await runtime.claimNextRun({ workerId: "worker-contract" });
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async () => undefined,
      orchestrate: async function* () {
        yield { type: "tool_result", name: "read_file", success: false, result: "读取失败" };
        yield { type: "tool_error", name: "read_file", error: "数据库暂时不可用", recoverable: true };
        yield { type: "text", content: "我已经读取了你的简历。" };
        yield { type: "done" };
      },
    });

    await expect(engine.execute({
      run: run!,
      checkpoint: null,
      signal: new AbortController().signal,
    })).rejects.toThrow("数据库暂时不可用");
    const events = await runtime.listEvents({ userId: "user-contract" }, run!.id, 0);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "run.model_output_interrupted",
        payload: expect.objectContaining({ charCount: 11 }),
      }),
    ]));
    expect(events.some((event) => event.type === "run.model_output_complete")).toBe(false);
    const checkpoint = await runtime.getLatestCheckpoint({ userId: "user-contract" }, run!.id);
    expect(checkpoint?.boundary).toBe("model_interrupted");
    expect(checkpoint?.context.interruptedModelOutput).toEqual(expect.objectContaining({
      text: "我已经读取了你的简历。",
      charCount: 11,
    }));
    expect(JSON.stringify(events)).not.toContain("我已经读取了你的简历。");
  });

  it("finalizes an after_model checkpoint without invoking the model again", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    await runtime.createRun(
      { userId: "user-after-model" },
      {
        requestId: "request-after-model",
        conversationId: 48,
        taskType: "general_chat",
        agentId: "general",
        input: { content: "请完成任务" },
      },
    );
    const run = await runtime.claimNextRun({ workerId: "worker-after-model" });
    let orchestrateCalls = 0;
    let failConversationProjection = true;
    const savedConversations: unknown[] = [];
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async (_principal, _conversationId, messages) => {
        if (failConversationProjection) throw new Error("projection unavailable");
        savedConversations.push(messages);
      },
      orchestrate: async function* () {
        orchestrateCalls += 1;
        yield { type: "text", content: "任务已经完成。" };
      },
    });

    await expect(engine.execute({
      run: run!,
      checkpoint: null,
      signal: new AbortController().signal,
    })).rejects.toThrow("projection unavailable");
    const checkpoint = await runtime.getLatestCheckpoint({ userId: "user-after-model" }, run!.id);
    expect(checkpoint?.boundary).toBe("after_model");

    failConversationProjection = false;
    const result = await engine.execute({
      run: run!,
      checkpoint,
      signal: new AbortController().signal,
    });
    const events = await runtime.listEvents({ userId: "user-after-model" }, run!.id, 0);

    expect(result.outcome).toBe("succeeded");
    expect(orchestrateCalls).toBe(1);
    expect(savedConversations).toHaveLength(1);
    expect(events.filter((event) => event.type === "run.model_output_complete")).toHaveLength(1);
  });

  it("starts a new model cycle after recovery is decided for a failed completion", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const contract = createAgentTaskContract({ taskType: "file_export", target: "导出报告" });
    await runtime.createRun(
      { userId: "user-contract-recovery" },
      {
        requestId: "request-contract-recovery",
        conversationId: 49,
        taskType: "file_export",
        agentId: "general",
        input: { content: "导出报告" },
        contract,
      },
    );
    const run = await runtime.claimNextRun({ workerId: "worker-contract-recovery" });
    let orchestrateCalls = 0;
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async () => undefined,
      orchestrate: async function* () {
        orchestrateCalls += 1;
        if (orchestrateCalls === 1) {
          yield { type: "text", content: "报告已经导出。" };
          return;
        }
        yield {
          type: "tool_result",
          name: "export_file",
          success: true,
          result: "报告已导出",
          data: {
            filename: "report.pdf",
            size: 1024,
            sha256: "verified-hash",
            readBackVerified: true,
          },
        };
        yield { type: "text", content: "报告已导出并完成校验。" };
      },
    });

    await expect(engine.execute({
      run: run!,
      checkpoint: null,
      signal: new AbortController().signal,
    })).rejects.toThrow("Run Contract unmet");
    const failedCheckpoint = await runtime.getLatestCheckpoint({ userId: "user-contract-recovery" }, run!.id);
    const recoveryCheckpoint = await runtime.saveCheckpoint({
      runId: run!.id,
      workerId: run!.ownerId!,
      fencingToken: run!.fencingToken,
      boundary: "recovery_observed",
      context: {
        ...(failedCheckpoint?.context || {}),
        recovery: {
          observation: { userSafeSummary: "任务契约尚未满足" },
          decision: { action: "safe_tool_replan" },
        },
      },
      plan: failedCheckpoint?.plan || {},
      budgets: failedCheckpoint?.budgets || {},
      factRefs: failedCheckpoint?.factRefs || [],
    });

    const result = await engine.execute({
      run: run!,
      checkpoint: recoveryCheckpoint,
      signal: new AbortController().signal,
    });

    expect(result.outcome).toBe("succeeded");
    expect(orchestrateCalls).toBe(2);
  });

  it("preserves a non-recoverable tool failure instead of replanning the contract", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const contract = createAgentTaskContract({ taskType: "resume_edit", target: "优化简历" });
    await runtime.createRun(
      { userId: "user-permanent-tool-failure" },
      {
        requestId: "request-permanent-tool-failure",
        conversationId: 52,
        taskType: "resume_edit",
        agentId: "resume",
        input: { content: "优化简历" },
        contract,
      },
    );
    const run = await runtime.claimNextRun({ workerId: "worker-permanent-tool-failure" });
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async () => undefined,
      orchestrate: async function* () {
        yield {
          type: "tool_result",
          name: "optimize_resume_section",
          success: false,
          result: "简历优化服务认证失败，请检查服务配置",
        };
        yield {
          type: "tool_error",
          name: "optimize_resume_section",
          error: "简历优化服务认证失败，请检查服务配置",
          recoverable: false,
          category: "permanent",
        };
        yield { type: "done" };
      },
    });

    await expect(engine.execute({
      run: run!,
      checkpoint: null,
      signal: new AbortController().signal,
    })).resolves.toMatchObject({
      outcome: "failed",
      failure: {
        category: "tool_permanent",
        retryability: "never",
        userSafeSummary: "简历优化服务认证失败，请检查服务配置",
      },
    });
  });

  it("passes the durable Run Contract into orchestration-time tool governance", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const contract = createAgentTaskContract({ taskType: "resume_query", target: "读取我的简历" });
    await runtime.createRun(
      { userId: "user-contract-propagation" },
      {
        requestId: "request-contract-propagation",
        conversationId: 44,
        taskType: "resume_query",
        agentId: "resume",
        input: { content: "读取我的简历" },
        contract,
      },
    );
    const run = await runtime.claimNextRun({ workerId: "worker-contract-propagation" });
    let observedContract: unknown;
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async () => undefined,
      orchestrate: async function* (input) {
        observedContract = input.taskContract;
        yield { type: "tool_result", name: "read_file", success: true, result: "已读取简历" };
        yield { type: "text", content: "已读取你的简历。" };
      },
    });

    await engine.execute({
      run: run!,
      checkpoint: null,
      signal: new AbortController().signal,
    });

    expect(observedContract).toEqual(contract);
  });

  it("rebuilds model context from durable plan, gates, attempts, and fact references", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const contract = createAgentTaskContract({ taskType: "resume_query", target: "读取我的简历" });
    await runtime.createRun(
      { userId: "user-context" },
      {
        requestId: "request-context",
        conversationId: 45,
        taskType: "resume_query",
        agentId: "resume",
        input: { content: "继续完成原任务" },
        contract,
      },
    );
    const run = await runtime.claimNextRun({ workerId: "worker-context" });
    let observedMessages: Array<{ role: string; content: string }> = [];
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [{ role: "user", content: "读取我的简历" }],
      saveConversation: async () => undefined,
      contextSource: {
        load: async () => ({
          completedToolFacts: [{ toolName: "read_file", summary: "已读取简历版本 v3" }],
          recoveryObservations: [],
          evidence: [],
          gates: [{ toolName: "save_resume_section", status: "approved", scopeHash: "scope-1" }],
          factRefs: [{ type: "tool_attempt", id: "attempt-1", version: "verified", hash: "args-hash" }],
        }),
      },
      orchestrate: async function* (input) {
        observedMessages = input.messages;
        yield { type: "tool_result", name: "read_file", success: true, result: "已读取简历" };
        yield { type: "text", content: "已读取你的简历。" };
      },
    });

    await engine.execute({
      run: run!,
      checkpoint: {
        id: 1,
        runId: run!.id,
        userId: "user-context",
        snapshotVersion: 1,
        fencingToken: run!.fencingToken,
        boundary: "recovery_observed",
        context: {},
        plan: { cursor: 2, items: [{ id: "read", status: "completed" }] },
        budgets: {},
        factRefs: [{ type: "resume", id: "resume-1", version: "v3", hash: "resume-hash" }],
        createdAt: new Date().toISOString(),
      },
      signal: new AbortController().signal,
    });

    const prompt = observedMessages.map((message) => message.content).join("\n");
    const checkpoint = await runtime.getLatestCheckpoint({ userId: "user-context" }, run!.id);
    expect(prompt).toContain("Durable Run Contract");
    expect(prompt).toContain("已读取简历版本 v3");
    expect(prompt).toContain("RUN_GATE tool=save_resume_section status=approved scope=scope-1");
    expect(checkpoint?.plan).toEqual({ cursor: 2, items: [{ id: "read", status: "completed" }] });
    expect(checkpoint?.factRefs).toEqual(expect.arrayContaining([
      { type: "resume", id: "resume-1", version: "v3", hash: "resume-hash" },
      { type: "tool_attempt", id: "attempt-1", version: "verified", hash: "args-hash" },
    ]));
  });

  it("turns a Supervisor switch-provider decision into an explicit model policy", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    await runtime.createRun(
      { userId: "user-provider" },
      {
        requestId: "request-provider",
        conversationId: 46,
        taskType: "resume_query",
        agentId: "resume",
        input: { content: "继续读取简历" },
      },
    );
    const run = await runtime.claimNextRun({ workerId: "worker-provider" });
    let observedPolicy: unknown;
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async () => undefined,
      orchestrate: async function* (input) {
        observedPolicy = (input as typeof input & { modelRecovery?: unknown }).modelRecovery;
        yield { type: "text", content: "已恢复。" };
      },
    });

    await engine.execute({
      run: run!,
      checkpoint: {
        id: 1,
        runId: run!.id,
        userId: "user-provider",
        snapshotVersion: 1,
        fencingToken: run!.fencingToken,
        boundary: "recovery_observed",
        context: {
          recovery: {
            observation: { userSafeSummary: "首选模型不可用" },
            decision: { action: "switch_provider" },
          },
        },
        plan: {},
        budgets: {},
        factRefs: [],
        createdAt: new Date().toISOString(),
      },
      signal: new AbortController().signal,
    });

    expect(observedPolicy).toEqual({ switchProvider: true });
  });

  it("preserves consumed user turns in the conversation after recovery succeeds", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    await runtime.createRun(
      { userId: "user-conversation" },
      {
        requestId: "request-conversation",
        conversationId: 47,
        taskType: "general_chat",
        agentId: "general",
        input: { content: "请继续这个已经开始的任务" },
      },
    );
    const run = await runtime.claimNextRun({ workerId: "worker-conversation" });
    const pending = await runtime.listPendingInputs({ userId: "user-conversation" }, run!.id);
    await runtime.consumeInputs({
      runId: run!.id,
      workerId: "worker-conversation",
      fencingToken: run!.fencingToken,
      inputIds: pending.map((item) => item.id),
    });
    let savedMessages: Array<{ role: string; content: string }> = [];
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async (_principal, _conversationId, messages) => {
        savedMessages = messages;
      },
      orchestrate: async function* () {
        yield { type: "text", content: "任务已继续完成。" };
      },
    });

    await engine.execute({
      run: run!,
      checkpoint: {
        id: 1,
        runId: run!.id,
        userId: "user-conversation",
        snapshotVersion: 1,
        fencingToken: run!.fencingToken,
        boundary: "recovery_observed",
        context: {
          messages: [{ role: "user", content: "请继续这个已经开始的任务" }],
          conversationMessages: [{ role: "user", content: "请继续这个已经开始的任务" }],
          latestInput: "请继续这个已经开始的任务",
        },
        plan: {},
        budgets: {},
        factRefs: [],
        createdAt: new Date().toISOString(),
      },
      signal: new AbortController().signal,
    });

    expect(savedMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "user", content: "请继续这个已经开始的任务" }),
      expect.objectContaining({ role: "assistant", content: "任务已继续完成。" }),
    ]));
  });
});
