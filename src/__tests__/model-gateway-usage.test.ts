import { afterEach, describe, expect, it, vi } from "vitest";
import { complete } from "@/lib/ai/model-gateway";

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe("Spec 15: model gateway usage capture (complete path)", () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });

  it("surfaces provider token usage on ChatResult", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      choices: [{ message: { content: "评分结果" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
    })));

    const result = await complete({ messages: [{ role: "user", content: "评分这个输出" }], stream: false });
    expect(result.usage).toEqual({ promptTokens: 12, completionTokens: 34, totalTokens: 46 });
  });

  it("leaves usage undefined when the provider omits it", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      choices: [{ message: { content: "评分结果" }, finish_reason: "stop" }],
    })));

    const result = await complete({ messages: [{ role: "user", content: "评分这个输出" }], stream: false });
    expect(result.usage).toBeUndefined();
  });
});
