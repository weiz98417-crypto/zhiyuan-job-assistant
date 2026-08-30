import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/data-repositories", () => ({
  getDataRepositories: () => ({
    sessions: {
      get: boundaries.get,
      update: boundaries.update,
    },
  }),
}));

// Regression: ISSUE-ONLINE-004 — durable interview messages did not update interviewState
// Found by /qa on 2026-08-28
// Report: .gstack/qa-reports/qa-report-121-43-198-13-2026-08-28.md
describe("durable interview session persistence regression", () => {
  beforeEach(() => {
    vi.resetModules();
    boundaries.get.mockReset();
    boundaries.update.mockReset();
    boundaries.get.mockResolvedValue({
      id: 77,
      messages_json: "[]",
      interview_state_json: "{}",
    });
    boundaries.update.mockResolvedValue(true);
  });

  it("rebuilds answered rounds and the next question while saving Worker messages", async () => {
    const { saveExecutionConversation } = await import("@/lib/agent/runtime/execution-session-service");

    await saveExecutionConversation({ userId: "user-1" }, 77, [
      {
        role: "tool",
        content: "已生成面试题",
        toolName: "generate_interview_questions",
        toolResult: {
          kind: "card",
          status: "success",
          toolName: "generate_interview_questions",
          uiPayload: {
            type: "interview_questions",
            company: "上海回归测试科技",
            role: "AI 产品经理",
            mode: "behavioral",
            questions: [{
              question: "第一题：请介绍一个你主导的 AI 产品项目？",
              category: "behavioral",
              context: "考察产品全流程能力",
            }],
          },
        },
        timestamp: "2026-08-28T11:25:39.243Z",
      },
      {
        role: "assistant",
        content: "第一题：请介绍一个你主导的 AI 产品项目？",
        timestamp: "2026-08-28T11:25:50.401Z",
      },
      {
        role: "user",
        content: "我负责需求研究、指标设计和上线验收。",
        timestamp: "2026-08-28T11:27:00.000Z",
      },
      {
        role: "assistant",
        content: "第二题：你如何定义模型质量阈值并推动研发达成？",
        timestamp: "2026-08-28T11:27:20.000Z",
      },
    ]);

    const update = boundaries.update.mock.calls.at(-1)?.[2];
    expect(update.interviewState.transcript.filter((turn: { role: string }) => turn.role === "user")).toHaveLength(1);
    expect(update.interviewState.questionGraph).toHaveLength(2);
    expect(update.interviewState.questionGraph.at(-1)?.question).toContain("模型质量阈值");
    expect(update.interviewState.currentQuestionId).toBe(update.interviewState.questionGraph.at(-1)?.id);
  });
});
