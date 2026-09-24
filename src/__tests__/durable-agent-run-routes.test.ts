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
    lastObservation: {},
    error: {},
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
    getRunByRequestId: vi.fn(async () => null as typeof run | null),
    submitInput: vi.fn(async () => ({
      run: { ...run, status: "queued", eventCursor: 2 },
      input: {
        id: 2,
        runId: "run-1",
        userId: TEST_USER.userId,
        requestId: "input-1",
        inputType: "turn",
        content: { content: "补充：目标是后端岗位", images: undefined as string[] | undefined },
        status: "pending",
        createdAt: "2026-08-24T00:01:00.000Z",
        consumedAt: null,
      },
      replayed: false,
    })),
    requestCancel: vi.fn(async () => ({ ...run, status: "cancel_requested", eventCursor: 2 })),
    requestPause: vi.fn(async () => ({ ...run, status: "paused", eventCursor: 2 })),
    resumeRun: vi.fn(async () => ({ ...run, status: "queued", eventCursor: 2 })),
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

  it("returns a compact receipt when a Run contract contains image data", async () => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    mockWorkerAssignment();
    runtime.createRun.mockResolvedValueOnce({
      run: {
        ...runtime.run,
        contract: {
          routing: { jdSource: { images: ["x".repeat(1_000_000)] } },
          journey: { graphVersion: "v1", artifacts: [{ artifactId: "jd-1", kind: "jd" }] },
        },
      },
      replayed: false,
    });
    const route = await import("@/app/api/agent/runs/route");

    const response = await route.POST(new Request("http://localhost/api/agent/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "request-compact",
        conversationId: 12,
        input: { content: "评估这个 JD" },
      }),
    }));
    const body = await response.text();
    const json = JSON.parse(body);

    expect(response.status).toBe(201);
    expect(body.length).toBeLessThan(2_000);
    expect(json.data.run.contract.routing).toBeUndefined();
    expect(json.data.run.contract.journey.artifacts[0].artifactId).toBe("jd-1");
    expect(json.data.admission.contract).toBeUndefined();
  });

  it("replays an accepted request instead of submitting it as a second turn", async () => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    runtime.listRuns.mockResolvedValueOnce([runtime.run]);
    mockWorkerAssignment();
    const route = await import("@/app/api/agent/runs/route");

    const response = await route.POST(new Request("http://localhost/api/agent/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "request-1",
        conversationId: 12,
        input: { content: "改为评估这个 JD" },
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.replayed).toBe(true);
    expect(json.data.run.id).toBe("run-1");
    expect(runtime.submitInput).not.toHaveBeenCalled();
    expect(runtime.createRun).not.toHaveBeenCalled();
  });

  it("replays a continuation after its Run becomes terminal", async () => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    const completed = { ...runtime.run, status: "succeeded", requestId: "original-request" };
    runtime.getRunByRequestId.mockResolvedValue(completed);
    mockWorkerAssignment();
    const route = await import("@/app/api/agent/runs/route");
    const command = new Request("http://localhost/api/agent/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "continuation-request",
        conversationId: 12,
        input: { content: "继续评估" },
      }),
    });

    const response = await route.POST(command);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ replayed: true, run: { id: "run-1", status: "succeeded" } });
    expect(runtime.getRunByRequestId).toHaveBeenCalledWith(
      { userId: TEST_USER.userId },
      "continuation-request",
    );
    expect(runtime.listRuns).not.toHaveBeenCalled();
    expect(runtime.submitInput).not.toHaveBeenCalled();
    expect(runtime.createRun).not.toHaveBeenCalled();
  });

  it("finds a continuation by request id without scanning the recent Run list", async () => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    runtime.getRunByRequestId.mockResolvedValue({
      ...runtime.run,
      status: "succeeded",
      requestId: "original-request",
    });
    const route = await import("@/app/api/agent/runs/route");

    const response = await route.GET(new Request(
      "http://localhost/api/agent/runs?conversationId=12&activeOnly=false&requestId=continuation-request",
    ));
    const body = await response.json();

    expect(body.data).toMatchObject([{ id: "run-1", status: "succeeded" }]);
    expect(runtime.listRuns).not.toHaveBeenCalled();
  });

  it("does not replay a request id from another Conversation", async () => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    runtime.getRunByRequestId.mockResolvedValue({ ...runtime.run, conversationId: 13 });
    mockWorkerAssignment();
    const route = await import("@/app/api/agent/runs/route");

    const response = await route.POST(new Request("http://localhost/api/agent/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "request-1", conversationId: 12, input: { content: "评估" } }),
    }));

    expect(response.status).toBe(409);
    expect(runtime.submitInput).not.toHaveBeenCalled();
    expect(runtime.createRun).not.toHaveBeenCalled();
  });

  it("admits an image-only turn without losing the attachment", async () => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    mockWorkerAssignment();
    const route = await import("@/app/api/agent/runs/route");

    const response = await route.POST(new Request("http://localhost/api/agent/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "request-image-only",
        conversationId: 12,
        input: { content: "", images: ["data:image/jpeg;base64,c2FtcGxl"] },
      }),
    }));

    expect(response.status).toBe(201);
    expect(runtime.createRun).toHaveBeenCalledWith(
      { userId: TEST_USER.userId },
      expect.objectContaining({
        input: expect.objectContaining({
          content: expect.stringContaining("识别这张图片"),
          images: ["data:image/jpeg;base64,c2FtcGxl"],
        }),
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

  it("returns a compact authenticated Run snapshot without private contract data", async () => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    const image = `data:image/png;base64,${"a".repeat(1_000_000)}`;
    const privateText = "简历正文仅供分析";
    runtime.getRun.mockResolvedValueOnce({
      ...runtime.run,
      contract: {
        target: privateText,
        routing: { images: [image] },
        journey: { graphVersion: "v1", artifacts: [{ artifactId: "jd-1", kind: "jd", payload: image }] },
      },
      budgets: { attachment: image },
      lastObservation: { content: privateText },
      error: { detail: privateText },
    });
    const route = await import("@/app/api/agent/runs/[id]/route");

    const response = await route.GET(
      new Request("http://localhost/api/agent/runs/run-1"),
      { params: Promise.resolve({ id: "run-1" }) },
    );
    const body = await response.text();
    const json = JSON.parse(body);

    expect(response.status).toBe(200);
    expect(json.data.run.id).toBe("run-1");
    expect(json.data.run.eventCursor).toBe(1);
    expect(json.data.run.conversationId).toBe(12);
    expect(json.data.run.contract).toEqual({ journey: {
      graphVersion: "v1",
      artifacts: [{ artifactId: "jd-1", kind: "jd", version: "", hash: "" }],
    } });
    expect(json.data.run.budgets).toEqual({});
    expect(json.data.run.lastObservation).toEqual({});
    expect(json.data.run.error).toEqual({});
    expect(body.length).toBeLessThan(2_000);
    expect(body).not.toContain(image);
    expect(body).not.toContain(privateText);
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

  it("accepts an image-only continuation without echoing its image or message", async () => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    const image = `data:image/png;base64,${"a".repeat(1_000_000)}`;
    const privateMessage = "原始简历正文仅供本次诊断";
    runtime.getRun.mockResolvedValueOnce({
      ...runtime.run,
      taskType: "resume_diagnosis",
      agentId: "resume",
      status: "waiting_user",
      contract: { target: privateMessage },
    });
    runtime.submitInput.mockResolvedValueOnce({
      run: {
        ...runtime.run,
        taskType: "resume_diagnosis",
        agentId: "resume",
        contract: { target: privateMessage },
      },
      input: {
        id: 3,
        runId: "run-1",
        userId: TEST_USER.userId,
        requestId: "input-image-only",
        inputType: "turn",
        content: { content: privateMessage, images: [image] },
        status: "pending",
        createdAt: "2026-08-24T00:01:00.000Z",
        consumedAt: null,
      },
      replayed: false,
    });
    const route = await import("@/app/api/agent/runs/[id]/inputs/route");

    const response = await route.POST(
      new Request("http://localhost/api/agent/runs/run-1/inputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: "input-image-only", input: { content: "", images: [image] } }),
      }),
      { params: Promise.resolve({ id: "run-1" }) },
    );
    const body = await response.text();
    const json = JSON.parse(body);

    expect(response.status).toBe(201);
    expect(runtime.submitInput).toHaveBeenCalledWith(
      { userId: TEST_USER.userId },
      "run-1",
      "input-image-only",
      expect.objectContaining({ images: [image], content: expect.stringContaining("识别这张图片") }),
    );
    expect(json.data).toMatchObject({ run: { id: "run-1" }, input: { id: 3 }, replayed: false });
    expect(json.data.input.content).toBeUndefined();
    expect(json.data.run.contract.target).toBeUndefined();
    expect(json.data.admission.contract).toBeUndefined();
    expect(body).not.toContain(image);
    expect(body).not.toContain(privateMessage);
    expect(body.length).toBeLessThan(2_000);
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
    expect(json.data.admission.contract).toBeUndefined();
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

  it.each([
    { action: "pause", method: "requestPause", runStatus: "paused", responseStatus: 200, loadRoute: () => import("@/app/api/agent/runs/[id]/pause/route") },
    { action: "resume", method: "resumeRun", runStatus: "queued", responseStatus: 200, loadRoute: () => import("@/app/api/agent/runs/[id]/resume/route") },
    { action: "cancel", method: "requestCancel", runStatus: "cancel_requested", responseStatus: 202, loadRoute: () => import("@/app/api/agent/runs/[id]/cancel/route") },
  ] as const)("returns a compact $action receipt without private Run data", async ({ action, method, runStatus, responseStatus, loadRoute }) => {
    vi.resetModules();
    mockAuth();
    const runtime = mockRuntime();
    const image = `data:image/png;base64,${"a".repeat(1_000_000)}`;
    const privateText = "简历正文仅供分析";
    runtime[method].mockResolvedValueOnce({
      ...runtime.run,
      status: runStatus,
      eventCursor: 2,
      contract: { target: privateText, routing: { images: [image] } },
      budgets: { attachment: image },
      lastObservation: { content: privateText },
      error: { detail: privateText },
    });
    const route = await loadRoute();

    const response = await route.POST(
      new Request(`http://localhost/api/agent/runs/run-1/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: `${action}-compact` }),
      }),
      { params: Promise.resolve({ id: "run-1" }) },
    );
    const body = await response.text();
    const json = JSON.parse(body);

    expect(response.status).toBe(responseStatus);
    expect(json.data.run).toMatchObject({ id: "run-1", conversationId: 12, status: runStatus, eventCursor: 2 });
    expect(json.data.run.contract).toEqual({ journey: { graphVersion: "", artifacts: [] } });
    expect(json.data.run.budgets).toEqual({});
    expect(json.data.run.lastObservation).toEqual({});
    expect(json.data.run.error).toEqual({});
    expect(body.length).toBeLessThan(2_000);
    expect(body).not.toContain(image);
    expect(body).not.toContain(privateText);
    expect(runtime[method]).toHaveBeenCalledWith(
      { userId: TEST_USER.userId },
      "run-1",
      `${action}-compact`,
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
