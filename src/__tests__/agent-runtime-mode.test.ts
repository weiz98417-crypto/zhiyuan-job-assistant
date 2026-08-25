import { describe, expect, it } from "vitest";
import { resolveAgentRuntimeAssignment } from "@/lib/agent/runtime/runtime-mode";

describe("Agent Runtime rollout mode", () => {
  it("assigns a stable user cohort and keeps writes legacy in readonly mode", () => {
    const config = {
      mode: "worker_readonly" as const,
      percentage: 25,
      allowlist: [] as string[],
    };

    const first = resolveAgentRuntimeAssignment("user-42", "resume_query", config);
    const replay = resolveAgentRuntimeAssignment("user-42", "resume_query", config);
    const write = resolveAgentRuntimeAssignment("user-42", "resume_edit", config);

    expect(replay).toEqual(first);
    expect(write.owner).toBe("legacy");
  });
});
