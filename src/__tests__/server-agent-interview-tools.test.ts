import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({
  generateInterviewQuestionsForAgent: vi.fn(),
  scoreInterviewAnswerForAgent: vi.fn(),
  startInterviewSessionForAgent: vi.fn(),
}));

vi.mock("@/lib/server/interview-analysis-service", () => ({
  generateInterviewQuestionsForAgent: boundaries.generateInterviewQuestionsForAgent,
  scoreInterviewAnswerForAgent: boundaries.scoreInterviewAnswerForAgent,
  startInterviewSessionForAgent: boundaries.startInterviewSessionForAgent,
}));

import { generateInterviewQuestions, scoreInterviewAnswer } from "@/lib/agent/tools/interview-tools";
import { startInterviewSession } from "@/lib/agent/tools/action/start-interview-session";

const context = {
  principal: { userId: "user-1" },
  runId: "run-1",
  allowlist: ["generate_interview_questions", "score_interview_answer"],
  signal: new AbortController().signal,
};

describe("server interview tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("legacy HTTP must not be used"));
  });

  it("generates one question and scores answers through cancellable server adapters", async () => {
    boundaries.generateInterviewQuestionsForAgent.mockResolvedValue({
      questions: [{ category: "behavioral", question: "请介绍项目", context: "项目", storyHint: "STAR", source: "general" }],
      company: "甲",
      role: "产品",
      mode: "behavioral",
      memoryContext: { llmSummary: "memory" },
    });
    boundaries.scoreInterviewAnswerForAgent.mockResolvedValue({
      score: {
        dimensions: { structure: 4, specificity: 4, highlight: 3, timing: 4 },
        overall: 3.75,
        suggestions: [],
      },
      memoryContext: { llmSummary: "memory" },
      memoryWriteback: { status: "persisted", readBackVerified: true },
    });

    const generated = await generateInterviewQuestions.handler({ company: "甲", role: "产品", count: 8 }, context);
    const scored = await scoreInterviewAnswer.handler({ question: "Q", answer: "A".repeat(80) }, context);

    expect(generated).toMatchObject({ success: true, data: { count: 1 } });
    expect(scored).toMatchObject({ success: true, data: { overall: 3.75 } });
    expect(boundaries.generateInterviewQuestionsForAgent).toHaveBeenCalledWith(
      context.principal,
      expect.objectContaining({ count: 1 }),
      { signal: context.signal },
    );
    expect(boundaries.scoreInterviewAnswerForAgent).toHaveBeenCalledWith(
      context.principal,
      expect.objectContaining({ question: "Q" }),
      { signal: context.signal },
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("starts a read-back verified persistent interview session", async () => {
    boundaries.startInterviewSessionForAgent.mockResolvedValue({
      sessionId: "42",
      phase: "intro",
      question: "请介绍一下自己",
      readBackVerified: true,
    });
    const result = await startInterviewSession.handler({ company: "甲", role: "产品" }, {
      ...context,
      requestId: "request-1",
      allowlist: ["start_interview_session"],
    });
    expect(result).toMatchObject({ success: true, data: { sessionId: "42", readBackVerified: true } });
    expect(boundaries.startInterviewSessionForAgent).toHaveBeenCalledWith(
      context.principal,
      expect.objectContaining({ company: "甲", role: "产品", requestKey: "request-1" }),
      { signal: context.signal },
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
