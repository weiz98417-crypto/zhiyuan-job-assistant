import { describe, expect, it, vi } from "vitest";
import {
  DurableAgentRunService,
  InMemoryAgentRunStore,
} from "@/lib/agent/runtime/durable-agent-run";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";
import { projectDurableUiEvent } from "@/lib/agent/runtime/run-event-projection";
import { createAgentTaskContract } from "@/lib/agent/task-contract";

const resolveIntentEnvelope = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agent/intent-envelope", () => ({
  resolveIntentEnvelope,
}));

describe("agent runtime protocol regressions", () => {
  it("applies a confident envelope redirect to execution and records the switch", async () => {
    resolveIntentEnvelope.mockResolvedValue({
      kind: "resolved",
      source: "llm",
      envelope: {
        primaryTask: "resume_query",
        confidence: "high",
        constraints: {
          writePolicy: "forbidden",
          noProfileWrite: true,
          noResumeWrite: true,
          noReferenceResumeWrite: true,
        },
        referencedMaterials: [],
        audit: ["llm:resume_query"],
      },
    });

    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    await runtime.createRun(
      { userId: "protocol-user" },
      {
        requestId: "protocol-request",
        conversationId: 11,
        taskType: "general_chat",
        agentId: "general",
        input: { content: "请读取我的简历" },
        contract: createAgentTaskContract({ taskType: "general_chat", target: "请读取我的简历" }),
      },
    );
    const run = await runtime.claimNextRun({ workerId: "protocol-worker" });
    const agentIds: string[] = [];
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async () => undefined,
      orchestrate: async function* (input) {
        agentIds.push(input.agentId);
        yield { type: "text", content: "简历读取结果" };
        yield { type: "done" };
      },
    });

    await engine.execute({
      run: run!,
      checkpoint: null,
      signal: new AbortController().signal,
    });

    expect(agentIds).toEqual(["resume"]);
    const events = await runtime.listEvents({ userId: "protocol-user" }, run!.id, 0);
    const uiEvents = events
      .map((event) => (event.payload as { event?: Record<string, unknown> }).event)
      .filter((event): event is Record<string, unknown> => Boolean(event));
    expect(uiEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "intent", agentId: "resume" }),
      expect.objectContaining({ type: "agent_switch", agentId: "resume" }),
    ]));
  });

  it("preserves safe fields for the new event dialect", () => {
    expect(projectDurableUiEvent({
      type: "step.started",
      step: "understanding",
      criteriaDone: 1,
      criteriaTotal: 3,
    })).toEqual({
      type: "step.started",
      step: "understanding",
      criteriaDone: 1,
      criteriaTotal: 3,
    });

    expect(projectDurableUiEvent({
      type: "subagent.finished",
      delegationId: "delegation-1",
      agentId: "evaluate",
      findings: "结论",
      keyPoints: ["证据"],
    })).toEqual({
      type: "subagent.finished",
      delegationId: "delegation-1",
      agentId: "evaluate",
      findings: "结论",
      keyPoints: ["证据"],
    });

    expect(projectDurableUiEvent({
      type: "intent",
      agentId: "resume",
      modelTier: "fast",
      audit: "llm:resume_query",
      clarify: false,
    })).toEqual({
      type: "intent",
      agentId: "resume",
      modelTier: "fast",
      audit: "llm:resume_query",
      clarify: false,
    });
  });
});
