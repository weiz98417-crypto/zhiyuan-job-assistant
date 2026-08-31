import { afterEach, describe, expect, it, vi } from "vitest";

const TEST_USER = {
  userId: "user-durable-run",
  username: "durable-user",
  role: "member",
  tokenVersion: 0,
};

function mockAuth() {
  vi.doMock("@/lib/auth", () => ({
    getCurrentUser: async () => TEST_USER,
  }));
}

function mockRuntime() {
  const run = {
    id: "run-1",
    userId: TEST_USER.userId,
    conversationId: 12,
    requestId: "request-1",
    taskType: "resume_query",
    agentId: "resume",
    status: "queued",
    snapshotVersion: 1,
    eventCursor: 1,
    contract: {},
    budgets: {},
    runtimeMode: "worker_all",
    parentRunId: null,
    depth: 0,
    ownerId: null,
    fencingToken: 0,
    heartbeatAt: null,
    leaseExpiresAt: null,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
  };
  const runtime = {
    createRun: vi.fn(async () => ({
      run,
      replayed: false,
    })),
    listRuns: vi.fn(async () => [] as typeof run[]),
    getRun: vi.fn(async () => run),
    submitInput: vi.fn(async () => ({
      run: { ...run, status: "queued", eventCursor: 2 },
      input: {
        id: 2,
        runId: "run-1",
        userId: TEST_USER.userId,
        requestId: "input-1",
        inputType: "turn",
        content: { content: "补充：目标是后端岗位" },
        status: "pending",
        createdAt: "2026-08-24T00:01:00.000Z",
        consumedAt: null,
      },
      replayed: false,
    })),
    requestCancel: vi.fn(async () => ({ ...run, status: "cancel_requested", eventCursor: 2 })),
    listEvents: vi.fn(async () => ([{
      runId: "run-1",
      userId: TEST_USER.userId,
      sequence: 4,
      type: "run.ui_event",
      schemaVersion: 1,
      payload: { event: { type: "text", content: "已恢复" } },
      createdAt: "2026-08-24T00:02:00.000Z",
    }])),
    respondGate: vi.fn(async () => ({
      id: "gate-1",
      runId: "run-1",
      userId: TEST_USER.userId,
      toolName: "save_resume_section",
      risk: "high",
      scopeHash: "scope-1",
      status: "approved",
      request: { sectionId: "skills" },
      response: { decision: "approved" },
      createdAt: "2026-08-24T00:02:00.000Z",
      resolvedAt: "2026-08-24T00:03:00.000Z",
    })),
  };
  vi.doMock("@/lib/agent/runtime/runtime-factory", () => ({
    getDurableAgentRuntime: () => runtime,
    isDurableAgentRuntimeAvailable: () => true,
  }));
  return { ...runtime, run };
}

function mockWorkerAssignment() {
  vi.doMock("@/lib/agent/runtime/runtime-mode", () => ({
    resolveAgentRuntimeAssignment: () => ({
      mode: "worker_all",
      owner: "worker",
      shadow: false,
      cohortBucket: 7.5,
    }),
  }));
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/agent/runtime/runtime-factory");
  vi.doUnmock("@/lib/agent/runtime/runtime-mode");
});

describe("durable Agent Run command routes", () => {
  it("creates an idempotent Worker-owned Run from an authenticated command", async () => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    mockWorkerAssignment();
    const route = await import("@/app/api/agent/runs/route");

    const response = await route.POST(new Request("http://localhost/api/agent/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "request-1",
        conversationId: 12,
        taskType: "resume_query",
        agentId: "resume",
        input: { content: "读取我的简历" },
        runtimeMode: "legacy",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.assignment.owner).toBe("worker");
    expect(runtime.createRun).toHaveBeenCalledWith(
      { userId: TEST_USER.userId },
      expect.objectContaining({
        requestId: "request-1",
        conversationId: 12,
        taskType: "resume_query",
        agentId: "resume",
        input: { content: "读取我的简历" },
        runtimeMode: "worker_all",
      }),
    );
  });

  it("creates a server-admitted Run instead of trusting client routing and contract fields", async () => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    mockWorkerAssignment();
    const route = await import("@/app/api/agent/runs/route");

    const response = await route.POST(new Request("http://localhost/api/agent/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "request-server-admission",
        conversationId: 12,
        taskType: "jd_evaluation",
        agentId: "evaluate",
        contract: { taskType: "jd_evaluation", allowedTools: ["evaluate_jd_full"] },
        input: { content: "读取我的简历" },
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(runtime.createRun).toHaveBeenCalledWith(
      { userId: TEST_USER.userId },
      expect.objectContaining({
        requestId: "request-server-admission",
        conversationId: 12,
        taskType: "resume_query",
        agentId: "resume",
        contract: expect.objectContaining({
          taskType: "resume_query",
          target: "读取我的简历",
        }),
      }),
    );
    expect(json.data.admission.kind).toBe("start_new_run");
    expect(json.data.admission.evidence).toContain("client.taskType_ignored");
  });

  it("returns the authenticated user's durable Run snapshot", async () => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    const route = await import("@/app/api/agent/runs/[id]/route");

    const response = await route.GET(
      new Request("http://localhost/api/agent/runs/run-1"),
      { params: Promise.resolve({ id: "run-1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.run.id).toBe("run-1");
    expect(json.data.run.eventCursor).toBe(1);
    expect(runtime.getRun).toHaveBeenCalledWith({ userId: TEST_USER.userId }, "run-1");
  });

  it("submits idempotent user input to the same nonterminal Run", async () => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    const route = await import("@/app/api/agent/runs/[id]/inputs/route");

    const response = await route.POST(
      new Request("http://localhost/api/agent/runs/run-1/inputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: "input-1",
          input: { content: "补充：目标是后端岗位" },
        }),
      }),
      { params: Promise.resolve({ id: "run-1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.run.status).toBe("queued");
    expect(runtime.submitInput).toHaveBeenCalledWith(
      { userId: TEST_USER.userId },
      "run-1",
      "input-1",
      { content: "补充：目标是后端岗位", images: undefined },
    );
  });

  it("defers a confirmed new goal submitted to an active Run instead of accepting it as continuation input", async () => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    runtime.getRun.mockResolvedValueOnce({
      ...runtime.run,
      taskType: "resume_query",
      status: "waiting_user",
    });
    const route = await import("@/app/api/agent/runs/[id]/inputs/route");

    const response = await route.POST(
      new Request("http://localhost/api/agent/runs/run-1/inputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: "switch-input-1",
          input: { content: "确认切换到 JD 评估" },
        }),
      }),
      { params: Promise.resolve({ id: "run-1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.data.admission.kind).toBe("defer_switch");
    expect(runtime.submitInput).not.toHaveBeenCalled();
  });

  it("starts a new Run when the only prior Run in the Conversation is paused", async () => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    mockWorkerAssignment();
    runtime.listRuns.mockResolvedValueOnce([{
      ...runtime.run,
      id: "paused-run",
      taskType: "jd_evaluation",
      status: "paused",
    }]);
    const route = await import("@/app/api/agent/runs/route");

    const response = await route.POST(new Request("http://localhost/api/agent/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "request-after-pause",
        conversationId: 12,
        input: { content: "读取我的简历" },
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.admission.kind).toBe("start_new_run");
    expect(runtime.createRun).toHaveBeenCalledWith(
      { userId: TEST_USER.userId },
      expect.objectContaining({ taskType: "resume_query", agentId: "resume" }),
    );
  });

  it("persists a cancel intent without letting the client set terminal state", async () => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    const route = await import("@/app/api/agent/runs/[id]/cancel/route");

    const response = await route.POST(
      new Request("http://localhost/api/agent/runs/run-1/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: "cancel-1" }),
      }),
      { params: Promise.resolve({ id: "run-1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(json.data.run.status).toBe("cancel_requested");
    expect(runtime.requestCancel).toHaveBeenCalledWith(
      { userId: TEST_USER.userId },
      "run-1",
      "cancel-1",
    );
  });

  it("replays events after the supplied cursor for polling clients", async () => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    const route = await import("@/app/api/agent/runs/[id]/events/route");

    const response = await route.GET(
      new Request("http://localhost/api/agent/runs/run-1/events?after=3"),
      { params: Promise.resolve({ id: "run-1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.cursor).toBe(4);
    expect(json.data.events[0].payload.event.content).toBe("已恢复");
    expect(runtime.listEvents).toHaveBeenCalledWith(
      { userId: TEST_USER.userId },
      "run-1",
      3,
    );
  });

  it("streams cursor-addressed SSE without translating disconnect into cancellation", async () => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    const route = await import("@/app/api/agent/runs/[id]/events/route");

    const response = await route.GET(
      new Request("http://localhost/api/agent/runs/run-1/events?after=3", {
        headers: { Accept: "text/event-stream" },
      }),
      { params: Promise.resolve({ id: "run-1" }) },
    );
    const reader = response.body!.getReader();
    const first = await reader.read();
    await reader.cancel();
    const payload = new TextDecoder().decode(first.value);

    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(payload).toContain("id: 4");
    expect(payload).toContain("event: run.ui_event");
    expect(payload).toContain("已恢复");
    expect(runtime.requestCancel).not.toHaveBeenCalled();
  });

  it("records an idempotent scoped Run Gate decision", async () => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    const route = await import("@/app/api/agent/run-gates/[id]/response/route");

    const response = await route.POST(
      new Request("http://localhost/api/agent/run-gates/gate-1/response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: "gate-response-1", decision: "approved" }),
      }),
      { params: Promise.resolve({ id: "gate-1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.gate.status).toBe("approved");
    expect(runtime.respondGate).toHaveBeenCalledWith(
      { userId: TEST_USER.userId },
      "gate-1",
      "gate-response-1",
      "approved",
    );
  });

  it("rejects client-authored execution state and Step mutations", async () => {
    vi.resetModules();
    mockAuth();
    mockRuntime();
    const runRoute = await import("@/app/api/agent/runs/[id]/route");
    const stepRoute = await import("@/app/api/agent/runs/[id]/steps/route");

    const patchResponse = await runRoute.PATCH(
      new Request("http://localhost/api/agent/runs/run-1", {
        method: "PATCH",
        body: JSON.stringify({ status: "succeeded" }),
      }),
      { params: Promise.resolve({ id: "run-1" }) },
    );
    const stepResponse = await stepRoute.POST(
      new Request("http://localhost/api/agent/runs/run-1/steps", {
        method: "POST",
        body: JSON.stringify({ phase: "executing" }),
      }),
      { params: Promise.resolve({ id: "run-1" }) },
    );

    expect(patchResponse.status).toBe(405);
    expect(stepResponse.status).toBe(405);
  });
});
