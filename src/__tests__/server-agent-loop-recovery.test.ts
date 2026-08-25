import { afterEach, describe, expect, it, vi } from "vitest";
import { agentLoopServer } from "@/lib/agent/loop/server-runner";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("durable server Agent Loop recovery", () => {
  it("reports provider exhaustion as a recoverable error instead of successful assistant text", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    vi.stubEnv("ZHIPU_API_KEY", "");
    const events = [];

    for await (const event of agentLoopServer({
      systemPrompt: "You are a helpful agent.",
      messages: [{ role: "user", content: "读取我的简历" }],
      executionContext: {
        principal: { userId: "user-1" },
        runId: "run-1",
        workerId: "worker-1",
        fencingToken: 1,
        allowlist: ["read_file"],
      },
    })) events.push(event);

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "error", message: expect.stringContaining("All models failed") }),
    ]));
    expect(events.some((event) => event.type === "text" && event.content.includes("AI 请求失败"))).toBe(false);
  });

  it("switches to a different provider after a switch-provider recovery decision", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubEnv("ZHIPU_API_KEY", "test-zhipu-key");
    const encoder = new TextEncoder();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"恢复成功"}}]}\n\n'));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      }),
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const events = [];

    for await (const event of agentLoopServer({
      agent: { model: "deepseek-v4-flash" } as never,
      systemPrompt: "You are a helpful agent.",
      messages: [{ role: "user", content: "继续原任务" }],
      modelRecovery: { switchProvider: true },
    })) events.push(event);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.model).not.toMatch(/^deepseek-/);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("bigmodel.cn");
    expect(events).toContainEqual({ type: "text", content: "恢复成功" });
  });
});
