import { describe, expect, it } from "vitest";
import {
  DurableAgentRunService,
  InMemoryAgentRunStore,
} from "@/lib/agent/runtime/durable-agent-run";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";
import { AgentWorker } from "@/lib/agent/runtime/agent-worker";
import { createAgentTaskContract, type AgentTaskType } from "@/lib/agent/task-contract";

const ADVISORY_TASKS: AgentTaskType[] = [
  "general_chat",
  "career_positioning_guidance",
  "interview_coaching",
];

const VERIFIED_EFFECT_TASKS: AgentTaskType[] = [
  "resume_edit",
  "profile_update",
  "file_export",
  "job_search",
];

const USER_INPUT_TASKS: AgentTaskType[] = [
  "resume_query",
  "jd_evaluation",
  "offer_evaluation",
  "reference_resume_save",
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
    ]));
    expect((savedConversations.at(-1) as Array<{ role: string }>).some((message) => message.role === "assistant")).toBe(false);
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

  it.each(USER_INPUT_TASKS)("offers one actionable continuation when %s has no source", async (taskType) => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const contract = createAgentTaskContract({ taskType, target: `test:${taskType}` });
    await runtime.createRun(
      { userId: `user-missing-${taskType}` },
      {
        requestId: `request-missing-${taskType}`,
        conversationId: 102,
        taskType,
        agentId: "general",
        input: { content: `test:${taskType}` },
        contract,
      },
    );
    const run = await runtime.claimNextRun({ workerId: `worker-missing-${taskType}` });
    const savedConversations: Array<Array<{ role: string; content: string }>> = [];
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async (_principal, _conversationId, messages) => {
        savedConversations.push(messages);
      },
      orchestrate: async function* () {
        yield { type: "text", content: "处理已经完成。" };
        yield { type: "done" };
      },
    });

    const result = await engine.execute({
      run: run!,
      checkpoint: null,
      signal: new AbortController().signal,
    });

    expect(result.outcome).toBe("waiting_user");
    const finalMessages = savedConversations.at(-1) || [];
    expect(finalMessages.filter((message) => message.role === "assistant")).toHaveLength(1);
    expect(finalMessages.at(-1)?.content).not.toMatch(/落库|校验|契约|处理已经完成/);
  });

  it("records two contract recoveries internally and writes one final user notice", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const contract = createAgentTaskContract({ taskType: "file_export", target: "导出报告" });
    const created = await runtime.createRun(
      { userId: "user-contract-notice" },
      {
        requestId: "request-contract-notice",
        conversationId: 104,
        taskType: "file_export",
        agentId: "general",
        input: { content: "导出报告" },
        contract,
      },
    );
    let modelCalls = 0;
    const savedConversations: Array<Array<{ role: string; content: string }>> = [];
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async (_principal, _conversationId, messages) => {
        savedConversations.push(messages);
      },
      orchestrate: async function* () {
        modelCalls += 1;
        yield { type: "text", content: "报告已经导出。" };
      },
    });
    const worker = new AgentWorker({ workerId: "worker-contract-notice", runtime, engine });

    await worker.runOnce();
    await worker.runOnce();
    const finalRun = await worker.runOnce();
    const events = await runtime.listEvents({ userId: "user-contract-notice" }, created.run.id, 0);

    expect(finalRun?.status).toBe("waiting_user");
    expect(modelCalls).toBe(3);
    expect(events.filter((event) => event.type === "run.contract_evaluated")).toHaveLength(3);
    expect(events.filter((event) => event.type === "run.recovery_decided")).toHaveLength(2);
    const assistantMessages = (savedConversations.at(-1) || []).filter((message) => message.role === "assistant");
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]?.content).not.toMatch(/报告已经导出|落库|校验|契约|成功条件/);
  });

  it("continues the same Run after the user supplies missing resume text", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const contract = createAgentTaskContract({ taskType: "resume_query", target: "评估简历" });
    const created = await runtime.createRun(
      { userId: "user-resume-continuation" },
      {
        requestId: "request-resume-continuation",
        conversationId: 105,
        taskType: "resume_query",
        agentId: "resume",
        input: { content: "评估简历截图" },
        contract,
      },
    );
    let modelCalls = 0;
    let savedConversation: Array<{ role: string; content: string }> = [];
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => savedConversation,
      saveConversation: async (_principal, _conversationId, messages) => {
        savedConversation = messages;
      },
      orchestrate: async function* () {
        modelCalls += 1;
        if (modelCalls === 1) {
          yield { type: "text", content: "无法识别截图。" };
          return;
        }
        yield { type: "tool_result", name: "read_file", success: true, result: "已读取本轮简历文字" };
        yield { type: "text", content: "这份简历可以增加量化成果。" };
      },
    });
    const worker = new AgentWorker({ workerId: "worker-resume-continuation", runtime, engine });

    expect((await worker.runOnce())?.status).toBe("waiting_user");
    await runtime.submitInput(
      { userId: "user-resume-continuation" },
      created.run.id,
      "resume-continuation-text",
      { content: "这是我的简历文字：负责产品规划和上线。" },
    );
    expect((await worker.runOnce())?.status).toBe("succeeded");

    const userMessages = savedConversation.filter((message) => message.role === "user");
    expect(userMessages.map((message) => message.content)).toEqual([
      "评估简历截图",
      "这是我的简历文字：负责产品规划和上线。",
    ]);
    expect(savedConversation.filter((message) => message.role === "assistant")).toHaveLength(2);
  });

  it("retains a no-resume instruction across later turns of the same JD Run", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const userId = "user-jd-scope-continuation";
    const contract = createAgentTaskContract({
      taskType: "jd_evaluation",
      target: "评估这个 JD",
      routing: { jdMatchResume: true },
    });
    const created = await runtime.createRun(
      { userId },
      {
        requestId: "request-jd-scope-continuation",
        conversationId: 206,
        taskType: "jd_evaluation",
        agentId: "evaluate",
        input: { content: "评估这个 JD" },
        contract,
      },
    );
    const matchingScopes: Array<boolean | undefined> = [];
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async () => undefined,
      orchestrate: async function* (input) {
        matchingScopes.push(input.taskContract?.routing?.jdMatchResume);
        yield { type: "text", content: "请继续提供 JD 内容。" };
        yield { type: "run_directive", directive: "wait_user", reason: "等待 JD 内容" };
      },
    });
    const worker = new AgentWorker({ workerId: "worker-jd-scope-continuation", runtime, engine });

    expect((await worker.runOnce())?.status).toBe("waiting_user");
    await runtime.submitInput(
      { userId }, created.run.id, "jd-scope-opt-out",
      { content: "不要匹配我的简历，这不是我求职" },
    );
    expect((await worker.runOnce())?.status).toBe("waiting_user");
    expect((await runtime.getLatestCheckpoint({ userId }, created.run.id))?.context.jdMatchResume).toBe(false);
    await runtime.submitInput(
      { userId }, created.run.id, "jd-scope-follow-up",
      { content: "继续分析这个 JD 的风险" },
    );
    expect((await worker.runOnce())?.status).toBe("waiting_user");
    expect(matchingScopes).toEqual([true, false, false]);
  });

  it("keeps the no-resume scope and prior JD analysis for a long follow-up without a new JD", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const userId = "user-jd-long-follow-up";
    const initialJD = "不要匹配我的简历。岗位职责：负责 AI 产品规划、需求研究与跨团队交付，推动复杂项目上线。任职要求：五年产品经验，熟悉数据分析与用户访谈。";
    const followUp = `${"请继续分析刚才那份材料的风险点，重点说明任职要求与团队协作中可能存在的问题，并给出面试时可以进一步核实的具体问题。".repeat(4)}参考资料：https://example.com/articles/team-coordination`;
    expect(followUp.length).toBeGreaterThan(200);
    const created = await runtime.createRun({ userId }, {
      requestId: "request-jd-long-follow-up",
      conversationId: 209,
      taskType: "jd_evaluation",
      agentId: "evaluate",
      input: { content: initialJD },
      contract: createAgentTaskContract({ taskType: "jd_evaluation", target: initialJD, routing: { jdMatchResume: false } }),
    });
    const matchingScopes: Array<boolean | undefined> = [];
    const modelMessages: Array<Array<{ role: string; content: string }>> = [];
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [
        { role: "assistant", content: "岗位职责涉及跨团队交付，任职要求强调数据分析。" },
        { role: "assistant", content: "岗位适配你的简历：你曾负责秘密项目北斗。" },
        { role: "assistant", content: "岗位信息中包含联系人手机号 13800000000。" },
      ],
      saveConversation: async () => undefined,
      orchestrate: async function* (input) {
        matchingScopes.push(input.taskContract?.routing?.jdMatchResume);
        modelMessages.push(input.messages);
        yield { type: "text", content: "请继续提供 JD 内容。" };
        yield { type: "run_directive", directive: "wait_user", reason: "等待 JD 内容" };
      },
    });
    const worker = new AgentWorker({ workerId: "worker-jd-long-follow-up", runtime, engine });

    expect((await worker.runOnce())?.status).toBe("waiting_user");
    const initialSourceKey = (await runtime.getLatestCheckpoint({ userId }, created.run.id))?.context.jdSourceKey;
    expect(initialSourceKey).toMatch(/^text:/);
    await runtime.submitInput({ userId }, created.run.id, "jd-long-follow-up", { content: followUp });
    expect((await worker.runOnce())?.status).toBe("waiting_user");

    const laterMessages = JSON.stringify(modelMessages[1]);
    expect(matchingScopes).toEqual([false, false]);
    expect((await runtime.getLatestCheckpoint({ userId }, created.run.id))?.context.jdSourceKey).toBe(initialSourceKey);
    expect(laterMessages).toContain(initialJD);
    expect(laterMessages).toContain(followUp);
    expect(modelMessages[1]).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "assistant", content: "岗位职责涉及跨团队交付，任职要求强调数据分析。" }),
    ]));
    expect(laterMessages).not.toContain("秘密项目北斗");
    expect(laterMessages).not.toContain("13800000000");
  });

  it.each(["image", "text", "chinese"] as const)("restores default matching when a waiting Run receives a new %s JD", async (sourceKind) => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const userId = `user-new-jd-${sourceKind}`;
    const firstContent = sourceKind === "image"
      ? "不要匹配我的简历，评估这份 JD"
      : "不要匹配我的简历。岗位职责：负责产品路线图和跨团队交付，任职要求：具备多年产品管理和数据分析经验，能够推动复杂项目落地。";
    const nextContent = sourceKind === "image"
      ? "评估这份新的 JD"
      : sourceKind === "chinese"
        ? "岗位职责：负责企业客户需求研究、产品路线图规划与跨团队交付。任职要求：具备数据分析能力和丰富的 B 端产品经验。"
        : "We are hiring a product manager to own customer discovery, product strategy, launch planning, and cross-functional delivery. Requirements include strong analytics and communication skills across software teams.";
    const created = await runtime.createRun({ userId }, {
      requestId: `request-new-jd-${sourceKind}`,
      conversationId: 207,
      taskType: "jd_evaluation",
      agentId: "evaluate",
      input: { content: firstContent, ...(sourceKind === "image" ? { images: ["data:image/png;base64,source-a"] } : {}) },
      contract: createAgentTaskContract({ taskType: "jd_evaluation", target: firstContent, routing: { jdMatchResume: false } }),
    });
    const matchingScopes: Array<boolean | undefined> = [];
    const modelMessages: string[][] = [];
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async () => undefined,
      orchestrate: async function* (input) {
        matchingScopes.push(input.taskContract?.routing?.jdMatchResume);
        modelMessages.push(input.messages.map((message) => message.content));
        yield { type: "text", content: "请继续提供 JD 内容。" };
        yield { type: "run_directive", directive: "wait_user", reason: "等待 JD 内容" };
      },
    });
    const worker = new AgentWorker({ workerId: `worker-new-jd-${sourceKind}`, runtime, engine });

    expect((await worker.runOnce())?.status).toBe("waiting_user");
    await runtime.submitInput({ userId }, created.run.id, `next-jd-${sourceKind}`, {
      content: nextContent,
      ...(sourceKind === "image" ? { images: ["data:image/png;base64,source-b"] } : {}),
    });
    expect((await worker.runOnce())?.status).toBe("waiting_user");

    expect(matchingScopes).toEqual([false, undefined]);
    expect(modelMessages[1].join("\n")).toContain(nextContent);
    expect(modelMessages[1].join("\n")).not.toContain(firstContent);
    expect((await runtime.getLatestCheckpoint({ userId }, created.run.id))?.context.jdMatchResume).toBeUndefined();
  });

  it("applies the last explicit matching directive in batched inputs and hides old resume context", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const userId = "user-jd-scope-batch";
    const contract = createAgentTaskContract({
      taskType: "jd_evaluation",
      target: "评估这个 JD",
      routing: { jdMatchResume: true },
    });
    const created = await runtime.createRun(
      { userId },
      {
        requestId: "request-jd-scope-batch",
        conversationId: 207,
        taskType: "jd_evaluation",
        agentId: "evaluate",
        input: { content: "评估这份 JD：岗位职责是开发 AI 产品，任职要求是五年以上产品经验。" },
        contract,
      },
    );
    let seenMessages: Array<{ role: string; content: string }> = [];
    let seenScope: boolean | undefined;
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [
        { role: "user", content: "不要匹配我的简历。评估这份 JD：岗位职责是开发 AI 产品。" },
        { role: "user", content: "我的简历内容如下：负责销售项目。" },
        { role: "assistant", content: "岗位职责包含 AI 产品规划，任职要求侧重交付能力。" },
        { role: "assistant", content: "你的简历匹配度是 80%。" },
        { role: "tool", content: "候选人画像含销售经历。" },
      ],
      saveConversation: async () => undefined,
      orchestrate: async function* (input) {
        seenScope = input.taskContract?.routing?.jdMatchResume;
        seenMessages = input.messages;
        yield { type: "text", content: "请继续提供 JD 内容。" };
        yield { type: "run_directive", directive: "wait_user", reason: "等待 JD 内容" };
      },
      contextSource: {
        load: async () => ({
          completedToolFacts: [{ toolName: "read_file", summary: "候选人简历里有销售经历" }],
          recoveryObservations: [{ toolName: "read_file", summary: "已读取简历" }],
          evidence: [{ type: "model.output_complete", content: "你的简历匹配度是 80%。" }],
          gates: [],
          factRefs: [],
        }),
      },
    });
    const worker = new AgentWorker({ workerId: "worker-jd-scope-batch", runtime, engine });
    expect((await worker.runOnce())?.status).toBe("waiting_user");
    await runtime.submitInput(
      { userId }, created.run.id, "jd-batch-opt-out",
      { content: "不要匹配我的简历" },
    );
    await runtime.submitInput(
      { userId }, created.run.id, "jd-batch-follow-up",
      { content: "继续分析这个 JD" },
    );

    expect((await worker.runOnce())?.status).toBe("waiting_user");
    expect(seenScope).toBe(false);
    expect(seenMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "user", content: expect.stringContaining("岗位职责") }),
      expect.objectContaining({ role: "user", content: "继续分析这个 JD" }),
      expect.objectContaining({ role: "assistant", content: "岗位职责包含 AI 产品规划，任职要求侧重交付能力。" }),
    ]));
    expect(JSON.stringify(seenMessages)).not.toMatch(/销售经历|匹配度是 80%|已读取简历/);
  });

  it("keeps the JD but removes resume text from a mixed no-match message", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    await runtime.createRun({ userId: "user-mixed-jd-resume" }, {
      requestId: "request-mixed-jd-resume",
      conversationId: 208,
      taskType: "jd_evaluation",
      agentId: "evaluate",
      input: {
        content: "不要匹配我的简历。JD：岗位职责：负责 AI 产品规划与交付。任职要求：五年产品经验，熟悉数据分析。我的简历：秘密项目代号北斗，曾负责内部销售平台。",
      },
      contract: createAgentTaskContract({ taskType: "jd_evaluation", target: "评估当前 JD", routing: { jdMatchResume: false } }),
    });
    let modelInput = "";
    let modelMessages = "";
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async () => undefined,
      orchestrate: async function* (input) {
        modelInput = input.content;
        modelMessages = JSON.stringify(input.messages);
        yield { type: "text", content: "请继续提供 JD 内容。" };
        yield { type: "run_directive", directive: "wait_user", reason: "等待 JD 内容" };
      },
    });
    const worker = new AgentWorker({ workerId: "worker-mixed-jd-resume", runtime, engine });

    expect((await worker.runOnce())?.status).toBe("waiting_user");
    expect(modelInput).toContain("岗位职责");
    expect(modelMessages).toContain("任职要求");
    expect(`${modelInput}${modelMessages}`).not.toContain("秘密项目代号北斗");
  });

  it("resumes screenshot diagnosis after pasted text clears its original clarification", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const contract = createAgentTaskContract({
      taskType: "resume_diagnosis",
      target: "评估这份简历",
      routing: { requiresClarification: true, clarificationQuestion: "请在当前对话粘贴简历文字。" },
    });
    const created = await runtime.createRun(
      { userId: "user-resume-diagnosis-continuation" },
      {
        requestId: "request-resume-diagnosis-continuation",
        conversationId: 205,
        taskType: "resume_diagnosis",
        agentId: "resume",
        input: { content: "评估这份简历", images: ["data:image/png;base64,unreadable"] },
        contract,
      },
    );
    let turnCount = 0;
    let savedConversation: Array<{ role: string; content: string }> = [];
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => savedConversation,
      saveConversation: async (_principal, _conversationId, messages) => {
        savedConversation = messages;
      },
      orchestrate: async function* () {
        turnCount += 1;
        if (turnCount === 1) {
          yield { type: "text", content: "请在当前对话粘贴简历文字。" };
          yield { type: "run_directive", directive: "wait_user", reason: "等待补充文字" };
          return;
        }
        yield { type: "text", content: "这份简历应补充项目成果数字和标准 ATS 标题。" };
      },
    });
    const worker = new AgentWorker({ workerId: "worker-resume-diagnosis-continuation", runtime, engine });

    expect((await worker.runOnce())?.status).toBe("waiting_user");
    await runtime.submitInput(
      { userId: "user-resume-diagnosis-continuation" },
      created.run.id,
      "resume-diagnosis-paste",
      { content: "工作经历：负责 AI 产品规划。项目经历：搭建 RAG 知识库。" },
    );
    expect((await worker.runOnce())?.status).toBe("succeeded");
    expect(turnCount).toBe(2);
    expect(savedConversation.filter((message) => message.role === "assistant").map((message) => message.content)).toEqual([
      "请在当前对话粘贴简历文字。",
      "这份简历应补充项目成果数字和标准 ATS 标题。",
    ]);
  });

  it("does not repeat a JD write when the report exists but read-back is unverified", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const contract = createAgentTaskContract({ taskType: "jd_evaluation", target: "评估 JD" });
    const created = await runtime.createRun(
      { userId: "user-jd-unverified" },
      {
        requestId: "request-jd-unverified",
        conversationId: 106,
        taskType: "jd_evaluation",
        agentId: "evaluate",
        input: { content: "评估这份 JD" },
        contract,
      },
    );
    let modelCalls = 0;
    let savedConversation: Array<{ role: string; content: string }> = [];
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => savedConversation,
      saveConversation: async (_principal, _conversationId, messages) => {
        savedConversation = messages;
      },
      orchestrate: async function* () {
        modelCalls += 1;
        yield {
          type: "tool_result",
          name: "evaluate_jd_full",
          success: true,
          result: "分析已生成",
          data: {
            jdText: "这是一份包含职责和任职要求的足够长的岗位描述文本。",
            blocks: Object.fromEntries("abcdefg".split("").map((key) => [key, `${key} 分析结果`])),
            reportNum: 7,
          },
        };
        yield { type: "text", content: "已保存 JD 评估报告。" };
      },
    });
    const worker = new AgentWorker({ workerId: "worker-jd-unverified", runtime, engine });

    expect((await worker.runOnce())?.status).toBe("waiting_user");
    const events = await runtime.listEvents({ userId: "user-jd-unverified" }, created.run.id, 0);
    expect(events.filter((event) => event.type === "run.recovery_decided")).toHaveLength(0);
    expect(modelCalls).toBe(1);
    expect(savedConversation.filter((message) => message.role === "assistant")).toEqual([
      expect.objectContaining({ content: expect.not.stringContaining("已保存") }),
    ]);
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
