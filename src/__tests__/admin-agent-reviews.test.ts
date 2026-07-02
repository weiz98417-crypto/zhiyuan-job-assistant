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

function mockReviewLedger() {
  const review = {
    id: 9,
    run_id: "run-review",
    user_id: "user-1",
    session_id: 12,
    task_type: "jd_evaluation",
    agent_id: "evaluate",
    verdict: "fail",
    score: 0.2,
    primary_failure_type: "image_intake_failure",
    failure_types: ["image_intake_failure"],
    evidence_json: [{ code: "image_intake.skipped", failureType: "image_intake_failure", severity: "fail", message: "missing intake" }],
    suggested_fix: "route image intake first",
    eval_candidate_json: {},
    reviewer_version: "deterministic-v1",
    reviewed_at: "2026-06-10T00:00:00.000Z",
  };
  const candidate = {
    id: 3,
    review_id: 9,
    run_id: "run-review",
    name: "jd_evaluation_image_intake_failure",
    task_type: "jd_evaluation",
    failure_type: "image_intake_failure",
    input_summary: "帮我评估一个JD: JD截图 1",
    status: "candidate",
    updated_at: "2026-06-10T00:00:00.000Z",
  };
  const listAgentRunReviews = vi.fn(async () => [review]);
  const listAgentEvalCandidates = vi.fn(async () => [candidate]);
  const updateAgentEvalCandidateStatus = vi.fn(async (_id: number, status: string) => ({ ...candidate, status }));
  const transitionAgentEvalCandidate = vi.fn(async (_id: number, status: string) => ({
    candidate: { ...candidate, status },
    lifecycle: {
      status,
      message: status === "promoted" ? "候选已提升为 regression eval 草案。" : "候选已更新。",
      requiresExplicitDeveloperAction: status !== "rejected",
      nextAction: "显式 apply 后写入测试。",
      promotionDraft: status === "promoted" ? { suggestedTestName: "jd_evaluation_image_intake_failure_3_regression" } : undefined,
    },
  }));
  vi.doMock("@/lib/agent/run-ledger", () => ({
    isAgentRunLedgerAvailable: () => true,
  }));
  vi.doMock("@/lib/agent/run-review", () => ({
    AGENT_RUN_FAILURE_TYPES: ["image_intake_failure", "missing_readback", "system_error"],
    normalizeFailureType: (value: string) => value,
    generateAgentRunOpenSpecDraftSuggestions: () => "draft suggestion",
    listAgentRunReviews,
    listAgentEvalCandidates,
    updateAgentEvalCandidateStatus,
    transitionAgentEvalCandidate,
  }));
  return { listAgentRunReviews, listAgentEvalCandidates, updateAgentEvalCandidateStatus, transitionAgentEvalCandidate };
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/agent/run-ledger");
  vi.doUnmock("@/lib/agent/run-review");
});

describe("admin agent review routes", () => {
  it("returns review summaries and eval candidates for admins", async () => {
    vi.resetModules();
    mockAuth("admin");
    const ledger = mockReviewLedger();
    const route = await import("@/app/api/admin/agent-reviews/route");

    const response = await route.GET(new Request("http://localhost/api/admin/agent-reviews?verdict=fail&failureType=image_intake_failure") as never);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.summary).toMatchObject({
      total: 1,
      fail: 1,
      pendingCandidates: 1,
    });
    expect(json.data[0]).toMatchObject({
      id: 9,
      verdict: "fail",
      primary_failure_type: "image_intake_failure",
    });
    expect(ledger.listAgentRunReviews).toHaveBeenCalledWith(expect.objectContaining({
      verdict: "fail",
      failureType: "image_intake_failure",
    }));
  });

  it("rejects non-admin users", async () => {
    vi.resetModules();
    mockAuth("member");
    mockReviewLedger();
    const route = await import("@/app/api/admin/agent-reviews/route");

    const response = await route.GET(new Request("http://localhost/api/admin/agent-reviews") as never);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.success).toBe(false);
  });

  it("updates eval candidate status with admin auth", async () => {
    vi.resetModules();
    mockAuth("admin");
    const ledger = mockReviewLedger();
    const route = await import("@/app/api/admin/agent-eval-candidates/[id]/route");

    const request = new Request("http://localhost/api/admin/agent-eval-candidates/3", {
      method: "PATCH",
      body: JSON.stringify({ status: "accepted" }),
    });
    const response = await route.PATCH(request as never, { params: Promise.resolve({ id: "3" }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("accepted");
    expect(json.lifecycle).toMatchObject({
      status: "accepted",
      requiresExplicitDeveloperAction: true,
    });
    expect(ledger.transitionAgentEvalCandidate).toHaveBeenCalledWith(3, "accepted", "");
  });

  it("returns promotion lifecycle draft for eval candidates", async () => {
    vi.resetModules();
    mockAuth("admin");
    const ledger = mockReviewLedger();
    const route = await import("@/app/api/admin/agent-eval-candidates/[id]/route");

    const request = new Request("http://localhost/api/admin/agent-eval-candidates/3", {
      method: "PATCH",
      body: JSON.stringify({ status: "promoted" }),
    });
    const response = await route.PATCH(request as never, { params: Promise.resolve({ id: "3" }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.lifecycle).toMatchObject({
      status: "promoted",
      requiresExplicitDeveloperAction: true,
      promotionDraft: {
        suggestedTestName: "jd_evaluation_image_intake_failure_3_regression",
      },
    });
    expect(ledger.transitionAgentEvalCandidate).toHaveBeenCalledWith(3, "promoted", "");
  });
});
