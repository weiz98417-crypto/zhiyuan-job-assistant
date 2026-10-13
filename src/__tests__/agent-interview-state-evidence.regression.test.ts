import { describe, expect, it, vi } from "vitest";
import { DurableAgentRunService, InMemoryAgentRunStore } from "@/lib/agent/runtime/durable-agent-run";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";
import { createAgentTaskContract } from "@/lib/agent/task-contract";
import { projectDurableUiEvent } from "@/lib/agent/runtime/run-event-projection";

vi.mock("@/lib/agent/intent-envelope", () => ({
  resolveIntentEnvelope: async () => ({
    kind: "resolved", source: "llm", envelope: {
      primaryTask: "interview_coaching", confidence: "high",
      constraints: {}, referencedMaterials: [], audit: [],
    },
  }),
}));
vi.mock("@/lib/data-repositories", () => ({
  getDataRepositories: () => ({ sessions: { get: async () => undefined } }),
}));

describe("Worker interview domain-state evidence", () => {
  it.each([
    { action: "paused", status: "paused", requiresReview: false, expectedOutcome: "succeeded" },
    { action: "resumed", status: "active", requiresReview: false, expectedOutcome: "succeeded" },
    { action: "next", status: "active", requiresReview: false, expectedOutcome: "succeeded" },
    { action: "paused", status: "paused", requiresReview: true, expectedOutcome: "waiting_user" },
  ])("records $action with requiresReview=$requiresReview without a tool attempt or new-tool result", async ({ action, status, requiresReview, expectedOutcome }) => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const principal = { userId: "interview-owner" };
    const created = await runtime.createRun(principal, {
      requestId: `control-${action}`, conversationId: 42, taskType: "interview_coaching", agentId: "interview",
      input: { content: action === "paused" ? "暂停面试" : action === "resumed" ? "继续面试" : "下一题" },
      contract: createAgentTaskContract({ taskType: "interview_coaching", target: `执行本场面试 ${action}` }),
    });
    const run = await runtime.claimNextRun({ workerId: "interview-worker" });
    const engine = new DurableOrchestratorExecutionEngine({
      runtime, loadConversation: async () => [], saveConversation: async () => undefined,
      orchestrate: async function* () {
        yield {
          type: "interview_state_updated", conversationId: 42, checkpointVersion: 2,
          questionId: "q1", engineSessionId: "iv42", turnFingerprint: "receipt42",
          action, status, requiresReview, readBackVerified: true,
        };
        yield { type: "text", content: action === "paused" ? "面试已暂停，当前题目已保存。" : "继续当前题目：请介绍你的真实贡献。" };
      },
    });
    const result = await engine.execute({ run: run!, checkpoint: null, signal: new AbortController().signal });
    expect(result.outcome).toBe(expectedOutcome);
    const events = await runtime.listEvents(principal, created.run.id, 0);
    const domainEvent = events.map((event) => (event.payload as { event?: Record<string, unknown> }).event)
      .find((event) => event?.type === "interview_state_updated");
    expect(domainEvent).toMatchObject({ conversationId: 42, checkpointVersion: 2, action, status, readBackVerified: true });
    expect(events.some((event) => event.type.startsWith("tool."))).toBe(false);
    const checkpoint = await runtime.getLatestCheckpoint(principal, created.run.id);
    expect((checkpoint?.context.modelCompletion as { toolResultCount: number }).toolResultCount).toBe(0);
  });

  it.each([
    { conversationId: 99, readBackVerified: true },
    { conversationId: 42, readBackVerified: false },
  ])("rejects an unverified or foreign conversation receipt ($conversationId/$readBackVerified)", async (receipt) => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const principal = { userId: "interview-owner" };
    await runtime.createRun(principal, {
      requestId: `invalid-${receipt.conversationId}-${receipt.readBackVerified}`, conversationId: 42,
      taskType: "interview_coaching", agentId: "interview", input: { content: "暂停面试" },
      contract: createAgentTaskContract({ taskType: "interview_coaching", target: "暂停本场面试" }),
    });
    const run = await runtime.claimNextRun({ workerId: "interview-worker" });
    const engine = new DurableOrchestratorExecutionEngine({
      runtime, loadConversation: async () => [], saveConversation: async () => undefined,
      orchestrate: async function* () {
        yield {
          type: "interview_state_updated", ...receipt, checkpointVersion: 2, questionId: "q1",
          engineSessionId: "iv42", action: "paused", status: "paused",
        };
        yield { type: "text", content: "面试已暂停。" };
      },
    });
    await expect(engine.execute({ run: run!, checkpoint: null, signal: new AbortController().signal })).rejects.toThrow("Run Contract unmet");
  });

  it("projects only the state receipt and omits accidental source and raw-answer fields", () => {
    const projected = projectDurableUiEvent({
      type: "interview_state_updated", conversationId: 42, checkpointVersion: 2,
      engineSessionId: "iv42", questionId: "q1", action: "paused", status: "paused", readBackVerified: true,
      answer: "private answer", sourceBinding: { cvText: "private resume" },
    });
    expect(projected).toMatchObject({ conversationId: 42, checkpointVersion: 2, readBackVerified: true });
    expect(projected.answer).toBeUndefined();
    expect(projected.sourceBinding).toBeUndefined();
  });
});
