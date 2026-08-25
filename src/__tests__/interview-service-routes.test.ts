import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  generateInterviewQuestionsForAgent: vi.fn(),
  handleInterviewSessionTurnForAgent: vi.fn(),
  scoreInterviewAnswerForAgent: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: boundaries.getCurrentUser }));
vi.mock("@/lib/server/interview-analysis-service", () => ({
  generateInterviewQuestionsForAgent: boundaries.generateInterviewQuestionsForAgent,
  handleInterviewSessionTurnForAgent: boundaries.handleInterviewSessionTurnForAgent,
  scoreInterviewAnswerForAgent: boundaries.scoreInterviewAnswerForAgent,
}));

import { POST as generateQuestions } from "@/app/api/agent/coach/generate-questions/route";
import { POST as handleSession } from "@/app/api/agent/coach/session/route";
import { POST as scoreAnswer } from "@/app/api/agent/coach/score-answer/route";

describe("interview service routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundaries.getCurrentUser.mockResolvedValue({ userId: "user-1" });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("route must not call model directly"));
  });

  it("generates questions through the shared principal-scoped service", async () => {
    boundaries.generateInterviewQuestionsForAgent.mockResolvedValue({
      questions: [{ category: "behavioral", question: "请介绍项目", context: "项目能力", storyHint: "STAR", source: "general" }],
      company: "甲公司",
      role: "AI 产品经理",
      mode: "behavioral",
      memoryContext: { llmSummary: "历史面试偏弱项" },
    });
    const request = new Request("http://localhost/api/agent/coach/generate-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: "甲公司", role: "AI 产品经理", count: 1 }),
    });

    const response = await generateQuestions(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { questions: [{ question: "请介绍项目" }] } });
    expect(boundaries.generateInterviewQuestionsForAgent).toHaveBeenCalledWith(
      { userId: "user-1" },
      expect.objectContaining({ company: "甲公司", role: "AI 产品经理", count: 1 }),
      { signal: request.signal },
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("scores answers through the same shared service", async () => {
    boundaries.scoreInterviewAnswerForAgent.mockResolvedValue({
      score: { dimensions: { structure: 4, specificity: 4, highlight: 3, timing: 4 }, overall: 3.75, suggestions: [], segmentFeedback: [] },
      memoryContext: { llmSummary: "" },
      memoryWriteback: { status: "persisted", readBackVerified: true, id: 9 },
    });
    const request = new Request("http://localhost/api/agent/coach/score-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "请介绍项目", answer: "我负责了 Agent 项目并提升转化率。", mode: "behavioral" }),
    });

    const response = await scoreAnswer(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { overall: 3.75, readBackVerified: true } });
    expect(boundaries.scoreInterviewAnswerForAgent).toHaveBeenCalledWith(
      { userId: "user-1" },
      expect.objectContaining({ question: "请介绍项目", mode: "behavioral" }),
      { signal: request.signal },
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("persists each interview session turn through the shared service", async () => {
    boundaries.handleInterviewSessionTurnForAgent.mockResolvedValue({
      sessionId: "42",
      phase: "intro",
      question: "请先介绍你最相关的项目。",
      questionIndex: 0,
      sourceBinding: { jdId: 7 },
      readBackVerified: true,
    });
    const request = new Request("http://localhost/api/agent/coach/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: "甲公司", role: "AI 产品经理", jdId: 7 }),
    });

    const response = await handleSession(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { sessionId: "42", readBackVerified: true } });
    expect(boundaries.handleInterviewSessionTurnForAgent).toHaveBeenCalledWith(
      { userId: "user-1" },
      expect.objectContaining({ company: "甲公司", role: "AI 产品经理", jdId: 7 }),
      { signal: request.signal },
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
