import { afterEach, describe, expect, it, vi } from "vitest";

function mockAuth(role: "admin" | "member") {
  vi.doMock("@/lib/auth", () => ({
    getCurrentUser: async () => ({ userId: "admin-1", username: "admin", role, tokenVersion: 0 }),
    verifyTokenVersion: vi.fn(async () => true),
  }));
}

function mockEvalStore() {
  const listAgentEvalRuns = vi.fn(async () => [{ id: "eval-1", mode: "deterministic", status: "passed" }]);
  const createAgentEvalRun = vi.fn(async (input: Record<string, unknown>) => ({ id: "eval-2", ...input }));
  vi.doMock("@/lib/agent/eval-runs", () => ({
    listAgentEvalRuns,
    createAgentEvalRun,
    normalizeEvalRunMode: (value: unknown) => value === "release" ? "release" : value === "staging" ? "staging" : "deterministic",
    normalizeEvalRunStatus: (value: unknown) => value === "passed" ? "passed" : value === "failed" ? "failed" : "running",
  }));
  return { listAgentEvalRuns, createAgentEvalRun };
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/agent/eval-runs");
});

describe("admin Agent Eval routes", () => {
  it("lists and creates versioned Eval Runs for admins", async () => {
    vi.resetModules();
    mockAuth("admin");
    const store = mockEvalStore();
    const route = await import("@/app/api/admin/agent-evals/route");
    const listResponse = await route.GET(new Request("http://localhost/api/admin/agent-evals?mode=deterministic") as never);
    expect(listResponse.status).toBe(200);
    expect((await listResponse.json()).data[0].id).toBe("eval-1");
    const createResponse = await route.POST(new Request("http://localhost/api/admin/agent-evals", {
      method: "POST",
      body: JSON.stringify({ fixtureId: "fixture-1", fixtureVersion: "v1", graphVersion: "task-journey/v1", hardGatePassed: true }),
    }) as never);
    expect(createResponse.status).toBe(201);
    expect((await createResponse.json()).data.createdByUserId).toBe("admin-1");
    expect(store.createAgentEvalRun).toHaveBeenCalledWith(expect.objectContaining({ fixtureId: "fixture-1", createdByUserId: "admin-1" }));
  });

  it("rejects ordinary users", async () => {
    vi.resetModules();
    mockAuth("member");
    mockEvalStore();
    const route = await import("@/app/api/admin/agent-evals/route");
    const response = await route.GET(new Request("http://localhost/api/admin/agent-evals") as never);
    expect(response.status).toBe(403);
  });
});
