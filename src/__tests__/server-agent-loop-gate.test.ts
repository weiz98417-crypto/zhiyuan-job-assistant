import { afterEach, describe, expect, it, vi } from "vitest";

const { executeGovernedRuntimeTool } = vi.hoisted(() => ({
  executeGovernedRuntimeTool: vi.fn(),
}));

vi.mock("@/lib/agent/runtime/governed-tool-runtime", () => ({ executeGovernedRuntimeTool }));

import { agentLoopServer } from "@/lib/agent/loop/server-runner";

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
});
