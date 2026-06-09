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

import { agentLoopClient } from "@/lib/agent/loop/client-runner";

const images = ["data:image/png;base64,abc"];

async function collectEvents(generator: AsyncGenerator<SSEEvent>): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
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
});
