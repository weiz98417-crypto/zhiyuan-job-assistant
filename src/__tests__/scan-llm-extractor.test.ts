import { afterEach, describe, expect, it, vi } from "vitest";

const originalApiKey = process.env.DEEPSEEK_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = originalApiKey;
});

describe("custom scan LLM extractor", () => {
  it("uses deepseek-flash and maps extracted jobs", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ jobs: [{ title: "产品经理", url: "/jobs/1", location: "杭州" }] }) } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const { extractWithLLM } = await import("../../lib/scan/adapters/llm-extractor.mjs");
    const jobs = await extractWithLLM("招聘页面内容", "示例公司", "https://example.com/careers");

    expect(fetchMock).toHaveBeenCalledWith("https://api.deepseek.com/chat/completions", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
    }));
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("deepseek-flash");
    expect(body.messages[0].role).toBe("system");
    expect(jobs).toMatchObject([{ title: "产品经理", url: "https://example.com/jobs/1", company: "示例公司", location: "杭州" }]);
  });

  it("fails clearly when DeepSeek credentials are missing", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const { extractWithLLM } = await import("../../lib/scan/adapters/llm-extractor.mjs");

    await expect(extractWithLLM("招聘页面内容", "示例公司", "https://example.com/careers"))
      .rejects.toThrow("DEEPSEEK_API_KEY not set");
  });
});
