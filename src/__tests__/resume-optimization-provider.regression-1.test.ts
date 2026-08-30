import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  requestResumeOptimizationModel,
  ResumeOptimizationProviderError,
} from "@/lib/server/resume-optimization-model";

describe("resume optimization provider fallback", () => {
  beforeEach(() => {
    vi.stubEnv("DEEPSEEK_API_KEY", "deepseek-invalid");
    vi.stubEnv("ZHIPU_API_KEY", "zhipu-valid");
    vi.stubEnv("ZHIPU_RESUME_MODEL", "glm-5.3-flash");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("switches to Zhipu when DeepSeek rejects authentication", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        error: { type: "authentication_error", message: "invalid key" },
      }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({
        choices: [{ message: { content: '{"variants":[{"content":"优化后的经历内容足够长，包含明确行动与量化结果。"}]}' } }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await requestResumeOptimizationModel({
      fast: true,
      messages: [{ role: "user", content: "生成简历优化方案" }],
      temperature: 0.3,
      maxTokens: 8000,
    });
    const payload = await response.json();

    expect(payload.choices?.[0]?.message?.content).toContain("variants");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://api.deepseek.com/chat/completions",
      "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    ]);
    expect(fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)).model)).toEqual([
      "deepseek-v4-flash",
      "glm-5.3-flash",
    ]);
  });

  it("reports exhausted authentication failures as non-retryable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      error: { type: "authentication_error", message: "invalid key" },
    }, { status: 401 })));

    await expect(requestResumeOptimizationModel({
      fast: true,
      messages: [{ role: "user", content: "生成简历优化方案" }],
      temperature: 0.3,
      maxTokens: 8000,
    })).rejects.toMatchObject({
      name: "ResumeOptimizationProviderError",
      retryable: false,
    });
  });

  it("reports exhausted network failures as retryable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestResumeOptimizationModel({
      fast: true,
      messages: [{ role: "user", content: "生成简历优化方案" }],
      temperature: 0.3,
      maxTokens: 8000,
    })).rejects.toMatchObject({
      name: "ResumeOptimizationProviderError",
      retryable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the pro model when flash returns reasoning without structured content", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "deepseek-valid");
    vi.stubEnv("ZHIPU_API_KEY", "");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        choices: [{ message: { content: "", reasoning_content: "模型仍在思考" } }],
      }))
      .mockResolvedValueOnce(Response.json({
        choices: [{ message: { content: '{"variants":[{"content":"优化后的经历内容足够长，包含明确行动与量化结果。"}]}' } }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await requestResumeOptimizationModel({
      fast: true,
      messages: [{ role: "user", content: "生成简历优化方案" }],
      temperature: 0.3,
      maxTokens: 8000,
    });
    const payload = await response.json();

    expect(payload.choices?.[0]?.message?.content).toContain("variants");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)).model)).toEqual([
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).thinking).toEqual({ type: "disabled" });
  });
});
