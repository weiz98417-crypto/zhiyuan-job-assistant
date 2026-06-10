import { describe, expect, it } from "vitest";
import { CurrentOrchestratorRuntimeAdapter } from "@/lib/agent/runtime-adapter";

describe("agent runtime adapter", () => {
  it("exposes an explicit non-resume state for the current orchestrator", async () => {
    const adapter = new CurrentOrchestratorRuntimeAdapter();
    const events = [];

    for await (const event of adapter.resume("run-1")) {
      events.push(event);
    }

    expect(events).toEqual([
      expect.objectContaining({
        type: "error",
        runId: "run-1",
        message: expect.stringContaining("cannot resume durable runs yet"),
      }),
      expect.objectContaining({ type: "done", runId: "run-1" }),
    ]);
  });

  it("allows cancelling an unknown run id without throwing", async () => {
    const adapter = new CurrentOrchestratorRuntimeAdapter();

    await expect(adapter.cancel("missing-run")).resolves.toBeUndefined();
  });
});
