import { describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "@/types";
import {
  DurableAgentRunService,
  InMemoryAgentRunStore,
} from "@/lib/agent/runtime/durable-agent-run";
import { DurableOrchestratorExecutionEngine } from "@/lib/agent/runtime/durable-orchestrator-engine";
import {
  projectAgentMessages,
  projectToolResultForUser,
} from "@/lib/agent/surface-projection";
import {
  respondDurableAgentRunGateClient,
} from "@/lib/agent/runtime/durable-run-client";

describe("resume approval regressions", () => {
  it("finishes the waiting-user checkpoint after opening a persistent approval gate", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    await runtime.createRun(
      { userId: "user-approval" },
      {
        requestId: "request-approval",
        conversationId: 77,
        taskType: "resume_edit",
        agentId: "resume",
        input: { content: "应用简历修改提案 proposal-1" },
      },
    );
    const run = await runtime.claimNextRun({ workerId: "worker-approval" });
    const engine = new DurableOrchestratorExecutionEngine({
      runtime,
      loadConversation: async () => [],
      saveConversation: async () => undefined,
      orchestrate: async function* () {
        const gate = await runtime.openGate({
          runId: run!.id,
          workerId: "worker-approval",
          fencingToken: run!.fencingToken,
          toolName: "apply_resume_edit_proposal",
          risk: "high",
          scopeHash: "scope-proposal-1",
          request: {
            toolName: "apply_resume_edit_proposal",
            userVisibleName: "应用简历修改",
            args: { proposalId: "proposal-1" },
          },
        });
        yield {
          type: "tool_result",
          name: "apply_resume_edit_proposal",
          success: false,
          result: "需要用户确认",
          uiPayload: {
            type: "run_gate",
            gateId: gate.id,
            runId: run!.id,
            toolName: gate.toolName,
            risk: gate.risk,
            scopeHash: gate.scopeHash,
            status: gate.status,
            request: gate.request,
          },
        };
        yield { type: "run_directive", directive: "wait_user" };
        yield { type: "done" };
      },
    });

    await expect(engine.execute({
      run: run!,
      checkpoint: null,
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ outcome: "waiting_user" });

    const checkpoint = await runtime.getLatestCheckpoint({ userId: "user-approval" }, run!.id);
    expect(checkpoint?.boundary).toBe("after_model");
  });

  it("projects a pending Run Gate as a user-operable approval card", () => {
    const view = projectToolResultForUser({
      toolName: "apply_resume_edit_proposal",
      success: false,
      uiPayload: {
        type: "run_gate",
        gateId: "gate-1",
        runId: "run-1",
        toolName: "apply_resume_edit_proposal",
        risk: "high",
        status: "pending",
        request: {
          userVisibleName: "应用简历修改",
          args: { proposalId: "proposal-1" },
        },
      },
    });

    expect(view).toMatchObject({
      kind: "card",
      uiPayload: {
        type: "run_gate",
        gateId: "gate-1",
        runId: "run-1",
        status: "pending",
      },
    });
  });

  it("collapses repeated projections of the same resume proposal", () => {
    const proposal = {
      type: "resume_edit_proposal",
      id: "proposal-1",
      sectionId: "experience",
      status: "pending",
      proposedContent: "优化后的经历",
    };
    const messages: AgentMessage[] = [
      {
        role: "tool",
        toolName: "create_resume_edit_proposal",
        content: "已完成处理",
        toolResult: { success: true, uiPayload: proposal },
        timestamp: "2026-08-28T00:00:00.000Z",
      },
      {
        role: "tool",
        toolName: "create_resume_edit_proposal",
        content: "已完成处理",
        toolResult: { success: true, uiPayload: proposal },
        timestamp: "2026-08-28T00:00:01.000Z",
      },
    ];

    const projected = projectAgentMessages(messages);
    expect(projected).toHaveLength(1);
    expect(projected[0]?.timestamp).toBe("2026-08-28T00:00:01.000Z");
  });

  it("submits an idempotent approval decision to the persistent Gate route", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      success: true,
      data: { gate: { id: "gate-1", runId: "run-1", status: "approved" } },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const gate = await respondDurableAgentRunGateClient("gate-1", "approved", "approve-1");

    expect(gate).toMatchObject({ id: "gate-1", status: "approved" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agent/run-gates/gate-1/response",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ requestId: "approve-1", decision: "approved" }),
      }),
    );
  });
});
