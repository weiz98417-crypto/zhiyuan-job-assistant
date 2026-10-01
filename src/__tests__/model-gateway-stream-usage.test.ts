import { afterEach, describe, expect, it, vi } from "vitest";
import { parseToolCallStream, streamChat } from "@/lib/ai/model-gateway";

function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("Spec 18: stream usage capture", () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });

  it("parses the usage frame from the SSE tail", async () => {
    const response = sseResponse([
      'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":7,"completion_tokens":9,"total_tokens":16}}\n\n',
      "data: [DONE]\n\n",
    ]);
    const parsed = await parseToolCallStream(response);
    expect(parsed.text).toBe("你好");
    expect(parsed.finishReason).toBe("stop");
    expect(parsed.usage).toEqual({ promptTokens: 7, completionTokens: 9, totalTokens: 16 });
  });

  it("leaves usage undefined when the provider omits the frame", async () => {
    const response = sseResponse([
      'data: {"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    const parsed = await parseToolCallStream(response);
    expect(parsed.usage).toBeUndefined();
  });

  it("requests stream_options.include_usage on the stream path", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => sseResponse(["data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);

    await streamChat({ messages: [{ role: "user", content: "hi" }], stream: true });
    const rawBody = fetchMock.mock.calls[0]?.[1]?.body;
    const body = JSON.parse(String(rawBody)) as { stream_options?: { include_usage?: boolean } };
    expect(body.stream_options?.include_usage).toBe(true);
  });

  it("does not add stream_options to non-stream requests", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { complete } = await import("@/lib/ai/model-gateway");
    await complete({ messages: [{ role: "user", content: "hi" }], stream: false });
    const rawBody = fetchMock.mock.calls[0]?.[1]?.body;
    const body = JSON.parse(String(rawBody)) as { stream_options?: unknown };
    expect(body.stream_options).toBeUndefined();
  });
});
