import { describe, expect, it } from "vitest";
import { getTaskProgram } from "@/lib/agent/task-program";
import { createAgentTaskContract } from "@/lib/agent/task-contract";

describe("Task Program registry", () => {
  it("defines job discovery as a deterministic Program with confirmation and read-back", () => {
    const program = getTaskProgram("job_search");

    expect(program.executionDepth).toBe("deterministic");
    expect(program.stages).toEqual([
      "preflight",
      "clarify_or_gate",
      "execute",
      "verify_read_back",
      "respond",
    ]);
    expect(program.successCriteria).toContain("scan creation gated by user confirmation");
    expect(program.successCriteria).toContain("scan read-back or opportunity pool response returned");
  });

  it("binds the selected Program version and stages into the Run Contract", () => {
    const contract = createAgentTaskContract({
      taskType: "resume_edit",
      target: "项目经历",
    });

    expect(contract.program).toEqual({
      id: "resume_edit",
      version: "2026-08-30",
      executionDepth: "deterministic",
      stages: ["preflight", "clarify_or_gate", "execute", "verify_read_back", "persist_artifact", "respond"],
    });
    expect(contract.successCriteria).toContain("target section read-back hash matches applied content");
  });
});
