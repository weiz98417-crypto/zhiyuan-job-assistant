import { describe, expect, it } from "vitest";
import {
  InMemoryRunOutboxStore,
  RunEvidenceObserver,
} from "@/lib/agent/runtime/run-evidence-observer";

describe("Run Evidence Observer", () => {
  it("retries observer failures without throwing into Run execution", async () => {
    const store = new InMemoryRunOutboxStore();
    await store.enqueue({
      runId: "run-1",
      userId: "user-1",
      eventSequence: 7,
      topic: "run_event",
      payload: { type: "run.status_changed", status: "succeeded" },
    });
    const observer = new RunEvidenceObserver(store, {
      run_event: async () => {
        throw new Error("review provider stalled");
      },
    });

    const result = await observer.processBatch("observer-1", 10);
    const items = await store.list();

    expect(result).toEqual({ claimed: 1, delivered: 0, failed: 1, deadLettered: 0 });
    expect(items[0]).toMatchObject({ status: "pending", attemptCount: 1 });
  });
});
