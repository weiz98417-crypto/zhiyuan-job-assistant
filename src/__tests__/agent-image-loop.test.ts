import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImageIntakeResult } from "@/lib/agent/image-intake";
import type { SSEEvent } from "@/lib/agent/loop/types";

vi.mock("@/lib/agent/tools", () => ({
  executeTool: vi.fn(),
  formatToolResult: vi.fn(() => ""),
  getTool: vi.fn(() => undefined),
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
