import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({
  runDurableJDEvaluation: vi.fn(),
  loadAgentMode: vi.fn(),
  loadInterviewStoryBank: vi.fn(),
}));

vi.mock("@/lib/server/durable-jd-evaluation", () => ({
  runDurableJDEvaluation: boundaries.runDurableJDEvaluation,
  DurableJDEvaluationInputError: class extends Error {},
}));
vi.mock("@/lib/server/agent-mode-service", () => ({
  loadAgentMode: boundaries.loadAgentMode,
  loadInterviewStoryBank: boundaries.loadInterviewStoryBank,
}));

import { evaluateJD } from "@/lib/agent/tools/action/evaluate-jd";
import { prepareInterviewFull } from "@/lib/agent/tools/action/prepare-interview-full";
import { selfPositioning } from "@/lib/agent/tools/action/self-positioning";

const context = {
  principal: { userId: "user-1" },
  runId: "run-1",
  allowlist: ["evaluate_jd", "prepare_interview_full", "self_positioning"],
  signal: new AbortController().signal,
};

describe("server model and framework tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("legacy HTTP must not be used"));
  });

  it("uses durable JD evaluation for the legacy evaluation alias", async () => {
    boundaries.runDurableJDEvaluation.mockResolvedValue({
      company: "示例科技",
      role: "产品经理",
      overallScore: 4,
      archetype: "AI产品经理",
      blocks: {},
      scores: {},
      keywords: [],
      legitimacy: "ok",
      reportNum: 12,
    });
    const result = await evaluateJD.handler({ jdText: "完整 JD 内容".repeat(10) }, context);
    expect(result.success).toBe(true);
    expect(boundaries.runDurableJDEvaluation).toHaveBeenCalledWith(
      context.principal,
      expect.objectContaining({ jdText: expect.any(String) }),
      { signal: context.signal },
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("loads positioning and interview assets directly from the server filesystem", async () => {
    boundaries.loadAgentMode.mockImplementation((name: string) => name === "dingwei"
      ? "## 第一阶段：兴趣探索\n## 第二阶段：能力盘点"
      : "面试准备框架");
    boundaries.loadInterviewStoryBank.mockReturnValue("STAR 故事库");
    const positioning = await selfPositioning.handler({}, context);
    const prep = await prepareInterviewFull.handler({ company: "甲", role: "产品" }, context);
    expect(positioning.success).toBe(true);
    expect(prep).toMatchObject({ success: true, data: { hasPrepFramework: true, hasStoryBank: true } });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
