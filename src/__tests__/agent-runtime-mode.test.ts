import { describe, expect, it } from "vitest";
import { resolveAgentRuntimeAssignment } from "@/lib/agent/runtime/runtime-mode";

describe("Agent Runtime rollout mode", () => {
  it("assigns every run to the worker after the M1 cutover, regardless of legacy config", () => {
    const staleConfig = {
      mode: "worker_readonly" as const,
      percentage: 25,
      allowlist: [] as string[],
    };

    const first = resolveAgentRuntimeAssignment("user-42", "resume_query", staleConfig);
    const replay = resolveAgentRuntimeAssignment("user-42", "resume_query", staleConfig);
    const write = resolveAgentRuntimeAssignment("user-42", "resume_edit", staleConfig);
    const legacyMode = resolveAgentRuntimeAssignment("user-42", "resume_edit", {
      mode: "legacy" as const,
      percentage: 0,
      allowlist: [],
    });

    expect(replay).toEqual(first);
    expect(write.owner).toBe("worker");
    expect(legacyMode.owner).toBe("worker");
  });
});
