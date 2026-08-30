import { describe, expect, it } from "vitest";
import {
  DurableAgentRunService,
  InMemoryAgentRunStore,
} from "@/lib/agent/runtime/durable-agent-run";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";

describe("resolved Agent Gate resume regression", () => {
  it("starts a new model cycle after a waiting-user completion is approved", async () => {
    // Regression: ISSUE-RUN-GATE-001 — approving a Gate replayed the old waiting_user completion
    // Found by /qa on 2026-08-28
    // Report: .gstack/qa-reports/qa-report-121-43-198-13-2026-08-28.md
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    await runtime.createRun(
      { userId: "user-gate-resume" },
      {
        requestId: "request-gate-resume",
        conversationId: 99,
        taskType: "general_chat",
        agentId: "general",
        input: { content: "执行需要确认的动作" },
      },
    );
    const firstRun = await runtime.claimNextRun({ workerId: "worker-gate-resume" });
    let gateId = "";
    let orchestrateCalls = 0;
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async () => undefined,
      contextSource: {
        load: async () => ({
          completedToolFacts: [],
          recoveryObservations: [],
          evidence: [],
          factRefs: [],
          gates: gateId
            ? [{ toolName: "apply_resume_edit_proposal", status: "approved", scopeHash: "scope-1" }]
            : [],
        }),
      },
      orchestrate: async function* ({ runId, workerId, fencingToken }) {
        orchestrateCalls += 1;
        if (orchestrateCalls === 1) {
          const gate = await runtime.openGate({
            runId,
            workerId,
            fencingToken,
            toolName: "apply_resume_edit_proposal",
            risk: "high",
            scopeHash: "scope-1",
            request: { toolName: "apply_resume_edit_proposal", args: { proposalId: "proposal-1" } },
          });
          gateId = gate.id;
          yield {
            type: "tool_result",
            name: "apply_resume_edit_proposal",
            success: false,
            result: "等待确认",
            uiPayload: { type: "run_gate", gateId: gate.id, status: "pending" },
          };
          yield { type: "run_directive", directive: "wait_user" };
          return;
        }
        yield { type: "text", content: "动作已完成并回读校验。" };
      },
    });

    const firstResult = await engine.execute({
      run: firstRun!,
      checkpoint: null,
      signal: new AbortController().signal,
    });
    expect(firstResult.outcome).toBe("waiting_user");
    const checkpoint = await runtime.getLatestCheckpoint({ userId: "user-gate-resume" }, firstRun!.id);
    await runtime.respondGate({ userId: "user-gate-resume" }, gateId, "gate-request-1", "approved");
    const resumedRun = await runtime.claimNextRun({ workerId: "worker-gate-resume" });

    const resumedResult = await engine.execute({
      run: resumedRun!,
      checkpoint,
      signal: new AbortController().signal,
    });

    expect(resumedResult.outcome).toBe("succeeded");
    expect(orchestrateCalls).toBe(2);
  });
});
