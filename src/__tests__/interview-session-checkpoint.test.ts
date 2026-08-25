import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({
  assembleAgentMemoryContext: vi.fn(),
  llmRetry: vi.fn(),
  sessions: {
    create: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/agent/memory-context", () => ({
  assembleAgentMemoryContext: boundaries.assembleAgentMemoryContext,
}));
vi.mock("@/lib/llm-retry", () => ({ llmRetry: boundaries.llmRetry }));
vi.mock("@/lib/data-repositories", () => ({
  getDataRepositories: () => ({ sessions: boundaries.sessions }),
}));

import { handleInterviewSessionTurnForAgent } from "@/lib/server/interview-analysis-service";

describe("durable interview session checkpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let storedRow: Record<string, unknown> | undefined;
    boundaries.assembleAgentMemoryContext.mockResolvedValue({ llmSummary: "候选人的长期记忆" });
    boundaries.llmRetry.mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        questions: [{ category: "technical", question: "请介绍最相关的 Agent 项目。", source: "jd" }],
      }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    boundaries.sessions.list.mockResolvedValue([]);
    boundaries.sessions.create.mockImplementation(async (input: Record<string, unknown>) => {
      storedRow = {
        id: 42,
        title: input.title,
        messages_json: input.messages,
        interview_state_json: input.interviewState,
        agent_state_json: input.agentState,
      };
      return 42;
    });
    boundaries.sessions.get.mockImplementation(async () => storedRow);
    boundaries.sessions.update.mockImplementation(async (_id: number, _userId: string, updates: Record<string, unknown>) => {
      if (!storedRow) return false;
      storedRow = {
        ...storedRow,
        messages_json: updates.messages ?? storedRow.messages_json,
        interview_state_json: updates.interviewState ?? storedRow.interview_state_json,
        agent_state_json: updates.agentState ?? storedRow.agent_state_json,
      };
      return true;
    });
  });

  it("read-back verifies every turn and recovers a repeated request", async () => {
    const principal = { userId: "user-1" };
    const started = await handleInterviewSessionTurnForAgent(principal, {
      company: "甲公司",
      role: "AI 产品经理",
    });
    const followedUp = await handleInterviewSessionTurnForAgent(principal, {
      sessionId: started.sessionId,
      answer: "我负责过 Agent 项目。",
    });
    const recovered = await handleInterviewSessionTurnForAgent(principal, {
      sessionId: started.sessionId,
      answer: "我负责过 Agent 项目。",
    });

    expect(started).toMatchObject({ sessionId: "42", readBackVerified: true });
    expect(followedUp).toMatchObject({ action: "followup", readBackVerified: true });
    expect(recovered).toMatchObject({ action: "followup", readBackVerified: true, recovered: true });
    expect(boundaries.sessions.update).toHaveBeenCalledTimes(1);
  });
});
