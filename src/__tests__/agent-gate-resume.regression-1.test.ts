import { describe, expect, it } from "vitest";
import {
  DurableAgentRunService,
  InMemoryAgentRunStore,
} from "@/lib/agent/runtime/durable-agent-run";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";
import { AgentWorker } from "@/lib/agent/runtime/agent-worker";
import { createAgentTaskContract } from "@/lib/agent/task-contract";

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

  it("keeps a gate wait directive authoritative over its tool denial so approval resumes the same Run", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(
      { userId: "user-scan-gate" },
      {
        requestId: "request-scan-gate",
        conversationId: 100,
        taskType: "job_search",
        agentId: "general",
        input: { content: "开始岗位发现" },
        contract: createAgentTaskContract({ taskType: "job_search", target: "开始岗位发现" }),
      },
    );
    let gateId = "";
    let orchestrateCalls = 0;
    let resumedFrozenCall: { name: string; args: Record<string, unknown> } | undefined;
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
            ? [{
                gateId,
                toolName: "scan_portals",
                status: "approved",
                scopeHash: "scan-scope",
                request: { toolName: "scan_portals", args: { confirmed: true } },
              }]
            : [],
        }),
      },
      orchestrate: async function* ({ runId, workerId, fencingToken, frozenToolCall }) {
        orchestrateCalls += 1;
        if (orchestrateCalls === 1) {
          const gate = await runtime.openGate({
            runId,
            workerId,
            fencingToken,
            toolName: "scan_portals",
            risk: "high",
            scopeHash: "scan-scope",
            request: { toolName: "scan_portals", args: { confirmed: true } },
          });
          gateId = gate.id;
          yield { type: "run_directive", directive: "wait_user", reason: "等待岗位发现批准" };
          yield {
            type: "tool_result",
            name: "scan_portals",
            success: false,
            result: "该动作需要用户确认后才能执行",
            data: { gateId: gate.id },
            uiPayload: { type: "run_gate", gateId: gate.id, status: "pending", request: gate.request },
          };
          yield {
            type: "tool_error",
            name: "scan_portals",
            error: "该动作需要用户确认后才能执行",
            recoverable: false,
            category: "need_user_input",
          };
          yield { type: "done" };
          return;
        }
        resumedFrozenCall = frozenToolCall;
        yield {
          type: "tool_result",
          name: "scan_portals",
          success: true,
          data: { scanId: "scan-1", readBackVerified: true },
          uiPayload: { type: "job_discovery_run", scanId: "scan-1", status: "queued", readBackVerified: true },
        };
        yield { type: "text", content: "岗位发现已开始。" };
        yield { type: "done" };
      },
    });
    const worker = new AgentWorker({ workerId: "worker-scan-gate", runtime, engine });

    expect((await worker.runOnce())?.status).toBe("waiting_user");
    expect((await runtime.getRun({ userId: "user-scan-gate" }, created.run.id))?.status).toBe("waiting_user");

    await runtime.respondGate({ userId: "user-scan-gate" }, gateId, "approve-scan-gate", "approved");
    expect((await worker.runOnce())?.status).toBe("succeeded");
    expect(orchestrateCalls).toBe(2);
    expect(resumedFrozenCall).toEqual({ name: "scan_portals", args: { confirmed: true } });
  });
});
