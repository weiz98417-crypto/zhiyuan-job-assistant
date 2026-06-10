import { afterEach, describe, expect, it, vi } from "vitest";

const TEST_USER = {
  userId: "user-run-ledger",
  username: "ledger-user",
  role: "member",
  tokenVersion: 0,
};

function mockAuth() {
  vi.doMock("@/lib/auth", () => ({
    getCurrentUser: async () => TEST_USER,
  }));
}

function mockLedger(overrides: Record<string, unknown> = {}) {
  const ledger = {
    isAgentRunLedgerAvailable: vi.fn(() => true),
    createAgentRun: vi.fn(async (input: unknown) => ({
      id: "run-1",
      user_id: TEST_USER.userId,
      session_id: 12,
      task_type: "resume_edit",
      agent_id: "resume",
      status: "planned",
      contract_json: {},
      result_json: {},
      error_json: {},
      created_at: "2026-06-10T00:00:00.000Z",
      updated_at: "2026-06-10T00:00:00.000Z",
      input,
    })),
    listActiveAgentRuns: vi.fn(async () => []),
    getAgentRun: vi.fn(async () => ({
      id: "run-1",
      user_id: TEST_USER.userId,
      session_id: 12,
      task_type: "resume_edit",
      agent_id: "resume",
      status: "running",
      contract_json: {},
      result_json: {},
      error_json: {},
      created_at: "2026-06-10T00:00:00.000Z",
      updated_at: "2026-06-10T00:00:00.000Z",
    })),
    listAgentRunSteps: vi.fn(async () => []),
    updateAgentRunStatus: vi.fn(async (_id: string, status: string) => ({ id: "run-1", status })),
    cancelAgentRun: vi.fn(async () => true),
    appendAgentRunStep: vi.fn(async (input: unknown) => ({
      id: 1,
      run_id: "run-1",
      phase: "executing",
      tool_name: "save_resume_section",
      status: "running",
      input_summary: "",
      output_summary: "",
      verifier_json: {},
      error_json: {},
      created_at: "2026-06-10T00:00:00.000Z",
      input,
    })),
    ...overrides,
  };
  vi.doMock("@/lib/agent/run-ledger", () => ledger);
  return ledger;
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/agent/run-ledger");
});

describe("agent run ledger routes", () => {
  it("creates a run for the authenticated user", async () => {
    vi.resetModules();
    mockAuth();
    const ledger = mockLedger();
    const route = await import("@/app/api/agent/runs/route");

    const response = await route.POST(new Request("http://localhost/api/agent/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: 12,
        taskType: "resume_edit",
        agentId: "resume",
        contract: { target: "skills" },
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(ledger.createAgentRun).toHaveBeenCalledWith(expect.objectContaining({
      userId: TEST_USER.userId,
      sessionId: 12,
      taskType: "resume_edit",
      agentId: "resume",
      contract: { target: "skills" },
    }));
  });

  it("lists active runs scoped by user and session", async () => {
    vi.resetModules();
    mockAuth();
    const ledger = mockLedger({
      listActiveAgentRuns: vi.fn(async () => [{ id: "run-active", status: "running" }]),
    });
    const route = await import("@/app/api/agent/runs/route");

    const response = await route.GET(new Request("http://localhost/api/agent/runs?sessionId=42"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.enabled).toBe(true);
    expect(json.data[0].id).toBe("run-active");
    expect(ledger.listActiveAgentRuns).toHaveBeenCalledWith(TEST_USER.userId, 42);
  });

  it("updates a run only after ownership read-back", async () => {
    vi.resetModules();
    mockAuth();
    const ledger = mockLedger();
    const route = await import("@/app/api/agent/runs/[id]/route");

    const response = await route.PATCH(new Request("http://localhost/api/agent/runs/run-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "succeeded", result: { ok: true } }),
    }), { params: Promise.resolve({ id: "run-1" }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(ledger.getAgentRun).toHaveBeenCalledWith("run-1", TEST_USER.userId);
    expect(ledger.updateAgentRunStatus).toHaveBeenCalledWith("run-1", "succeeded", {
      result: { ok: true },
      error: undefined,
    });
  });

  it("appends a step only after ownership read-back", async () => {
    vi.resetModules();
    mockAuth();
    const ledger = mockLedger();
    const route = await import("@/app/api/agent/runs/[id]/steps/route");

    const response = await route.POST(new Request("http://localhost/api/agent/runs/run-1/steps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phase: "executing",
        toolName: "save_resume_section",
        status: "running",
        inputSummary: "section=skills",
      }),
    }), { params: Promise.resolve({ id: "run-1" }) });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(ledger.getAgentRun).toHaveBeenCalledWith("run-1", TEST_USER.userId);
    expect(ledger.appendAgentRunStep).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-1",
      phase: "executing",
      toolName: "save_resume_section",
      status: "running",
      inputSummary: "section=skills",
    }));
  });
});
