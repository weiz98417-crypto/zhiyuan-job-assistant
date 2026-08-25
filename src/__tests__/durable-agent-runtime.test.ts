import { describe, expect, it } from "vitest";
import {
  DurableAgentRunService,
  InMemoryAgentRunStore,
} from "@/lib/agent/runtime/durable-agent-run";
import { createToolGateScope } from "@/lib/agent/runtime/run-gate";

describe("Durable Agent Run", () => {
  it("deduplicates create commands by user and request id", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const command = {
      requestId: "request-1",
      conversationId: 42,
      taskType: "resume_edit",
      agentId: "resume",
      input: { content: "优化我的项目经历" },
      contract: { target: "项目经历" },
    };

    const first = await runtime.createRun({ userId: "user-1" }, command);
    const replay = await runtime.createRun({ userId: "user-1" }, command);

    expect(replay).toEqual({ ...first, replayed: true });
  });

  it("allows only one nonterminal Run per Conversation", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const base = {
      conversationId: 42,
      taskType: "resume_edit",
      agentId: "resume",
      input: { content: "优化我的项目经历" },
    };

    await runtime.createRun({ userId: "user-1" }, { ...base, requestId: "request-1" });

    await expect(
      runtime.createRun({ userId: "user-1" }, { ...base, requestId: "request-2" }),
    ).rejects.toThrowError("Conversation 42 already has a nonterminal Agent Run");
  });

  it("fences a stale Worker after lease takeover", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(
      { userId: "user-1" },
      {
        requestId: "request-1",
        conversationId: 42,
        taskType: "resume_edit",
        agentId: "resume",
        input: { content: "优化我的项目经历" },
      },
    );

    const firstLease = await runtime.claimNextRun({
      workerId: "worker-a",
      now: new Date("2026-08-24T00:00:00.000Z"),
      leaseMs: 30_000,
    });
    const takeover = await runtime.claimNextRun({
      workerId: "worker-b",
      now: new Date("2026-08-24T00:00:31.000Z"),
      leaseMs: 30_000,
    });

    expect(takeover?.fencingToken).toBe((firstLease?.fencingToken || 0) + 1);
    await expect(runtime.transitionRun({
      runId: created.run.id,
      workerId: "worker-a",
      fencingToken: firstLease!.fencingToken,
      nextStatus: "verifying",
    })).rejects.toThrowError("Stale Agent Run owner");
  });

  it("replays Run events after the client cursor without changing execution", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(
      { userId: "user-1" },
      {
        requestId: "request-1",
        conversationId: 42,
        taskType: "resume_query",
        agentId: "resume",
        input: { content: "读取我的简历" },
      },
    );
    const lease = await runtime.claimNextRun({ workerId: "worker-a" });
    await runtime.transitionRun({
      runId: created.run.id,
      workerId: "worker-a",
      fencingToken: lease!.fencingToken,
      nextStatus: "verifying",
    });

    const events = await runtime.listEvents(
      { userId: "user-1" },
      created.run.id,
      1,
    );

    expect(events.map((event) => [event.sequence, event.type])).toEqual([
      [2, "run.claimed"],
      [3, "run.status_changed"],
    ]);
  });

  it("restores the latest semantic checkpoint without resetting recovery budgets", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(
      { userId: "user-1" },
      {
        requestId: "request-1",
        conversationId: 42,
        taskType: "resume_query",
        agentId: "resume",
        input: { content: "读取我的简历" },
      },
    );
    const firstLease = await runtime.claimNextRun({
      workerId: "worker-a",
      now: new Date("2026-08-24T00:00:00.000Z"),
    });
    await runtime.saveCheckpoint({
      runId: created.run.id,
      workerId: "worker-a",
      fencingToken: firstLease!.fencingToken,
      boundary: "before_model",
      context: { inputCursor: 1 },
      plan: { cursor: 2 },
      budgets: { modelAttempts: 2, noProgressCycles: 1 },
      factRefs: [{ type: "resume", id: "resume-1", version: "v3" }],
    });

    await runtime.claimNextRun({
      workerId: "worker-b",
      now: new Date("2026-08-24T00:00:31.000Z"),
    });
    const checkpoint = await runtime.getLatestCheckpoint(
      { userId: "user-1" },
      created.run.id,
    );

    expect(checkpoint?.budgets).toEqual({ modelAttempts: 2, noProgressCycles: 1 });
  });

  it("records cancel intent before the Worker safely finishes cancellation", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(
      { userId: "user-1" },
      {
        requestId: "request-1",
        conversationId: 42,
        taskType: "resume_edit",
        agentId: "resume",
        input: { content: "优化我的简历" },
      },
    );

    const requested = await runtime.requestCancel(
      { userId: "user-1" },
      created.run.id,
      "cancel-request-1",
    );
    const lease = await runtime.claimNextRun({ workerId: "worker-a" });
    const cancelled = await runtime.transitionRun({
      runId: created.run.id,
      workerId: "worker-a",
      fencingToken: lease!.fencingToken,
      nextStatus: "cancelled",
    });

    expect([requested.status, cancelled.status]).toEqual(["cancel_requested", "cancelled"]);
  });

  it("scopes approval to the exact tool arguments and risk", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(
      { userId: "user-1" },
      {
        requestId: "request-1",
        conversationId: 42,
        taskType: "resume_edit",
        agentId: "resume",
        input: { content: "应用简历修改" },
      },
    );
    const lease = await runtime.claimNextRun({ workerId: "worker-a" });
    const approvedScope = createToolGateScope("apply_resume_edit_proposal", { proposalId: "p-1" }, "high");
    const changedScope = createToolGateScope("apply_resume_edit_proposal", { proposalId: "p-2" }, "high");
    const gate = await runtime.openGate({
      runId: created.run.id,
      workerId: "worker-a",
      fencingToken: lease!.fencingToken,
      toolName: "apply_resume_edit_proposal",
      risk: "high",
      scopeHash: approvedScope,
      request: { proposalId: "p-1" },
    });
    await runtime.respondGate(
      { userId: "user-1" },
      gate.id,
      "gate-response-1",
      "approved",
    );

    expect(await runtime.isGateApproved(
      { userId: "user-1" },
      created.run.id,
      approvedScope,
    )).toBe(true);
    expect(await runtime.isGateApproved(
      { userId: "user-1" },
      created.run.id,
      changedScope,
    )).toBe(false);
  });

  it("allows the Gate-opening Worker to append final evidence after ownership is released", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(
      { userId: "user-gate-evidence" },
      {
        requestId: "request-gate-evidence",
        conversationId: 45,
        taskType: "resume_edit",
        agentId: "resume",
        input: { content: "应用修改" },
      },
    );
    const lease = await runtime.claimNextRun({ workerId: "worker-gate-evidence" });
    await runtime.openGate({
      runId: created.run.id,
      workerId: "worker-gate-evidence",
      fencingToken: lease!.fencingToken,
      toolName: "apply_resume_edit_proposal",
      risk: "high",
      scopeHash: "scope-evidence",
      request: { proposalId: "proposal-1" },
    });

    const event = await runtime.recordEvent({
      runId: created.run.id,
      workerId: "worker-gate-evidence",
      fencingToken: lease!.fencingToken,
      type: "run.ui_event",
      payload: { event: { type: "run_gate" } },
    });

    expect(event.type).toBe("run.ui_event");
  });

  it("resumes the same waiting Run when durable user input arrives", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const created = await runtime.createRun(
      { userId: "user-1" },
      {
        requestId: "request-1",
        conversationId: 42,
        taskType: "resume_edit",
        agentId: "resume",
        input: { content: "优化我的简历" },
      },
    );
    const lease = await runtime.claimNextRun({ workerId: "worker-a" });
    await runtime.transitionRun({
      runId: created.run.id,
      workerId: "worker-a",
      fencingToken: lease!.fencingToken,
      nextStatus: "waiting_user",
    });

    const resumed = await runtime.submitInput(
      { userId: "user-1" },
      created.run.id,
      "input-request-2",
      { content: "只优化项目经历" },
    );

    expect({ id: resumed.run.id, status: resumed.run.status, replayed: resumed.replayed }).toEqual({
      id: created.run.id,
      status: "queued",
      replayed: false,
    });
  });

  it("extends the lease with a fenced heartbeat before takeover", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    await runtime.createRun(
      { userId: "user-1" },
      {
        requestId: "request-1",
        conversationId: 42,
        taskType: "resume_query",
        agentId: "resume",
        input: { content: "读取我的简历" },
      },
    );
    const lease = await runtime.claimNextRun({
      workerId: "worker-a",
      now: new Date("2026-08-24T00:00:00.000Z"),
      leaseMs: 30_000,
    });
    await runtime.heartbeat({
      runId: lease!.id,
      workerId: "worker-a",
      fencingToken: lease!.fencingToken,
      now: new Date("2026-08-24T00:00:20.000Z"),
      leaseMs: 30_000,
    });

    const earlyTakeover = await runtime.claimNextRun({
      workerId: "worker-b",
      now: new Date("2026-08-24T00:00:31.000Z"),
    });
    const expiredTakeover = await runtime.claimNextRun({
      workerId: "worker-b",
      now: new Date("2026-08-24T00:00:51.000Z"),
    });

    expect([earlyTakeover, expiredTakeover?.ownerId]).toEqual([null, "worker-b"]);
  });

  it("bounds active child Runs and propagates parent cancellation", async () => {
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    const parent = await runtime.createRun(
      { userId: "user-parent" },
      {
        requestId: "parent-request",
        conversationId: 100,
        taskType: "resume_query",
        agentId: "resume",
        input: { content: "读取我的简历" },
      },
    );
    const children = [];
    for (let index = 0; index < 4; index += 1) {
      children.push(await runtime.createRun(
        { userId: "user-parent" },
        {
          requestId: `child-request-${index}`,
          conversationId: 101 + index,
          taskType: "resume_query",
          agentId: "resume",
          input: { content: `处理子任务 ${index}` },
          parentRunId: parent.run.id,
        },
      ));
    }

    await expect(runtime.createRun(
      { userId: "user-parent" },
      {
        requestId: "child-request-5",
        conversationId: 110,
        taskType: "resume_query",
        agentId: "resume",
        input: { content: "处理额外子任务" },
        parentRunId: parent.run.id,
      },
    )).rejects.toThrow("active child");

    await runtime.requestCancel({ userId: "user-parent" }, parent.run.id, "cancel-parent");
    const childSnapshots = await Promise.all(children.map((child) => (
      runtime.getRun({ userId: "user-parent" }, child.run.id)
    )));

    expect(childSnapshots.map((child) => child?.status)).toEqual([
      "cancel_requested",
      "cancel_requested",
      "cancel_requested",
      "cancel_requested",
    ]);
  });
});
