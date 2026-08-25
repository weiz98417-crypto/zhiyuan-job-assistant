import { afterEach, describe, expect, it, vi } from "vitest";

const executeToolMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agent/tools", () => ({
  executeTool: executeToolMock,
  formatToolResult: (result: { llmSummary?: string }) => result.llmSummary || "图片识别完成",
  getTool: () => ({
    parameters: { images: { type: "array", required: true, description: "images" } },
    toolCtxCap: 800,
    formatResult: () => "图片识别完成",
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  executeToolMock.mockReset();
});

describe("server Agent Loop image compatibility", () => {
  it("injects the latest user images into image-capable tools", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubEnv("ZHIPU_API_KEY", "");
    executeToolMock.mockResolvedValue({
      success: true,
      data: { documentType: "resume" },
      llmSummary: "图片识别完成",
      errorCategory: "ok",
    });
    const encoder = new TextEncoder();
    const responses = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"evaluate_jd_full","arguments":"{}"}}]}}]}\n\ndata: [DONE]\n\n',
      'data: {"choices":[{"delta":{"content":"已识别图片。"}}]}\n\ndata: [DONE]\n\n',
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(responses.shift() || "data: [DONE]\n\n"));
        controller.close();
      },
    }), { status: 200 })));
    const { agentLoopServer } = await import("@/lib/agent/loop/server-runner");

    for await (const _event of agentLoopServer({
      agent: { id: "evaluate", model: "deepseek-v4-flash", toolNames: ["evaluate_jd_full"] } as never,
      systemPrompt: "识别用户图片",
      messages: [{
        role: "user",
        content: "这是我的简历",
        images: ["data:image/png;base64,resume-image"],
      }],
      tools: [{ type: "function", function: { name: "evaluate_jd_full" } }],
    })) {
    }

    expect(executeToolMock).toHaveBeenCalledWith(
      "evaluate_jd_full",
      { images: ["data:image/png;base64,resume-image"] },
      undefined,
    );
  });
});
