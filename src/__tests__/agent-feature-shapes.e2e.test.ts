import { describe, expect, it } from "vitest";
import {
  DurableAgentRunService,
  InMemoryAgentRunStore,
} from "@/lib/agent/runtime/durable-agent-run";
import type { AgentTaskType } from "@/lib/agent/task-contract";
import { TASK_CONTRACT_POLICY } from "@/lib/agent/tool-governance";

const TASK_TYPES = Object.keys(TASK_CONTRACT_POLICY) as AgentTaskType[];

describe("Agent feature shape E2E", () => {
  it.each(TASK_TYPES)("preserves a long %s input without truncating the durable turn", async (taskType) => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const longInput = `${taskType}\n${"这是用于验证长上下文持久化与读回的虚构求职材料。".repeat(1_000)}`;
    const created = await runtime.createRun(
      { userId: `long-${taskType}` },
      {
        requestId: `long-${taskType}`,
        conversationId: TASK_TYPES.indexOf(taskType) + 1,
        taskType,
        agentId: "general",
        input: { content: longInput },
      },
    );

    const pending = await runtime.listPendingInputs({ userId: `long-${taskType}` }, created.run.id);

    expect(longInput.length).toBeGreaterThan(20_000);
    expect(pending).toHaveLength(1);
    expect(pending[0].content.content).toBe(longInput);
  });

  it.each(TASK_TYPES)("keeps three continuous %s turns on one Run through final closure", async (taskType) => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const principal = { userId: `continuous-${taskType}` };
    const created = await runtime.createRun(principal, {
      requestId: `continuous-${taskType}-1`,
      conversationId: TASK_TYPES.indexOf(taskType) + 101,
      taskType,
      agentId: "general",
      input: { content: `开始 ${taskType}` },
    });

    for (const turn of [1, 2]) {
      const lease = await runtime.claimNextRun({ workerId: `worker-${taskType}-${turn}` });
      const pending = await runtime.listPendingInputs(principal, created.run.id);
      await runtime.consumeInputs({
        runId: created.run.id,
        workerId: lease!.ownerId!,
        fencingToken: lease!.fencingToken,
        inputIds: pending.map((input) => input.id),
      });
      await runtime.transitionRun({
        runId: created.run.id,
        workerId: lease!.ownerId!,
        fencingToken: lease!.fencingToken,
        nextStatus: "waiting_user",
      });
      const resumed = await runtime.submitInput(
        principal,
        created.run.id,
        `continuous-${taskType}-${turn + 1}`,
        { content: `补充第 ${turn + 1} 轮 ${taskType} 信息` },
      );
      expect(resumed.run.id).toBe(created.run.id);
      expect(resumed.run.status).toBe("queued");
    }

    const finalLease = await runtime.claimNextRun({ workerId: `worker-${taskType}-final` });
    const finalPending = await runtime.listPendingInputs(principal, created.run.id);
    await runtime.consumeInputs({
      runId: created.run.id,
      workerId: finalLease!.ownerId!,
      fencingToken: finalLease!.fencingToken,
      inputIds: finalPending.map((input) => input.id),
    });
    await runtime.transitionRun({
      runId: created.run.id,
      workerId: finalLease!.ownerId!,
      fencingToken: finalLease!.fencingToken,
      nextStatus: "verifying",
    });
    const completed = await runtime.transitionRun({
      runId: created.run.id,
      workerId: finalLease!.ownerId!,
      fencingToken: finalLease!.fencingToken,
      nextStatus: "succeeded",
    });

    expect(completed).toMatchObject({ id: created.run.id, taskType, status: "succeeded" });
    await expect(runtime.submitInput(
      principal,
      created.run.id,
      `continuous-${taskType}-after-terminal`,
      { content: "终态后不应再接受输入" },
    )).rejects.toThrow("Terminal Agent Run cannot accept input");
  });
});
