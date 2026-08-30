import { describe, expect, it } from "vitest";
import {
  AGENT_E2E_FLOW_IDS,
  AGENT_E2E_MATRIX,
  AGENT_E2E_REGRESSION_FILES,
  AGENT_E2E_TASK_TYPES,
} from "@/lib/agent/agent-e2e-matrix";
import {
  DurableAgentRunService,
  InMemoryAgentRunStore,
} from "@/lib/agent/runtime/durable-agent-run";

describe("Agent E2E scenario matrix", () => {
  it("keeps every registered Agent task and every required lifecycle flow in the permanent suite", () => {
    expect(AGENT_E2E_MATRIX.map((scenario) => scenario.taskType)).toEqual([...AGENT_E2E_TASK_TYPES]);
    for (const scenario of AGENT_E2E_MATRIX) {
      expect(scenario.flowIds).toEqual([...AGENT_E2E_FLOW_IDS]);
    }
    expect(AGENT_E2E_REGRESSION_FILES).toEqual(expect.arrayContaining([
      "src/__tests__/agent-resume-approval.regression-2.test.ts",
      "src/__tests__/agent-artifact-card-ui.regression-1.test.ts",
      "src/__tests__/agent-activity-track-size.regression-1.test.ts",
      "src/__tests__/agent-e2e-suite-coverage.regression-1.test.ts",
      "src/__tests__/agent-live-session-readback.regression-1.test.ts",
      "src/__tests__/agent-production-chain-regressions.eval.test.ts",
      "src/__tests__/interview-jd-selection.regression-1.test.ts",
      "src/__tests__/durable-run-client.test.ts",
    ]));
  });

  it.each(AGENT_E2E_TASK_TYPES)("closes short, long, continuous, pause/resume and cancel paths for %s", async (taskType) => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const principal = { userId: `matrix-${taskType}` };
    const conversationId = AGENT_E2E_TASK_TYPES.indexOf(taskType) + 500;
    const created = await runtime.createRun(principal, {
      requestId: `matrix-short-${taskType}`,
      conversationId,
      taskType,
      agentId: "general",
      input: { content: `短输入 ${taskType}` },
    });
    const pending = await runtime.listPendingInputs(principal, created.run.id);
    expect(pending[0]?.content.content).toBe(`短输入 ${taskType}`);
    const lease = await runtime.claimNextRun({ workerId: `matrix-worker-${taskType}` });
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
    const followUp = await runtime.submitInput(principal, created.run.id, `matrix-follow-up-${taskType}`, {
      content: `连续补充 ${taskType}`,
    });
    expect(followUp.run.status).toBe("queued");
    const resumedLease = await runtime.claimNextRun({ workerId: `matrix-resumed-worker-${taskType}` });
    const resumedInputs = await runtime.listPendingInputs(principal, created.run.id);
    await runtime.consumeInputs({
      runId: created.run.id,
      workerId: resumedLease!.ownerId!,
      fencingToken: resumedLease!.fencingToken,
      inputIds: resumedInputs.map((input) => input.id),
    });
    await runtime.transitionRun({
      runId: created.run.id,
      workerId: resumedLease!.ownerId!,
      fencingToken: resumedLease!.fencingToken,
      nextStatus: "verifying",
    });
    const completed = await runtime.transitionRun({
      runId: created.run.id,
      workerId: resumedLease!.ownerId!,
      fencingToken: resumedLease!.fencingToken,
      nextStatus: "succeeded",
    });
    expect(completed.status).toBe("succeeded");

    const longRuntime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const longRun = await longRuntime.createRun(principal, {
      requestId: `matrix-long-${taskType}`,
      conversationId: conversationId + 1000,
      taskType,
      agentId: "general",
      input: { content: `长输入 ${"求职材料".repeat(5_000)}` },
    });
    expect((await longRuntime.listPendingInputs(principal, longRun.run.id))[0]?.content.content.length).toBeGreaterThan(20_000);

    const paused = await runtime.createRun(principal, {
      requestId: `matrix-paused-${taskType}`,
      conversationId: conversationId + 2000,
      taskType,
      agentId: "general",
      input: { content: "暂停恢复" },
    });
    const pausedLease = await runtime.claimNextRun({ workerId: `matrix-pause-worker-${taskType}` });
    expect((await runtime.requestPause(principal, paused.run.id, "matrix-pause" )).status).toBe("paused");
    expect((await runtime.resumeRun(principal, paused.run.id, "matrix-resume")).status).toBe("queued");
    const cancelRun = await runtime.createRun(principal, {
      requestId: `matrix-cancel-${taskType}`,
      conversationId: conversationId + 3000,
      taskType,
      agentId: "general",
      input: { content: "取消" },
    });
    expect((await runtime.requestCancel(principal, cancelRun.run.id, "matrix-cancel-request")).status).toBe("cancel_requested");
    expect(pausedLease?.id).toBe(paused.run.id);
  });
});
