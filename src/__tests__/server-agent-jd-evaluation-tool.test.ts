import { beforeEach, describe, expect, it, vi } from "vitest";

const { runDurableJDEvaluation, markScanJobsEvaluatedForJdForUser } = vi.hoisted(() => ({
  runDurableJDEvaluation: vi.fn(),
  markScanJobsEvaluatedForJdForUser: vi.fn(async () => ({ updated: 1 })),
}));

vi.mock("@/lib/server/durable-jd-evaluation", () => ({
  DurableJDEvaluationInputError: class DurableJDEvaluationInputError extends Error {},
  runDurableJDEvaluation,
}));

vi.mock("@/lib/scan-data", () => ({ markScanJobsEvaluatedForJdForUser }));

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

  it("writes the linked discovery job back to evaluated after durable read-back succeeds", async () => {
    const result = await evaluateJDFull.handler(
      { jd_text: "公司：纸鸢科技。岗位职责：负责产品规划与交付。".repeat(3), jd_id: 34 },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["evaluate_jd_full"],
        requestId: "request-1",
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({ scanJobStatus: "evaluated", scanJobsUpdated: 1 }));
    expect(markScanJobsEvaluatedForJdForUser).toHaveBeenCalledWith(34, "user-1");
  });

  it("leaves discovery status untouched when durable evaluation fails", async () => {
    runDurableJDEvaluation.mockRejectedValueOnce(new Error("model unavailable"));

    const result = await evaluateJDFull.handler(
      { jd_text: "公司：纸鸢科技。岗位职责：负责产品规划与交付。".repeat(3), jd_id: 34 },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["evaluate_jd_full"],
        requestId: "request-1",
      },
    );

    expect(result).toEqual(expect.objectContaining({
      success: false,
      errorCategory: "transient",
      recoverable: true,
    }));
    expect(markScanJobsEvaluatedForJdForUser).not.toHaveBeenCalled();
  });

  it("does not present an invalid historical score as a five-point result", () => {
    const summary = evaluateJDFull.formatResult({
      success: true,
      data: {
        company: "纸鸢科技",
        role: "产品经理",
        overallScore: 70,
        blocks: { a: { content: "岗位信息", score: 70 } },
      },
    });

    expect(summary).toContain("总分：待复核");
    expect(summary).toContain("A:待复核");
    expect(summary).not.toContain("70/5");
  });
});
