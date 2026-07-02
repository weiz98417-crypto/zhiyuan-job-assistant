import { afterEach, describe, expect, it, vi } from "vitest";

const ADMIN_USER = {
  userId: "admin-1",
  username: "admin",
  role: "admin",
  tokenVersion: 0,
};

function mockAuth(role: "admin" | "member" = "admin") {
  vi.doMock("@/lib/auth", () => ({
    getCurrentUser: async () => ({ ...ADMIN_USER, role }),
    verifyTokenVersion: vi.fn(async () => true),
  }));
}

function mockRunLedger() {
  const failedRun = {
    id: "run-failed",
    user_id: "user-1",
    session_id: 42,
    task_type: "resume_edit",
    agent_id: "resume",
    status: "failed",
    contract_json: {
      taskType: "resume_edit",
      target: "skills section",
      successCriteria: ["read-back verification passes"],
      validators: ["read_back_match"],
      routing: {
        activeTaskId: "career_positioning_guidance-123456",
        activeTaskType: "career_positioning_guidance",
        activeTaskPhase: "deep_dive",
        routeLocked: true,
        auditSummary: "guided:career_positioning_guidance:locked",
      },
    },
    result_json: { note: "Successfully saved to user@example.com" },
    error_json: { message: "phone 13800138000 failed" },
    created_at: "2026-06-10T00:00:00.000Z",
    updated_at: "2026-06-10T00:01:00.000Z",
    recent_steps: [{
      id: 7,
      run_id: "run-failed",
      phase: "verifying",
      tool_name: "save_resume_section",
      status: "failed",
      input_summary: "data:image/png;base64,AAAA user@example.com 13800138000",
      output_summary: "read-back mismatch",
      verifier_json: { detail: "user@example.com" },
      error_json: { detail: "13800138000" },
      created_at: "2026-06-10T00:01:00.000Z",
    }],
  };
  const successRun = {
    ...failedRun,
    id: "run-success",
    status: "succeeded",
    error_json: {},
    recent_steps: [{
      ...failedRun.recent_steps[0],
      id: 8,
      run_id: "run-success",
      status: "succeeded",
      output_summary: "read-back verified",
      error_json: {},
    }],
  };
  const listRecentAgentRuns = vi.fn(async () => [successRun, failedRun]);
  const listRecentFailedAgentRuns = vi.fn(async () => [failedRun]);
  vi.doMock("@/lib/agent/run-ledger", () => ({
    isAgentRunLedgerAvailable: () => true,
    listRecentAgentRuns,
    listRecentFailedAgentRuns,
  }));
  return { listRecentAgentRuns, listRecentFailedAgentRuns };
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/agent/run-ledger");
});

describe("admin agent run debug route", () => {
  it("returns redacted recent run summaries and Chinese monitor stats for admins", async () => {
    vi.resetModules();
    mockAuth("admin");
    const ledger = mockRunLedger();
    const route = await import("@/app/api/admin/agent-runs/route");

    const response = await route.GET(new Request("http://localhost/api/admin/agent-runs?limit=10") as never);
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.summary).toMatchObject({
      totalRuns: 2,
      failedRuns: 1,
      succeededRuns: 1,
      failedSteps: 1,
    });
    expect(json.data).toHaveLength(2);
    expect(json.data[1]).toMatchObject({
      id: "run-failed",
      taskType: "resume_edit",
      contract: {
        routing: expect.objectContaining({
          activeTaskType: "career_positioning_guidance",
          activeTaskPhase: "deep_dive",
          routeLocked: true,
        }),
      },
      recentSteps: [expect.objectContaining({
        toolName: "save_resume_section",
        status: "failed",
      })],
    });
    expect(ledger.listRecentAgentRuns).toHaveBeenCalledWith(10, undefined);
    expect(ledger.listRecentFailedAgentRuns).not.toHaveBeenCalled();
    expect(serialized).not.toContain("data:image/png;base64");
    expect(serialized).not.toContain("user@example.com");
    expect(serialized).not.toContain("13800138000");
    expect(serialized).toContain("[email]");
    expect(serialized).toContain("[phone]");
  });

  it("keeps the failure filter available for investigation", async () => {
    vi.resetModules();
    mockAuth("admin");
    const ledger = mockRunLedger();
    const route = await import("@/app/api/admin/agent-runs/route");

    const response = await route.GET(new Request("http://localhost/api/admin/agent-runs?limit=10&status=failed") as never);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.summary.failedRuns).toBe(1);
    expect(json.data).toHaveLength(1);
    expect(ledger.listRecentFailedAgentRuns).toHaveBeenCalledWith(10);
    expect(ledger.listRecentAgentRuns).not.toHaveBeenCalled();
  });

  it("rejects non-admin users", async () => {
    vi.resetModules();
    mockAuth("member");
    mockRunLedger();
    const route = await import("@/app/api/admin/agent-runs/route");

    const response = await route.GET(new Request("http://localhost/api/admin/agent-runs") as never);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.success).toBe(false);
  });
});
