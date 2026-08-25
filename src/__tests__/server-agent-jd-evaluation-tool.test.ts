import { beforeEach, describe, expect, it, vi } from "vitest";

const { runDurableJDEvaluation } = vi.hoisted(() => ({
  runDurableJDEvaluation: vi.fn(),
}));

vi.mock("@/lib/server/durable-jd-evaluation", () => ({
  DurableJDEvaluationInputError: class DurableJDEvaluationInputError extends Error {},
  runDurableJDEvaluation,
}));

import { evaluateJDFull } from "@/lib/agent/tools/action/evaluate-jd-full";

describe("evaluate_jd_full server execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runDurableJDEvaluation.mockResolvedValue({
      company: "纸鸢科技",
      role: "高级产品经理",
      overallScore: 4.2,
      archetype: "AI 产品经理",
      reportNum: 12,
      jdId: 34,
      reportReadBackVerified: true,
      jdReadBackVerified: true,
      blocks: {},
      keywords: [],
      risks: [],
    });
  });

  it("uses the principal-scoped durable module without localhost HTTP", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("HTTP must not be used"));
    const result = await evaluateJDFull.handler(
      { jd_text: "公司：纸鸢科技。岗位职责：负责产品规划与交付。".repeat(3) },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["evaluate_jd_full"],
        requestId: "request-1",
      },
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(runDurableJDEvaluation).toHaveBeenCalledWith(
      { userId: "user-1" },
      expect.objectContaining({ targetCompany: "" }),
      expect.objectContaining({ signal: undefined }),
    );
    expect(result).toEqual(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ reportReadBackVerified: true, jdReadBackVerified: true }),
    }));
  });
});
