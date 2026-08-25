import { afterEach, describe, expect, it, vi } from "vitest";
import { llmRetry } from "@/lib/llm-retry";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LLM retry cancellation", () => {
  it("stops immediately when the durable run is cancelled", async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const signal = init?.signal;
      return await new Promise<Response>((_resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("aborted", "AbortError"));
          return;
        }
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
    });
    const request = llmRetry("https://example.com/chat", "key", {
      model: "model-a",
      messages: [{ role: "user", content: "hello" }],
      retries: 2,
      signal: controller.signal,
    });
    await Promise.resolve();

    controller.abort(new Error("run cancelled"));
    const outcome = await Promise.race([
      request.then(() => "resolved", (error) => error instanceof Error ? error.message : String(error)),
      new Promise<string>((resolve) => setTimeout(() => resolve("still pending"), 50)),
    ]);

    expect(outcome).toBe("run cancelled");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
