import { afterEach, describe, expect, it } from "vitest";
import { createMastraEmbedder } from "@/lib/memory/mastra-adapter";

describe("Spec 14: mastra embedding failure visibility", () => {
  const previousProvider = process.env.MEMORY_EMBEDDING_PROVIDER;

  afterEach(() => {
    if (previousProvider === undefined) delete process.env.MEMORY_EMBEDDING_PROVIDER;
    else process.env.MEMORY_EMBEDDING_PROVIDER = previousProvider;
  });

  it("propagates an unavailable embedding provider instead of silently mocking", () => {
    process.env.MEMORY_EMBEDDING_PROVIDER = "disabled";
    expect(() => createMastraEmbedder()).toThrow(/embedding provider is disabled/i);
  });

  it("propagates a misconfigured api provider instead of silently mocking", () => {
    process.env.MEMORY_EMBEDDING_PROVIDER = "openai-compatible";
    delete process.env.MEMORY_EMBEDDING_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;
    expect(() => createMastraEmbedder()).toThrow(/MEMORY_EMBEDDING_API_URL|MEMORY_EMBEDDING_API_KEY/i);
  });

  it("keeps an explicitly configured mock provider as an operator choice", () => {
    process.env.MEMORY_EMBEDDING_PROVIDER = "mock";
    const embedder = createMastraEmbedder();
    expect(embedder.modelId).toBe("mock-embedding-1536");
  });
});
