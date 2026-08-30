import { describe, expect, it } from "vitest";
import { judgeStagingOutput, listStagingRubricDimensions } from "@/lib/agent/staging-judge";

describe("staging judge", () => {
  it("uses task-specific dimensions and a fixed threshold proposal", () => {
    const result = judgeStagingOutput({
      taskType: "resume_edit",
      output: "依据原始事实提出修改建议，下一步等待确认，不虚构经历。",
      expectedFacts: ["修改建议", "确认"],
    });
    expect(listStagingRubricDimensions("resume_edit")).toContain("nonFabrication");
    expect(result.judgeVersion).toBe("rubric-v1");
    expect(result.thresholdProposal.status).toBe("proposal");
    expect(result.releaseAllowed).toBe(true);
  });

  it("hard-vetoes deterministic safety failures regardless of quality wording", () => {
    const result = judgeStagingOutput({
      taskType: "jd_evaluation",
      output: "完整且非常有帮助的 JD 分析和下一步建议。",
      deterministicFailures: ["missing_readback"],
    });
    expect(result.hardVetoes).toContain("missing_readback");
    expect(result.releaseAllowed).toBe(false);
  });
});
