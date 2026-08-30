import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildAgentSessionUrl,
  replaceAgentSessionUrl,
  resolveAgentSessionUrlSync,
} from "@/lib/agent/agent-session-url";
import { buildOfferAgentHandoffUrl } from "@/lib/agent/offer-handoff";
import { routeAgentTask } from "@/lib/agent/task-routing";
import { createDefaultCVData, loadCVDataFromServer } from "@/lib/cv-storage";
import { transitionAgentRun } from "@/lib/agent/runtime/state-machine";
import {
  DurableAgentRunService,
  InMemoryAgentRunStore,
} from "@/lib/agent/runtime/durable-agent-run";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";
import { extractDsmlToolCalls } from "@/lib/agent/loop/dsml-tool-calls";
import { shouldWaitForUserAfterToolResult } from "@/lib/agent/loop/server-runner";
import { reconcileExecutionRunGates } from "@/lib/agent/runtime/execution-session-service";
import {
  buildInterviewPlanSnapshot,
  countAnsweredInterviewRounds,
  createInterviewState,
  rebuildInterviewStateFromMessages,
} from "@/lib/agent/interview-session-state";
import {
  AGENT_E2E_TASK_TYPES,
} from "@/lib/agent/agent-e2e-matrix";
import {
  createAgentTaskContract,
  resolveTaskContractRunOutcome,
} from "@/lib/agent/task-contract";
import { startOrContinueGuidedSession } from "@/lib/agent/guided-session-state";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("production Agent short/long-chain regressions", () => {
  it("keeps the selected Conversation in the URL without racing Next Router", () => {
    expect(buildAgentSessionUrl(
      "http://localhost/agent?newSession=1&offerReportId=3&intent=ask_hr",
      { sessionId: 89, consumeHandoff: true },
    )).toBe("/agent?sessionId=89");

    const calls: Array<{ data: unknown; title: string; url: string | URL | null | undefined }> = [];
    const nextUrl = replaceAgentSessionUrl(
      "http://localhost/agent?sessionId=93",
      { sessionId: 94, consumeHandoff: true },
      {
        state: { selected: 93 },
        replaceState(data, title, url) {
          calls.push({ data, title, url });
        },
      },
    );
    expect(nextUrl).toBe("/agent?sessionId=94");
    expect(calls).toEqual([{ data: { selected: 93 }, title: "", url: "/agent?sessionId=94" }]);
    expect(resolveAgentSessionUrlSync({
      requestedSessionId: 93,
      currentSessionId: 94,
      manualTargetSessionId: 94,
    })).toBe("await_target_url");
    expect(resolveAgentSessionUrlSync({
      requestedSessionId: 94,
      currentSessionId: 94,
      manualTargetSessionId: 94,
    })).toBe("acknowledge_target_url");
  });

  it("keeps Offer explanation, negotiation and HR follow-up in the existing Conversation", () => {
    expect(buildOfferAgentHandoffUrl(3, "ask_hr", 89)).toBe("/agent?sessionId=89&offerReportId=3&intent=ask_hr");
    expect(buildOfferAgentHandoffUrl(3, "ask_hr", 89)).not.toContain("newSession=1");
  });

  it.each([
    ["resume", "不要修改简历，只读取我当前的简历", "resume_query"],
    ["resume", "请读取我当前简历，只告诉我个人概述是否为空，不要修改", "resume_query"],
    ["profile", "不要静默保存画像，只告诉我你会怎么分析", "general_chat"],
    ["resume", "这份优秀简历不要保存，只分析结构", "general_chat"],
  ])("routes negated %s writes to a non-writing contract", (agentId, content, expectedTask) => {
    const decision = routeAgentTask({ agentId, content });
    expect(decision.taskType).toBe(expectedTask);
    expect(decision.auditSummary).toContain("negated_write");
    expect(decision.allowedTools).not.toEqual(expect.arrayContaining([
      "apply_resume_edit_proposal",
      "save_reference_resume",
      "mine_profile",
    ]));
  });

  it("keeps an active career-positioning follow-up in the same guided task", () => {
    const activeTask = startOrContinueGuidedSession({
      taskType: "career_positioning_guidance",
      agentId: "profile",
    });
    const decision = routeAgentTask({
      agentId: "general",
      content: "2. 我更想做 AI 产品与 Agent 平台",
      activeTask,
    });
    expect(decision.taskType).toBe("career_positioning_guidance");
    expect(decision.auditSummary).toBe("guided:career_positioning_guidance:locked");
  });

  it("overwrites a previous account's local CV cache when the server CV is empty", async () => {
    let cache = JSON.stringify({
      activeVersion: "v1",
      versions: { v1: { id: "v1", label: "旧账号", createdAt: "2026-01-01", sections: [{ id: "summary", title: "概述", content: "E2E 基线简历" }] } },
    });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => cache),
      setItem: vi.fn((_key: string, value: string) => { cache = value; }),
      removeItem: vi.fn(),
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, data: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    const loaded = await loadCVDataFromServer();
    expect(loaded).toEqual(expect.objectContaining({ activeVersion: "v1" }));
    expect(cache).not.toContain("E2E 基线简历");
    expect(cache).toContain("个人概述");
  });

  it("starts the CV page empty and reads interview material from the authenticated server", () => {
    expect(createDefaultCVData().versions.v1.sections.every((section) => section.content === "")).toBe(true);
    const cvPage = readFileSync(path.join(process.cwd(), "src/app/cv/page.tsx"), "utf8");
    const interviewLaunch = readFileSync(path.join(process.cwd(), "src/app/interview/InterviewLaunchPanel.tsx"), "utf8");
    expect(cvPage).toContain("useState(() => createDefaultCVData())");
    expect(interviewLaunch).toContain("await loadCVDataFromServer()");
  });

  it("persists the user turn and a safe failure message before a permanent tool failure closes the Run", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const contract = createAgentTaskContract({ taskType: "file_export", target: "导出报告" });
    await runtime.createRun({ userId: "prod-failure" }, {
      requestId: "prod-failure-request",
      conversationId: 901,
      taskType: "file_export",
      agentId: "general",
      input: { content: "导出这个报告" },
      contract,
    });
    const run = await runtime.claimNextRun({ workerId: "prod-failure-worker" });
    const saved: Array<Array<{ role: string; content: string }>> = [];
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async (_principal, _conversationId, messages) => { saved.push(messages); },
      orchestrate: async function* () {
        yield { type: "tool_result", name: "export_file", success: false, result: "导出失败" };
        yield { type: "run_directive", directive: "recover", reason: "导出服务不可用" };
        yield { type: "tool_error", name: "export_file", error: "导出服务不可用", recoverable: false, category: "permanent" };
        yield { type: "done" };
      },
    });

    const result = await engine.execute({ run: run!, checkpoint: null, signal: new AbortController().signal });
    expect(result.outcome).toBe("failed");
    expect(saved.at(-1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "user", content: "导出这个报告" }),
      expect.objectContaining({ role: "assistant", content: expect.stringContaining("不会把它标记为已完成") }),
    ]));
  });

  it("makes cancel_requested monotonic and heartbeat-ineligible", async () => {
    expect(() => transitionAgentRun("cancel_requested", "recovering")).toThrow("Illegal Agent Run transition");
    expect(transitionAgentRun("cancel_requested", "cancelled")).toBe("cancelled");

    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun({ userId: "prod-cancel" }, {
      requestId: "prod-cancel-create",
      conversationId: 902,
      taskType: "jd_evaluation",
      agentId: "evaluate",
      input: { content: "评估这个 JD" },
    });
    const claimed = await runtime.claimNextRun({ workerId: "prod-cancel-worker" });
    await runtime.requestCancel({ userId: "prod-cancel" }, created.run.id, "prod-cancel-request");
    await expect(runtime.heartbeat({
      runId: created.run.id,
      workerId: claimed!.ownerId!,
      fencingToken: claimed!.fencingToken,
    })).rejects.toThrow("not heartbeat eligible");
  });

  it("replays the frozen approved Gate request before asking the model for new arguments", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun({ userId: "prod-gate" }, {
      requestId: "prod-gate-create",
      conversationId: 903,
      taskType: "reference_resume_save",
      agentId: "resume",
      input: { content: "保存这份优秀简历" },
    });
    const run = await runtime.claimNextRun({ workerId: "prod-gate-worker" });
    const inputs = await runtime.listPendingInputs({ userId: "prod-gate" }, run!.id);
    await runtime.consumeInputs({
      runId: run!.id,
      workerId: run!.ownerId!,
      fencingToken: run!.fencingToken,
      inputIds: inputs.map((input) => input.id),
    });
    const checkpoint = await runtime.saveCheckpoint({
      runId: run!.id,
      workerId: run!.ownerId!,
      fencingToken: run!.fencingToken,
      boundary: "after_model",
      context: {
        latestInput: "保存这份优秀简历",
        conversationMessages: [{ role: "user", content: "保存这份优秀简历" }],
        modelCompletion: { id: "waiting-gate", outcome: "waiting_user", charCount: 0, toolResultCount: 1 },
      },
      plan: {},
      budgets: {},
      factRefs: [],
    });
    let frozenToolCall: { name: string; args: Record<string, unknown> } | undefined;
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      contextSource: {
        load: async () => ({
          completedToolFacts: [], recoveryObservations: [], evidence: [], factRefs: [],
          gates: [{
            gateId: "gate-1",
            toolName: "save_reference_resume",
            status: "approved",
            scopeHash: "scope-1",
            request: { toolName: "save_reference_resume", args: { name: "冻结原请求", roleCategory: "AI产品经理" } },
            resolvedAt: "2026-08-30T18:00:00.000Z",
          }],
        }),
      },
      loadConversation: async () => [],
      saveConversation: async () => undefined,
      orchestrate: async function* (input: { frozenToolCall?: { name: string; args: Record<string, unknown> } }) {
        frozenToolCall = input.frozenToolCall;
        yield { type: "text", content: "已按批准内容执行。" };
        yield { type: "done" };
      },
    });

    await engine.execute({ run: run!, checkpoint, signal: new AbortController().signal });
    expect(frozenToolCall).toEqual({
      name: "save_reference_resume",
      args: { name: "冻结原请求", roleCategory: "AI产品经理" },
    });
  });

  it("stops profile and interview tools at the user-turn boundary", () => {
    expect(shouldWaitForUserAfterToolResult("mine_profile", { stage: 2, prompt: "下一题", done: false })).toBe(true);
    expect(shouldWaitForUserAfterToolResult("mine_profile", { stage: 5, done: true })).toBe(false);
    expect(shouldWaitForUserAfterToolResult("generate_interview_questions", { questions: [{ question: "请介绍项目" }] })).toBe(true);
  });

  it("parses DSML tool calls and never projects raw DSML into assistant text", () => {
    const raw = '<｜｜DSML｜｜tool_calls><invoke name="apply_resume_edit_proposal"><parameter name="proposalId">"rep_1"</parameter></invoke></｜｜DSML｜｜tool_calls>';
    const parsed = extractDsmlToolCalls(raw);
    expect(parsed.detected).toBe(true);
    expect(parsed.text).toBe("");
    expect(parsed.toolCalls).toEqual([expect.objectContaining({
      name: "apply_resume_edit_proposal",
      arguments: JSON.stringify({ proposalId: "rep_1" }),
    })]);
  });

  it("projects approved and denied Gate state into persisted cards", () => {
    const messages = [{
      role: "tool",
      content: "等待批准",
      toolResult: { uiPayload: { type: "run_gate", gateId: "gate-1", scopeHash: "scope-1", status: "pending" } },
    }];
    const reconciled = reconcileExecutionRunGates(messages, [{
      gateId: "gate-1",
      toolName: "save_reference_resume",
      scopeHash: "scope-1",
      status: "approved",
      resolvedAt: "2026-08-30T18:00:00.000Z",
    }]);
    expect(reconciled[0]?.toolResult).toEqual(expect.objectContaining({
      uiPayload: expect.objectContaining({ status: "approved" }),
    }));
  });

  it("counts only real interview answers and keeps launch commands at zero rounds", () => {
    const state = createInterviewState(buildInterviewPlanSnapshot({
      jd: {
        id: 1,
        company: "测试公司",
        role: "AI 产品经理",
        body: "负责 Agent 产品",
        sourceType: "paste",
        keywords: [],
        createdAt: new Date("2026-08-30T18:00:00.000Z"),
      },
      resumeText: "五年 AI 产品经验",
      resumeTitle: "当前简历",
    }));
    const rebuilt = rebuildInterviewStateFromMessages(state, [
      { role: "user", content: "开始模拟面试，只问一道题", timestamp: "2026-08-30T18:00:00.000Z" },
      {
        role: "tool",
        content: "已生成题目",
        toolName: "generate_interview_questions",
        toolResult: {
          data: {
            questions: [{ question: "请介绍一个 Agent 项目", context: "JD", storyHint: "项目" }],
            planSnapshotSeed: { company: "测试公司", role: "AI 产品经理", jdText: "负责 Agent 产品", cvText: "五年 AI 产品经验" },
          },
        },
        timestamp: "2026-08-30T18:00:01.000Z",
      },
    ]);
    expect(rebuilt?.planSnapshot.resumeSnapshot?.title).toBe("当前简历");
    expect(countAnsweredInterviewRounds(rebuilt)).toBe(0);
  });

  it("never marks a Run succeeded while its Contract gate is unmet", () => {
    for (const taskType of AGENT_E2E_TASK_TYPES) {
      const contract = createAgentTaskContract({ taskType, target: `eval:${taskType}` });
      const complete = resolveTaskContractRunOutcome(contract, contract.successCriteria, { hasAssistantResponse: true });
      expect(complete.status).toBe("succeeded");
      expect(complete.gate.canClaimSuccess).toBe(true);

      const partial = resolveTaskContractRunOutcome(contract, [], { hasAssistantResponse: true });
      expect(partial.status).not.toBe("succeeded");
      expect(partial.gate.canClaimSuccess).toBe(false);
    }
  });

  it("exposes paused Runs as a first-class admin filter", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/admin/agent-runs/page.tsx"), "utf8");
    expect(source).toContain('{ value: "paused", label: "已暂停" }');
    expect(source).toContain('paused: "已暂停"');
    expect(source).toContain('"waiting_user", "paused", "verifying"');
  });
});
