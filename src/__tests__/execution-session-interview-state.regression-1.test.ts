import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
}));

const sessionMemory = vi.hoisted(() => ({
  append: vi.fn(),
  load: vi.fn(),
}));

vi.mock("@/lib/data-repositories", () => ({
  getDataRepositories: () => ({
    sessions: {
      get: boundaries.get,
      update: boundaries.update,
    },
  }),
}));

vi.mock("@/lib/memory/postgres-memory", () => ({
  getSessionMemoryAdapter: () => ({
    provider: "postgres",
    append: sessionMemory.append,
    load: sessionMemory.load,
    eraseTarget: vi.fn(),
  }),
}));

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
    sessionMemory.append.mockReset();
    sessionMemory.load.mockReset();
    sessionMemory.load.mockResolvedValue([]);
  });

  it("persists the conversation without inventing interview rounds from legacy messages", async () => {
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
    expect(update?.interviewState).toBeUndefined();
    expect(update?.messages).toHaveLength(4);
    expect(update?.messages.at(-1)?.content).toContain("模型质量阈值");
  });

  it("keeps the durable engine as sole writer when its state arrives as serialized JSON", async () => {
    const durable = {
      id: "iv-77", company: "甲公司", role: "AI 产品经理", phase: "tech", questionIndex: 0,
      questions: [{ id: "q1", phase: "tech", text: "请介绍真实贡献", type: "tech" }],
      answers: [], currentQuestion: { id: "q1", phase: "tech", text: "请介绍真实贡献", type: "tech" },
      currentFollowups: [], checkpointVersion: 1,
    };
    boundaries.get.mockResolvedValue({ id: 77, interview_state_json: JSON.stringify(durable) });
    const { saveExecutionConversation } = await import("@/lib/agent/runtime/execution-session-service");
    await saveExecutionConversation({ userId: "user-1" }, 77, [
      { role: "user", content: "暂停面试" },
      { role: "assistant", content: "异常提示：你可以重新开始？" },
    ]);
    const update = boundaries.update.mock.calls.at(-1)?.[2];
    expect(update?.interviewState).toBeUndefined();
    expect(boundaries.get.mock.results.length).toBeGreaterThan(0);
  });

  it("preserves a prepared interview when the Worker persists the first start turn", async () => {
    const prepared = { status: "active", questionGraph: [], transcript: [], scoreArtifacts: [], rebindHistory: [],
      planSnapshot: { snapshotId: "prepared-77", source: { resumeId: "cv-a" },
        jdSnapshot: { company: "甲公司", role: "AI 产品经理", body: "SQL 与产品分析" },
        resumeSnapshot: { title: "本人简历", body: "负责产品分析" }, mode: "project-review",
        difficulty: "pressure", focusAreas: ["SQL"], allowFollowUps: false, createdAt: "2026-10-14T01:00:00.000Z" } };
    boundaries.get.mockResolvedValue({ id: 77, interview_state_json: JSON.stringify(prepared) });
    const { saveExecutionConversation } = await import("@/lib/agent/runtime/execution-session-service");
    await saveExecutionConversation({ userId: "user-1" }, 77, [{ id: "start-77", role: "user", content: "开始模拟面试" }]);
    const update = boundaries.update.mock.calls.at(-1)?.[2];
    expect(update?.interviewState).toBeUndefined();
    expect(JSON.parse((await boundaries.get(77, "user-1")).interview_state_json)).toEqual(prepared);
  });
});
