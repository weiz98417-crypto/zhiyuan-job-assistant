import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImageIntakeResult } from "@/lib/agent/image-intake";
import type { SSEEvent } from "@/lib/agent/loop/types";

const toolMocks = vi.hoisted(() => ({
  executeTool: vi.fn(),
  formatToolResult: vi.fn(() => ""),
  getTool: vi.fn((() => undefined) as (_name: string) => unknown),
}));

vi.mock("@/lib/agent/tools", () => ({
  executeTool: toolMocks.executeTool,
  formatToolResult: toolMocks.formatToolResult,
  getTool: toolMocks.getTool,
}));

vi.mock("@/lib/db", () => ({
  default: {
    reports: { add: vi.fn() },
  },
}));

vi.mock("@/lib/jd-storage", () => ({
  createJD: vi.fn(),
}));

import { agentLoopClient, AGENT_LOOP_MAX_MESSAGES } from "@/lib/agent/loop/client-runner";
import { generateMemoryDigest, MEMORY_DIGEST_USER_MESSAGE_THRESHOLD } from "@/lib/agent/sessions";

const images = ["data:image/png;base64,abc"];

async function collectEvents(generator: AsyncGenerator<SSEEvent>): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

function thinkResponse(events: Array<Record<string, unknown>>): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  }), { status: 200 });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("agent image intake loop", () => {
  it("short-circuits image-only turns before generic chat", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("think proxy should not be called before image routing");
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const imageIntake: ImageIntakeResult = {
      documentType: "chat_screenshot",
      confidence: 0.88,
      quality: "clear",
      extractedText: "聊天记录：明天下午几点面试？",
      structured: { summary: "聊天截图" },
    };

    const events = await collectEvents(agentLoopClient(
      "system",
      [{ role: "user", content: "", images }],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { imageIntake },
    ));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === "tool_call")).toBe(false);
    const textEvent = events.find((event): event is Extract<SSEEvent, { type: "text" }> => event.type === "text");
    expect(textEvent?.content).toContain("求职评估流程");
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("does not reuse stale prior user text as the active instruction for image-only turns", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("think proxy should not run for image-only clarification");
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const imageIntake: ImageIntakeResult = {
      documentType: "jd",
      confidence: 0.92,
      quality: "clear",
      extractedText: "岗位职责：负责 AI 产品规划、Agent 工作流设计、RAG 知识库建设、评测体系搭建和跨团队落地。任职要求：熟悉大模型应用、数据分析、Prompt Engineering 和产品交付。",
    };

    const events = await collectEvents(agentLoopClient(
      "system",
      [
        { role: "user", content: "我要做 JD 评估" },
        { role: "assistant", content: "请上传 JD" },
        { role: "user", content: "", images },
      ],
      undefined,
      undefined,
      undefined,
      ["evaluate_jd_full"],
      undefined,
      { imageIntake, preferredDocumentType: "jd" },
    ));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === "tool_call" && event.name === "evaluate_jd_full")).toBe(false);
    const textEvent = events.find((event): event is Extract<SSEEvent, { type: "text" }> => event.type === "text");
    expect(textEvent?.content).toContain("JD");
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("does not inject latest user images when JD text is already present", async () => {
    toolMocks.getTool.mockReturnValue({
      name: "evaluate_jd_full",
      category: "action",
      parameters: {
        jd_text: { type: "string", required: false, description: "JD text" },
        images: { type: "array", required: false, description: "JD images" },
      },
      handler: vi.fn(),
      formatResult: vi.fn(),
    });
    toolMocks.executeTool.mockResolvedValue({
      success: true,
      data: null,
      errorCategory: "ok",
      llmSummary: "done",
    });
    toolMocks.formatToolResult.mockReturnValue("done");

    const jdText = "岗位职责：负责 AI 产品规划、需求分析、Agent 工作流设计、评测体系搭建和跨团队落地。任职要求：熟悉大模型应用、数据分析、Prompt Engineering 和产品交付。";
    const fetchMock = vi.fn(async () => thinkResponse([
      { type: "text", content: "评估完成" },
      { type: "finish_reason", finish_reason: "stop" },
    ])) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const imageIntake: ImageIntakeResult = {
      documentType: "jd",
      confidence: 0.97,
      quality: "clear",
      extractedText: jdText,
    };

    await collectEvents(agentLoopClient(
      "system",
      [{ role: "user", content: "帮我评估这个JD", images }],
      undefined,
      undefined,
      undefined,
      ["evaluate_jd_full"],
      undefined,
      { imageIntake, preferredDocumentType: "jd" },
    ));

    const [, params] = toolMocks.executeTool.mock.calls[0];
    expect(params).toEqual({ jd_text: jdText });
    expect(params).not.toHaveProperty("images");
  });

  it("blocks evaluation tools when the latest user turn is symbol-only", async () => {
    toolMocks.executeTool.mockClear();
    const fetchMock = vi.fn(async () => thinkResponse([
      {
        type: "tool_calls",
        tool_calls: [{
          id: "call-symbol-jd",
          name: "evaluate_jd_full",
          arguments: JSON.stringify({ jd_text: "stale JD text from earlier context" }),
        }],
      },
      { type: "finish_reason", finish_reason: "tool_calls" },
    ])) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const events = await collectEvents(agentLoopClient(
      "system",
      [
        { role: "user", content: "帮我评估这个 JD" },
        { role: "assistant", content: "请发送 JD 文本" },
        { role: "user", content: "+" },
      ],
      undefined,
      undefined,
      undefined,
      ["evaluate_jd_full"],
    ));

    expect(toolMocks.executeTool).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === "tool_call" && event.name === "evaluate_jd_full")).toBe(false);
    const textEvent = events.find((event): event is Extract<SSEEvent, { type: "text" }> => event.type === "text");
    expect(textEvent?.content).toContain("我只看到“+”");
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("announces context compression before long history is truncated for the model", async () => {
    const fetchMock = vi.fn(async () => thinkResponse([
      { type: "text", content: "ok" },
      { type: "finish_reason", finish_reason: "stop" },
    ])) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const longHistory = Array.from({ length: AGENT_LOOP_MAX_MESSAGES }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `message ${index}`,
    }));

    const events = await collectEvents(agentLoopClient(
      "system",
      longHistory,
    ));

    expect(events).toContainEqual({ type: "phase", phase: "compressing_context" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps session memory digest gated until the fifth user message", () => {
    const fourUserMessages = Array.from({ length: MEMORY_DIGEST_USER_MESSAGE_THRESHOLD - 1 }, (_, index) => ({
      role: "user" as const,
      content: `用户消息 ${index}`,
      timestamp: new Date().toISOString(),
    }));
    const fiveUserMessages = [
      ...fourUserMessages,
      { role: "user" as const, content: "第 5 条用户消息", timestamp: new Date().toISOString() },
      {
        role: "assistant" as const,
        content: "这是一段足够长的最近分析内容，用来确保摘要生成逻辑在达到阈值后有可提取的信息。它需要超过五十个字符，否则当前 digest 逻辑会认为没有可沉淀内容。",
        timestamp: new Date().toISOString(),
      },
    ];

    expect(MEMORY_DIGEST_USER_MESSAGE_THRESHOLD).toBe(5);
    expect(generateMemoryDigest(fourUserMessages)).toBeNull();
    expect(generateMemoryDigest(fiveUserMessages)).toEqual(expect.any(String));
  });
});
