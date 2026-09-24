import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  requestResumeOptimizationModel,
  ResumeOptimizationProviderError,
} from "@/lib/server/resume-optimization-model";

describe("resume optimization model", () => {
  beforeEach(() => {
    vi.stubEnv("DEEPSEEK_API_KEY", "deepseek-key");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses DeepSeek Flash without switching providers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.deepseek.com/chat/completions");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).model).toBe("deepseek-flash");
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not switch models when a structured response is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      choices: [{ message: { content: "", reasoning_content: "模型仍在思考" } }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestResumeOptimizationModel({
      fast: true,
      messages: [{ role: "user", content: "生成简历优化方案" }],
      temperature: 0.3,
      maxTokens: 8000,
    })).rejects.toBeInstanceOf(ResumeOptimizationProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).model).toBe("deepseek-flash");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).thinking).toEqual({ type: "disabled" });
  });
});
