import { afterEach, describe, expect, it, vi } from "vitest";

const { executeGovernedRuntimeTool } = vi.hoisted(() => ({
  executeGovernedRuntimeTool: vi.fn(),
}));

vi.mock("@/lib/agent/runtime/governed-tool-runtime", () => ({ executeGovernedRuntimeTool }));

import { agentLoopServer } from "@/lib/agent/loop/server-runner";
import { createAgentTaskContract } from "@/lib/agent/task-contract";

afterEach(() => {
  executeGovernedRuntimeTool.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("durable server Agent Loop gates", () => {
  it("ends the model cycle immediately after a persistent Run Gate requests user input", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubEnv("ZHIPU_API_KEY", "");
    executeGovernedRuntimeTool.mockResolvedValue({
      runDirective: "wait_user",
      observation: {
        category: "governance_denied",
        stage: "governance",
        retryability: "ask_user",
        effectState: "not_dispatched",
        fingerprint: "gate:proposal-1",
        userSafeSummary: "需要用户确认",
        diagnosticRef: "attempt-1",
        recoveryCapabilities: ["request_gate"],
      },
      attempt: {
        id: "attempt-1",
        status: "waiting_user",
        effectState: "not_dispatched",
        result: {
          success: false,
          data: { gateId: "gate-1" },
          error: "该动作需要用户确认后才能执行",
          errorCategory: "need_user_input",
          recoverable: false,
          uiPayload: { type: "run_gate", gateId: "gate-1" },
        },
      },
    });
    const modelResponse = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"apply_resume_edit_proposal","arguments":"{\\"proposalId\\":\\"proposal-1\\"}"}}]}}]}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    const fetchMock = vi.fn(async () => new Response(modelResponse, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const events = [];

    for await (const event of agentLoopServer({
      systemPrompt: "Apply only after approval.",
      messages: [{ role: "user", content: "应用修改" }],
      tools: [{
        type: "function",
        function: {
          name: "apply_resume_edit_proposal",
          description: "Apply proposal",
          parameters: { type: "object", properties: {}, required: [] },
        },
      }],
      executionContext: {
        principal: { userId: "user-1" },
        runId: "run-1",
        workerId: "worker-1",
        fencingToken: 1,
        allowlist: ["apply_resume_edit_proposal"],
      },
    })) events.push(event);

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "run_directive", directive: "wait_user" }),
      expect.objectContaining({ type: "tool_result", success: false }),
      expect.objectContaining({ type: "done" }),
    ]));
    expect(events.some((event) => event.type === "text")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("feeds a policy denial back to the model and delivers the safe alternative", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubEnv("ZHIPU_API_KEY", "");
    executeGovernedRuntimeTool.mockResolvedValue({
      runDirective: "continue",
      observation: {
        category: "governance_denied",
        stage: "governance",
        retryability: "retry_safe",
        effectState: "not_dispatched",
        fingerprint: "policy:unsafe-tool",
        userSafeSummary: "当前任务不允许这个工具",
        diagnosticRef: "attempt-policy",
        recoveryCapabilities: ["choose_alternative_tool"],
      },
      attempt: {
        id: "attempt-policy",
        status: "denied",
        effectState: "not_dispatched",
        result: {
          success: false,
          data: { blockedBy: "tool_governance" },
          error: "当前任务不允许这个工具",
          errorCategory: "policy_denied",
          recoverable: true,
          llmSummary: "请改用允许的只读路径。",
        },
      },
    });
    const responses = [
      [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"unsafe_tool","arguments":"{}"}}]}}]}',
        "",
        "data: [DONE]",
        "",
      ].join("\n"),
      [
        'data: {"choices":[{"delta":{"content":"我已改用安全路径，下面直接给你建议。"}}]}',
        "",
        "data: [DONE]",
        "",
      ].join("\n"),
    ];
    const fetchMock = vi.fn(async () => new Response(responses.shift(), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const events = [];

    for await (const event of agentLoopServer({
      systemPrompt: "Use a safe alternative after a denial.",
      messages: [{ role: "user", content: "继续完成任务" }],
      tools: [{
        type: "function",
        function: {
          name: "unsafe_tool",
          description: "Unsafe for this task",
          parameters: { type: "object", properties: {}, required: [] },
        },
      }],
      executionContext: {
        principal: { userId: "user-policy" },
        runId: "run-policy",
        workerId: "worker-policy",
        fencingToken: 1,
        allowlist: ["unsafe_tool"],
      },
    })) events.push(event);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool_error", recoverable: true, category: "policy_denied" }),
      expect.objectContaining({ type: "text", content: "我已改用安全路径，下面直接给你建议。" }),
    ]));
    expect(events.some((event) => event.type === "run_directive" && event.directive === "wait_user")).toBe(false);
  });

  it("forces an unconfirmed scan_portals confirmation card when job discovery has no model tool call", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubEnv("ZHIPU_API_KEY", "");
    executeGovernedRuntimeTool.mockResolvedValue({
      runDirective: "continue",
      observation: {
        category: "tool_success",
        stage: "execution",
        retryability: "none",
        effectState: "not_dispatched",
        fingerprint: "scan:confirmation",
        userSafeSummary: "已生成岗位发现确认卡",
        diagnosticRef: "attempt-scan-confirmation",
        recoveryCapabilities: [],
      },
      attempt: {
        id: "attempt-scan-confirmation",
        status: "succeeded",
        effectState: "not_dispatched",
        result: {
          success: true,
          data: {
            needsConfirmation: true,
            criteria: { titlePositive: ["AI 产品经理"], location: "杭州", maxResults: 3 },
          },
          errorCategory: "ok",
          llmSummary: "岗位发现需要用户先确认条件。",
          uiPayload: {
            type: "job_discovery_confirmation",
            criteria: { titlePositive: ["AI 产品经理"], location: "杭州", maxResults: 3 },
            primaryAction: { id: "start_job_discovery", label: "开始岗位发现" },
          },
        },
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      'data: {"choices":[{"delta":{"content":"我会先确认岗位发现条件。"}}]}\n\ndata: [DONE]\n\n',
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    )));
    const events = [];

    for await (const event of agentLoopServer({
      agent: { id: "general", toolNames: ["scan_portals"] } as never,
      systemPrompt: "岗位发现助手",
      messages: [{ role: "user", content: "帮我找 3 个杭州 AI 产品经理岗位" }],
      tools: [{ type: "function", function: { name: "scan_portals" } }],
      taskContract: createAgentTaskContract({
        taskType: "job_search",
        target: "帮我找 3 个杭州 AI 产品经理岗位",
      }),
      executionContext: {
        principal: { userId: "job-search-user" },
        runId: "job-search-run",
        workerId: "job-search-worker",
        fencingToken: 1,
        allowlist: ["scan_portals"],
      },
    })) events.push(event);

    expect(executeGovernedRuntimeTool).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "scan_portals",
      args: expect.objectContaining({
        confirmed: false,
        location: "杭州",
        maxResults: 3,
        titleKeywords: ["AI 产品经理"],
      }),
    }));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool_call", name: "scan_portals", params: expect.objectContaining({ confirmed: false }) }),
      expect.objectContaining({ type: "tool_result", name: "scan_portals", success: true, uiPayload: expect.objectContaining({ type: "job_discovery_confirmation" }) }),
      expect.objectContaining({ type: "text", content: "已生成岗位发现确认卡，请确认条件后开始扫描。" }),
    ]));
    expect(events.some((event) => event.type === "run_directive" && event.directive === "wait_user")).toBe(false);
  });

  it("keeps get_recent_jd_context available to JD evaluation runs", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubEnv("ZHIPU_API_KEY", "");
    executeGovernedRuntimeTool.mockResolvedValue({
      runDirective: "continue",
      observation: {
        category: "tool_success",
        stage: "execution",
        retryability: "none",
        effectState: "not_dispatched",
        fingerprint: "jd:recent-context",
        userSafeSummary: "已读取保存的 JD",
        diagnosticRef: "attempt-jd-context",
        recoveryCapabilities: [],
      },
      attempt: {
        id: "attempt-jd-context",
        status: "succeeded",
        effectState: "not_dispatched",
        result: {
          success: true,
          data: { id: 15, company: "示例公司", role: "AI 产品经理", body: "负责 AI 产品规划和交付。" },
          errorCategory: "ok",
          llmSummary: "已读取保存的 JD 正文。",
          uiPayload: { type: "recent_jd_context", reportId: 15 },
        },
      },
    });
    const responses = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-jd-context","function":{"name":"get_recent_jd_context","arguments":"{\\"jdId\\":15}"}}]}}]}\n\ndata: [DONE]\n\n',
      'data: {"choices":[{"delta":{"content":"我已读取这份 JD，可以继续评估。"}}]}\n\ndata: [DONE]\n\n',
    ];
    const requestBodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      requestBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
      return new Response(responses.shift() || "data: [DONE]\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }));
    const events = [];

    for await (const event of agentLoopServer({
      agent: { id: "evaluate", toolNames: ["get_recent_jd_context", "evaluate_jd_full"] } as never,
      systemPrompt: "JD 评估助手",
      messages: [{ role: "user", content: "请评估已保存的 JD 编号 15" }],
      tools: [
        { type: "function", function: { name: "get_recent_jd_context" } },
        { type: "function", function: { name: "evaluate_jd_full" } },
      ],
      taskContract: createAgentTaskContract({
        taskType: "jd_evaluation",
        target: "请评估已保存的 JD 编号 15",
        successCriteria: [],
      }),
      executionContext: {
        principal: { userId: "jd-user" },
        runId: "jd-run",
        workerId: "jd-worker",
        fencingToken: 1,
        allowlist: ["get_recent_jd_context", "evaluate_jd_full"],
      },
    })) events.push(event);

    const firstRequestTools = (requestBodies[0]?.tools || []) as Array<{ function: { name: string } }>;
    expect(firstRequestTools.map((tool) => tool.function.name)).toContain("get_recent_jd_context");
    expect(executeGovernedRuntimeTool).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "get_recent_jd_context",
      args: { jdId: 15 },
    }));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool_call", name: "get_recent_jd_context", params: { jdId: 15 } }),
    ]));
    expect(requestBodies.length).toBeGreaterThanOrEqual(1);
  });
});
