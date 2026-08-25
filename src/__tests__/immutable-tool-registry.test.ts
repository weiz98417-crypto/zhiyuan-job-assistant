import { describe, expect, it } from "vitest";
import { ToolRegistry } from "@/lib/agent/tools/registry";
import type { ToolDefinition } from "@/lib/agent/tools/types";

const whoAmI: ToolDefinition = {
  name: "who_am_i",
  description: "Return the explicit execution principal",
  category: "query",
  parameters: {},
  capability: {
    risk: "low",
    deadlineClass: "foreground_read",
    deadlineMs: 30_000,
    cancellation: "cooperative",
    idempotency: "none",
    reconciliation: "none",
    verification: "none",
    backgroundCapable: false,
    workerExecution: "server",
  },
  handler: async (_params, context) => ({
    success: true,
    data: context?.principal.userId,
  }),
  formatResult: (result) => String(result.data),
};

describe("immutable Tool Registry", () => {
  it("keeps concurrent Run allowlists isolated without mutable global state", async () => {
    const registry = new ToolRegistry();
    registry.register(whoAmI);
    registry.seal();

    const [allowed, denied] = await Promise.all([
      registry.execute("who_am_i", {}, {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["who_am_i"],
      }),
      registry.execute("who_am_i", {}, {
        principal: { userId: "user-2" },
        runId: "run-2",
        allowlist: [],
      }),
    ]);

    expect(allowed.data).toBe("user-1");
    expect(denied.success).toBe(false);
    expect(() => registry.register(whoAmI)).toThrowError("Tool Registry is sealed");
  });
});
