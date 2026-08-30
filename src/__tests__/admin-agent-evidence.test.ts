import { afterEach, describe, expect, it, vi } from "vitest";

function mockAuth(role: "admin" | "member") {
  vi.doMock("@/lib/auth", () => ({
    getCurrentUser: async () => ({ userId: "admin-1", username: "admin", role, tokenVersion: 0 }),
    verifyTokenVersion: vi.fn(async () => true),
  }));
}

function mockEvidence() {
  const getAgentEvidenceView = vi.fn(async () => ({
    run: { id: "run-1", userId: "user-1", sessionId: 3, taskType: "resume_edit", agentId: "resume", status: "succeeded", contract: {}, createdAt: "", updatedAt: "" },
    events: [
      { sequence: 1, type: "run.created", schemaVersion: 1, evidence: { status: "queued" }, userSafeView: { type: "run.created" }, createdAt: "" },
      { sequence: 2, type: "run.ui_event", schemaVersion: 1, evidence: { event: { type: "tool_result", name: "save_resume_section", success: true } }, userSafeView: { type: "tool_result", name: "save_resume_section", success: true }, createdAt: "" },
    ],
    checkpoints: [],
    gates: [],
    review: { id: 9, evidence_json: [{ message: "Bearer [token]" }] },
    evalCandidate: { id: 3, status: "candidate" },
  }));
  vi.doMock("@/lib/agent/admin-evidence", () => ({ getAgentEvidenceView }));
  return { getAgentEvidenceView };
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/agent/admin-evidence");
});

describe("admin agent evidence route", () => {
  it("returns ordered parity evidence only to admins", async () => {
    vi.resetModules();
    mockAuth("admin");
    const evidence = mockEvidence();
    const route = await import("@/app/api/admin/agent-evidence/[runId]/route");
    const response = await route.GET(new Request("http://localhost/api/admin/agent-evidence/run-1"), { params: Promise.resolve({ runId: "run-1" }) });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.data.events.map((event: { sequence: number }) => event.sequence)).toEqual([1, 2]);
    expect(json.data.review.id).toBe(9);
    expect(json.data.evalCandidate.id).toBe(3);
    expect(evidence.getAgentEvidenceView).toHaveBeenCalledWith("run-1");
  });

  it("does not expose evidence to ordinary users", async () => {
    vi.resetModules();
    mockAuth("member");
    mockEvidence();
    const route = await import("@/app/api/admin/agent-evidence/[runId]/route");
    const response = await route.GET(new Request("http://localhost/api/admin/agent-evidence/run-1"), { params: Promise.resolve({ runId: "run-1" }) });
    expect(response.status).toBe(403);
  });
});
