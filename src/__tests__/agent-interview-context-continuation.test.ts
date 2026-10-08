import { afterEach, describe, expect, it, vi } from "vitest";
import { DurableAgentRunService, InMemoryAgentRunStore } from "@/lib/agent/runtime/durable-agent-run";
import { DurableOrchestratorExecutionEngine, type DurableOrchestratorExecutionEngineOptions } from "@/lib/agent/runtime/durable-orchestrator-engine";
import { createAgentTaskContract } from "@/lib/agent/task-contract";
import { buildInterviewPlanSnapshot, createInterviewState, updateInterviewStateWithAssistantMessage } from "@/lib/agent/interview-session-state";

const mocks = vi.hoisted(() => ({ complete: vi.fn(), getSession: vi.fn() }));
vi.mock("@/lib/ai/model-gateway", () => ({ complete: mocks.complete, getThinkModelChain: () => [] }));
vi.mock("@/lib/data-repositories", () => ({ getDataRepositories: () => ({ sessions: { get: mocks.getSession } }) }));

afterEach(() => vi.clearAllMocks());

describe("worker interview context continuation", () => {
  it.each([
    { answer: "我不知道", recoverClarification: false },
    { answer: "我负责需求分析，上线后客服自动解决率提升了20%", recoverClarification: false },
    { answer: "我不知道", recoverClarification: true },
  ])("routes $answer using the persisted question (recover clarification: $recoverClarification)", async ({ answer, recoverClarification }) => {
    const question = "请介绍一个你主导的 AI 产品，如何验证业务价值？";
    const snapshot = buildInterviewPlanSnapshot({ resumeText: "负责 AI 内容生产与客服提效。" });
    const interviewState = updateInterviewStateWithAssistantMessage(createInterviewState(snapshot), { role: "assistant", content: question, timestamp: "2026-10-07T12:00:00.000Z" });
    mocks.getSession.mockResolvedValue({ interview_state_json: JSON.stringify(interviewState) });
    mocks.complete.mockImplementation(async (request) => {
      const context = JSON.stringify(request.messages);
      return { text: JSON.stringify({ primaryTask: context.includes(question) && context.includes("interview_coaching") ? "interview_coaching" : "general_chat", confidence: context.includes(question) ? "high" : "low" }), modelUsed: "test" };
    });
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    await runtime.createRun({ userId: "user-context" }, {
      requestId: "request-context", conversationId: 77, taskType: recoverClarification ? "general_chat" : "interview_coaching", agentId: recoverClarification ? "general" : "interview",
      input: { content: answer }, contract: { ...createAgentTaskContract({ taskType: recoverClarification ? "general_chat" : "interview_coaching", target: "继续当前面试" }), successCriteria: [recoverClarification ? "clarification question asked" : "one question generated"] },
    });
    const run = await runtime.claimNextRun({ workerId: "worker-context" });
    const orchestrate = vi.fn<NonNullable<DurableOrchestratorExecutionEngineOptions["orchestrate"]>>(async function* () {
      yield { type: "tool_result", name: "start_interview_session", success: true, result: "当前面试状态已读回", data: { sessionId: "77", readBackVerified: true, question } };
      yield { type: "text", content: "我们沿着这道题，先说你负责的具体部分。" };
    });
    const engine = new DurableOrchestratorExecutionEngine({ runtime, loadConversation: async () => [{ role: "assistant", content: question }], saveConversation: async () => undefined, orchestrate });
    const result = await engine.execute({ run: run!, checkpoint: null, signal: new AbortController().signal });
    expect(orchestrate).toHaveBeenCalledTimes(1);
    expect(orchestrate.mock.calls[0][0]).toMatchObject({ content: answer, agentId: "interview", taskContract: { taskType: "interview_coaching" } });
    expect(orchestrate.mock.calls[0][0].promptContextInjection).toContain(question);
    expect(JSON.stringify(mocks.complete.mock.calls[0][0].messages)).toContain("interview_coaching");
    expect(JSON.stringify(mocks.complete.mock.calls[0][0].messages)).toContain(question);
    expect(result.outcome).toBe("succeeded");
  });
});
