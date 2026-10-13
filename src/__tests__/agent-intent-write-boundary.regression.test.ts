import { describe, expect, it, vi } from "vitest";
import { admitAgentRun } from "@/lib/agent/run-admission";
import { evaluateToolGovernance } from "@/lib/agent/tool-governance";
import * as intentEnvelope from "@/lib/agent/intent-envelope";
import { DurableAgentRunService, InMemoryAgentRunStore } from "@/lib/agent/runtime/durable-agent-run";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";
import { createAgentTaskContract } from "@/lib/agent/task-contract";

describe("AgentChat explicit write restrictions", () => {
  it("keeps Offer fact整理 read-only even when the resolved task normally writes reports", () => {
    const admission = admitAgentRun({
      conversationId: 12,
      input: { content: "仅整理这份 Offer 的录用事实，不要保存报告或更新投递。" },
      envelope: {
        kind: "resolved",
        source: "llm",
        envelope: {
          primaryTask: "offer_evaluation",
          constraints: {
            writePolicy: "forbidden",
            noProfileWrite: true,
            noResumeWrite: true,
            noReferenceResumeWrite: true,
          },
          referencedMaterials: [{ kind: "offer", reference: "explicit" }],
          confidence: "high",
          audit: ["user.read_only"],
        },
      },
    });

    expect(admission.taskType).toBe("offer_evaluation");
    expect(evaluateToolGovernance({
      toolName: "evaluate_offer",
      taskContract: admission.contract,
      agentId: "offer",
    })).toMatchObject({ allowed: false });
    expect(admission.contract?.routing?.allowedTools).toContain("read_offer_report");
    expect(admission.contract?.routing?.allowedTools).not.toContain("evaluate_offer");
  });

  it("retains a resolved read-only goal and restrictions after a short continuation and worker restart", async () => {
    const principal = { userId: "read-only-owner" };
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(principal, {
      requestId: "read-only-start",
      conversationId: 13,
      taskType: "general_chat",
      agentId: "general",
      input: { content: "只整理这个录用事实，不要保存报告。" },
      contract: createAgentTaskContract({ taskType: "general_chat", target: "只整理这个录用事实，不要保存报告。" }),
    });
    const resolveEnvelope = vi.spyOn(intentEnvelope, "resolveIntentEnvelope");
    const envelope = {
      primaryTask: "offer_evaluation" as const,
      referencedMaterials: [],
      confidence: "high" as const,
      audit: ["offer-context"],
    };
    resolveEnvelope.mockResolvedValueOnce({
      kind: "resolved",
      source: "llm",
      envelope: {
        ...envelope,
        constraints: { writePolicy: "forbidden", noProfileWrite: false, noResumeWrite: false, noReferenceResumeWrite: false },
      },
    }).mockResolvedValueOnce({
      kind: "resolved",
      source: "llm",
      envelope: {
        ...envelope,
        constraints: { writePolicy: "allowed", noProfileWrite: false, noResumeWrite: false, noReferenceResumeWrite: false },
      },
    });
    const observed: Array<{ taskType: string | undefined; agentId: string; writeAllowed: boolean }> = [];
    const createEngine = () => new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async () => undefined,
      orchestrate: async function* (input) {
        observed.push({
          taskType: input.taskContract?.taskType,
          agentId: input.agentId,
          writeAllowed: evaluateToolGovernance({ toolName: "evaluate_offer", taskContract: input.taskContract, agentId: input.agentId }).allowed,
        });
        yield { type: "run_directive", directive: "wait_user" };
        yield { type: "text", content: "请确认录用日期。" };
      },
    });
    try {
      const firstRun = await runtime.claimNextRun({ workerId: "read-only-worker-1" });
      await createEngine().execute({ run: firstRun!, checkpoint: null, signal: new AbortController().signal });
      await runtime.transitionRun({
        runId: created.run.id, workerId: "read-only-worker-1", fencingToken: firstRun!.fencingToken, nextStatus: "waiting_user",
      });
      await runtime.submitInput(principal, created.run.id, "read-only-confirm", { content: "下周一" });
      const resumedRun = await runtime.claimNextRun({ workerId: "read-only-worker-2" });
      await createEngine().execute({
        run: resumedRun!, checkpoint: await runtime.getLatestCheckpoint(principal, created.run.id), signal: new AbortController().signal,
      });
      expect(observed).toEqual([
        { taskType: "offer_evaluation", agentId: "offer", writeAllowed: false },
        { taskType: "offer_evaluation", agentId: "offer", writeAllowed: false },
      ]);
    } finally {
      resolveEnvelope.mockRestore();
    }
  });
});
