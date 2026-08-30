import { describe, expect, it } from "vitest";
import {
  GovernedToolAttemptExecutor,
  InMemoryToolAttemptStore,
  type ToolAttemptRecord,
  type ToolAttemptStore,
} from "@/lib/agent/runtime/governed-tool-attempt";
import { ToolRegistry } from "@/lib/agent/tools/registry";
import {
  DurableAgentRunService,
  InMemoryAgentRunStore,
} from "@/lib/agent/runtime/durable-agent-run";

describe("Governed Tool Attempt", () => {
  it("persists an action denial without terminating the Run", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "read_profile",
      description: "Read a profile",
      category: "query",
      parameters: {},
      capability: {
        risk: "low",
        deadlineClass: "foreground_read",
        deadlineMs: 30_000,
        cancellation: "cooperative",
        idempotency: "none",
        reconciliation: "none",
        verification: "none",
        backgroundCapable: false,
        workerExecution: "server",
      },
      handler: async () => ({ success: true, data: "profile" }),
      formatResult: (result) => String(result.data),
    });
    registry.seal();
    const store = new InMemoryToolAttemptStore();
    const executor = new GovernedToolAttemptExecutor(registry, store);

    const outcome = await executor.execute({
      principal: { userId: "user-1" },
      runId: "run-1",
      workerId: "worker-1",
      fencingToken: 1,
      toolName: "read_profile",
      args: {},
      allowlist: [],
    });

    expect(outcome).toMatchObject({
      runDirective: "continue",
      attempt: { status: "denied", effectState: "not_dispatched" },
      observation: { category: "governance_denied" },
    });
    expect(await store.listRunAttempts("run-1")).toHaveLength(1);
  });

  it("keeps a policy denial inside the model loop so the Agent can choose a safe path", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "read_profile",
      description: "Read a profile",
      category: "query",
      parameters: {},
      capability: {
        risk: "low",
        deadlineClass: "foreground_read",
        deadlineMs: 30_000,
        cancellation: "cooperative",
        idempotency: "none",
        reconciliation: "none",
        verification: "none",
        backgroundCapable: false,
        workerExecution: "server",
      },
      handler: async () => ({ success: true, data: "profile" }),
      formatResult: (result) => String(result.data),
    });
    registry.seal();
    const executor = new GovernedToolAttemptExecutor(registry, new InMemoryToolAttemptStore());

    const outcome = await executor.execute({
      principal: { userId: "user-policy" },
      runId: "run-policy",
      workerId: "worker-policy",
      fencingToken: 1,
      toolName: "read_profile",
      args: {},
      allowlist: ["read_profile"],
      policyDenial: {
        success: false,
        data: { blockedBy: "tool_governance" },
        error: "当前任务不允许这个工具",
        errorCategory: "policy_denied",
        recoverable: true,
      },
    });

    expect(outcome).toMatchObject({
      runDirective: "continue",
      attempt: {
        status: "denied",
        effectState: "not_dispatched",
        result: { errorCategory: "policy_denied", recoverable: true },
      },
    });
  });

  it("does not dispatch a completed side effect twice under at-least-once delivery", async () => {
    let dispatches = 0;
    const registry = new ToolRegistry();
    registry.register({
      name: "save_profile",
      description: "Save a profile",
      category: "action",
      parameters: {},
      capability: {
        risk: "high",
        deadlineClass: "verified_write",
        deadlineMs: 60_000,
        cancellation: "after_dispatch_reconcile",
        idempotency: "request_key",
        reconciliation: "read_back",
        verification: "verified_action",
        backgroundCapable: false,
        workerExecution: "server",
      },
      handler: async () => {
        dispatches += 1;
        return { success: true, data: { saved: true } };
      },
      formatResult: (result) => JSON.stringify(result.data),
    });
    registry.seal();
    const executor = new GovernedToolAttemptExecutor(registry, new InMemoryToolAttemptStore());
    const input = {
      principal: { userId: "user-1" },
      runId: "run-1",
      workerId: "worker-1",
      fencingToken: 1,
      toolName: "save_profile",
      args: { title: "AI 产品经理" },
      allowlist: ["save_profile"],
      idempotencyKey: "run-1:save-profile:1",
    };

    const first = await executor.execute(input);
    const replay = await executor.execute(input);

    expect({ dispatches, first: first.attempt.id, replay: replay.attempt.id }).toEqual({
      dispatches: 1,
      first: first.attempt.id,
      replay: first.attempt.id,
    });
  });

  it("marks an interrupted verified write unknown and requires reconciliation", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "save_profile",
      description: "Save a profile",
      category: "action",
      parameters: {},
      capability: {
        risk: "high",
        deadlineClass: "verified_write",
        deadlineMs: 60_000,
        cancellation: "after_dispatch_reconcile",
        idempotency: "request_key",
        reconciliation: "read_back",
        verification: "verified_action",
        backgroundCapable: false,
        workerExecution: "server",
      },
      handler: async () => {
        throw new Error("connection lost after dispatch");
      },
      formatResult: (result) => JSON.stringify(result.data),
    });
    registry.seal();
    const executor = new GovernedToolAttemptExecutor(registry, new InMemoryToolAttemptStore());

    const outcome = await executor.execute({
      principal: { userId: "user-1" },
      runId: "run-1",
      workerId: "worker-1",
      fencingToken: 1,
      toolName: "save_profile",
      args: { title: "AI 产品经理" },
      allowlist: ["save_profile"],
    });

    expect(outcome).toMatchObject({
      runDirective: "recover",
      attempt: { status: "reconciling", effectState: "unknown" },
      observation: { effectState: "unknown" },
    });
  });

  it("interrupts a stalled tool at its capability deadline", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "read_profile",
      description: "Read a profile",
      category: "query",
      parameters: {},
      capability: {
        risk: "low",
        deadlineClass: "foreground_read",
        deadlineMs: 10,
        cancellation: "cooperative",
        idempotency: "none",
        reconciliation: "none",
        verification: "none",
        backgroundCapable: false,
        workerExecution: "server",
      },
      handler: async (_params, context) => new Promise((_resolve, reject) => {
        context?.signal?.addEventListener("abort", () => reject(new Error("tool deadline exceeded")), { once: true });
      }),
      formatResult: (result) => String(result.data),
    });
    registry.seal();
    const executor = new GovernedToolAttemptExecutor(registry, new InMemoryToolAttemptStore());

    const outcome = await executor.execute({
      principal: { userId: "user-1" },
      runId: "run-deadline",
      workerId: "worker-1",
      fencingToken: 1,
      toolName: "read_profile",
      args: {},
      allowlist: ["read_profile"],
    });

    expect(outcome).toMatchObject({
      runDirective: "recover",
      attempt: { status: "failed", effectState: "not_executed" },
    });
    expect(outcome.attempt.result?.error).toContain("deadline");
  });

  it("reconciles an interrupted write before replay instead of dispatching it twice", async () => {
    let dispatches = 0;
    let reconciliations = 0;
    const registry = new ToolRegistry();
    registry.register({
      name: "save_profile",
      description: "Save a profile",
      category: "action",
      parameters: {},
      capability: {
        risk: "high",
        deadlineClass: "verified_write",
        deadlineMs: 60_000,
        cancellation: "after_dispatch_reconcile",
        idempotency: "request_key",
        reconciliation: "read_back",
        verification: "verified_action",
        backgroundCapable: false,
        workerExecution: "server",
      },
      handler: async () => {
        dispatches += 1;
        return { success: true, data: { saved: true } };
      },
      reconcile: async () => {
        reconciliations += 1;
        return {
          state: "verified",
          summary: "profile write verified by read-back",
          result: {
            success: true,
            data: { saved: true, readBackVerified: true },
            errorCategory: "ok",
          },
        };
      },
      formatResult: (result) => JSON.stringify(result.data),
    });
    registry.seal();
    const interrupted: ToolAttemptRecord = {
      id: "attempt-interrupted",
      runId: "run-1",
      userId: "user-1",
      sequence: 1,
      toolName: "save_profile",
      argsHash: "args",
      idempotencyKey: "write-1",
      capability: registry.get("save_profile")!.capability!,
      status: "running",
      effectState: "unknown",
      result: null,
      observation: null,
      workerId: "worker-old",
      fencingToken: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const store: ToolAttemptStore = {
      beginAttempt: async () => ({ attempt: interrupted, replayed: true }),
      markAttemptRunning: async () => interrupted,
      finishAttempt: async (_attemptId, update) => ({ ...interrupted, ...update }),
    };

    const outcome = await new GovernedToolAttemptExecutor(registry, store).execute({
      principal: { userId: "user-1" },
      runId: "run-1",
      workerId: "worker-new",
      fencingToken: 2,
      toolName: "save_profile",
      args: { title: "AI 产品经理" },
      allowlist: ["save_profile"],
      idempotencyKey: "write-1",
    });

    expect({ dispatches, reconciliations }).toEqual({ dispatches: 0, reconciliations: 1 });
    expect(outcome).toMatchObject({
      runDirective: "continue",
      attempt: { status: "succeeded", effectState: "verified" },
      observation: null,
    });
  });

  it("keeps a replayed unknown-effect attempt in reconciliation without dispatching", async () => {
    let dispatches = 0;
    let runningTransitions = 0;
    const registry = new ToolRegistry();
    registry.register({
      name: "save_profile",
      description: "Save a profile",
      category: "action",
      parameters: {},
      capability: {
        risk: "high",
        deadlineClass: "verified_write",
        deadlineMs: 60_000,
        cancellation: "after_dispatch_reconcile",
        idempotency: "request_key",
        reconciliation: "read_back",
        verification: "verified_action",
        backgroundCapable: false,
        workerExecution: "server",
      },
      handler: async () => {
        dispatches += 1;
        return { success: true, data: { saved: true } };
      },
      formatResult: (result) => JSON.stringify(result.data),
    });
    registry.seal();
    const reconciling: ToolAttemptRecord = {
      id: "attempt-reconciling",
      runId: "run-1",
      userId: "user-1",
      sequence: 1,
      toolName: "save_profile",
      argsHash: "args",
      idempotencyKey: "write-1",
      capability: registry.get("save_profile")!.capability!,
      status: "reconciling",
      effectState: "unknown",
      result: null,
      observation: null,
      workerId: "worker-old",
      fencingToken: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const store: ToolAttemptStore = {
      beginAttempt: async () => ({ attempt: reconciling, replayed: true }),
      markAttemptRunning: async () => {
        runningTransitions += 1;
        return reconciling;
      },
      finishAttempt: async (_attemptId, update) => ({ ...reconciling, ...update }),
    };

    const outcome = await new GovernedToolAttemptExecutor(registry, store).execute({
      principal: { userId: "user-1" },
      runId: "run-1",
      workerId: "worker-new",
      fencingToken: 2,
      toolName: "save_profile",
      args: { title: "AI 产品经理" },
      allowlist: ["save_profile"],
      idempotencyKey: "write-1",
    });

    expect({ dispatches, runningTransitions }).toEqual({ dispatches: 0, runningTransitions: 0 });
    expect(outcome).toMatchObject({
      runDirective: "recover",
      attempt: { status: "reconciling", effectState: "unknown" },
      observation: { recoveryCapabilities: ["reconcile"] },
    });
  });

  it("opens an exact persistent Run Gate and resumes the same attempt after approval", async () => {
    let dispatches = 0;
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    await runtime.createRun(
      { userId: "user-gate" },
      {
        requestId: "request-gate",
        conversationId: 50,
        taskType: "resume_edit",
        agentId: "resume",
        input: { content: "应用这份简历修改" },
      },
    );
    const firstRun = await runtime.claimNextRun({ workerId: "worker-gate-a" });
    const registry = new ToolRegistry();
    registry.register({
      name: "apply_resume_edit_proposal",
      description: "Apply a resume proposal",
      category: "action",
      parameters: {},
      governance: {
        name: "apply_resume_edit_proposal",
        effect: "high_risk_write",
        allowedTaskTypes: ["resume_edit"],
        agentAllowlist: ["resume"],
        documentTypes: ["resume"],
        requiresUserConfirmation: true,
        requiresReadBack: true,
        successContract: "Apply and verify",
        userVisibleNameZh: "应用简历修改",
        conflictPriority: 90,
      },
      capability: {
        risk: "high",
        deadlineClass: "verified_write",
        deadlineMs: 60_000,
        cancellation: "after_dispatch_reconcile",
        idempotency: "request_key",
        reconciliation: "read_back",
        verification: "read_back",
        backgroundCapable: false,
        workerExecution: "server",
      },
      handler: async () => {
        dispatches += 1;
        return { success: true, data: { applied: true, readBackVerified: true } };
      },
      formatResult: (result) => JSON.stringify(result.data),
    });
    registry.seal();
    const executor = new GovernedToolAttemptExecutor(
      registry,
      new InMemoryToolAttemptStore(),
      undefined,
      runtime,
    );
    const args = { proposalId: "proposal-1" };
    const first = await executor.execute({
      principal: { userId: "user-gate" },
      runId: firstRun!.id,
      workerId: "worker-gate-a",
      fencingToken: firstRun!.fencingToken,
      toolName: "apply_resume_edit_proposal",
      args,
      allowlist: ["apply_resume_edit_proposal"],
    });
    const gateEvent = (await runtime.listEvents({ userId: "user-gate" }, firstRun!.id, 0))
      .find((event) => event.type === "run.gate_opened");

    expect(first).toMatchObject({
      runDirective: "wait_user",
      attempt: { status: "waiting_user", effectState: "not_dispatched" },
    });
    expect(dispatches).toBe(0);
    expect(gateEvent?.payload).toMatchObject({ toolName: "apply_resume_edit_proposal", risk: "high" });

    await runtime.respondGate(
      { userId: "user-gate" },
      String(gateEvent?.payload.gateId),
      "approve-gate",
      "approved",
    );
    const resumedRun = await runtime.claimNextRun({ workerId: "worker-gate-b" });
    const resumed = await executor.execute({
      principal: { userId: "user-gate" },
      runId: resumedRun!.id,
      workerId: "worker-gate-b",
      fencingToken: resumedRun!.fencingToken,
      toolName: "apply_resume_edit_proposal",
      args,
      allowlist: ["apply_resume_edit_proposal"],
    });

    expect(resumed).toMatchObject({
      runDirective: "continue",
      attempt: { status: "succeeded", effectState: "verified" },
    });
    expect(dispatches).toBe(1);
  });

  it("closes a rejected persistent Gate without waiting forever or dispatching the write", async () => {
    let dispatches = 0;
    const runtime = new DurableAgentRunService(new InMemoryAgentRunStore());
    await runtime.createRun({ userId: "user-gate-denied" }, {
      requestId: "request-gate-denied",
      conversationId: 51,
      taskType: "resume_edit",
      agentId: "resume",
      input: { content: "不要应用这份修改" },
    });
    const firstRun = await runtime.claimNextRun({ workerId: "worker-gate-denied-a" });
    const registry = new ToolRegistry();
    registry.register({
      name: "apply_resume_edit_proposal",
      description: "Apply a resume proposal",
      category: "action",
      parameters: {},
      governance: {
        name: "apply_resume_edit_proposal",
        effect: "high_risk_write",
        allowedTaskTypes: ["resume_edit"],
        agentAllowlist: ["resume"],
        documentTypes: ["resume"],
        requiresUserConfirmation: true,
        requiresReadBack: true,
        successContract: "Apply and verify",
        userVisibleNameZh: "应用简历修改",
        conflictPriority: 90,
      },
      capability: {
        risk: "high",
        deadlineClass: "verified_write",
        deadlineMs: 60_000,
        cancellation: "after_dispatch_reconcile",
        idempotency: "request_key",
        reconciliation: "read_back",
        verification: "read_back",
        backgroundCapable: false,
        workerExecution: "server",
      },
      handler: async () => {
        dispatches += 1;
        return { success: true, data: { applied: true, readBackVerified: true } };
      },
      formatResult: (result) => JSON.stringify(result.data),
    });
    registry.seal();
    const executor = new GovernedToolAttemptExecutor(registry, new InMemoryToolAttemptStore(), undefined, runtime);
    const principal = { userId: "user-gate-denied" };
    const args = { proposalId: "proposal-denied" };
    await executor.execute({
      principal,
      runId: firstRun!.id,
      workerId: firstRun!.ownerId!,
      fencingToken: firstRun!.fencingToken,
      toolName: "apply_resume_edit_proposal",
      args,
      allowlist: ["apply_resume_edit_proposal"],
    });
    const gateEvent = (await runtime.listEvents(principal, firstRun!.id, 0))
      .find((event) => event.type === "run.gate_opened");
    await runtime.respondGate(principal, String(gateEvent?.payload.gateId), "deny-gate", "denied");
    const resumedRun = await runtime.claimNextRun({ workerId: "worker-gate-denied-b" });

    const denied = await executor.execute({
      principal,
      runId: resumedRun!.id,
      workerId: resumedRun!.ownerId!,
      fencingToken: resumedRun!.fencingToken,
      toolName: "apply_resume_edit_proposal",
      args,
      allowlist: ["apply_resume_edit_proposal"],
    });

    expect(denied).toMatchObject({
      runDirective: "continue",
      attempt: { status: "denied", effectState: "not_dispatched" },
    });
    expect(dispatches).toBe(0);
  });
});
