import { describe, expect, it } from "vitest";
import { hardVetoPasses, judgeStagingOutput } from "@/lib/agent/staging-judge";
import { QUALITY_VETO_CODES } from "@/lib/agent/llm-scorers";

describe("Spec 15: canonical veto codes survive the hard-veto filter", () => {
  it("keeps both LLM scorer veto codes and blocks release", () => {
    for (const code of QUALITY_VETO_CODES) {
      expect(hardVetoPasses(code)).toBe(true);
      const result = judgeStagingOutput({
        taskType: "resume_edit",
        output: "完整且有帮助的修改建议。",
        hardVetoes: [code],
      });
      expect(result.hardVetoes).toContain(code);
      expect(result.releaseAllowed).toBe(false);
    }
  });

  it("documents the trap: free-text vetoes are silently dropped by the filter", () => {
    expect(hardVetoPasses("编造了工作经历")).toBe(false);
    const result = judgeStagingOutput({
      taskType: "resume_edit",
      output: "完整且有帮助的修改建议。",
      hardVetoes: ["编造了工作经历"],
    });
    expect(result.hardVetoes).toEqual([]);
    expect(result.releaseAllowed).toBe(true);
  });
});
