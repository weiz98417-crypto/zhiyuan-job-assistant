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
});
