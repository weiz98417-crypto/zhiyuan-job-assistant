import { describe, expect, it } from "vitest";
import { RuntimeCircuitBreaker } from "@/lib/agent/runtime/runtime-circuit-breaker";

describe("Runtime circuit breaker", () => {
  it("opens after repeated failures and permits one half-open probe", async () => {
    let now = 1_000;
    const breaker = new RuntimeCircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 100,
      now: () => now,
    });
    const failure = async () => {
      throw new Error("provider unavailable");
    };

    await expect(breaker.execute("provider:primary", failure)).rejects.toThrow("provider unavailable");
    await expect(breaker.execute("provider:primary", failure)).rejects.toThrow("provider unavailable");
    await expect(breaker.execute("provider:primary", async () => "blocked")).rejects.toThrow("circuit open");

    now += 101;
    const probe = breaker.execute("provider:primary", async () => "healthy");
    await expect(breaker.execute("provider:primary", async () => "parallel")).rejects.toThrow("half-open probe");
    await expect(probe).resolves.toBe("healthy");
    await expect(breaker.execute("provider:primary", async () => "normal")).resolves.toBe("normal");
  });
});
