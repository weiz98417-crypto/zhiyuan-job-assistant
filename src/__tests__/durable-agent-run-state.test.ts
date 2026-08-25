import { describe, expect, it } from "vitest";
import { transitionAgentRun } from "@/lib/agent/runtime/state-machine";

describe("Durable Agent Run state machine", () => {
  it("keeps terminal Runs immutable", () => {
    expect(() => transitionAgentRun("succeeded", "queued")).toThrowError(
      "Terminal Agent Run succeeded cannot transition to queued",
    );
  });
});
