import { afterEach, describe, expect, it, vi } from "vitest";

const USER = {
  userId: "user-1",
  username: "member",
  role: "member",
  tokenVersion: 0,
};

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/agent/run-ledger");
  vi.doUnmock("@/lib/agent/run-review");
});

describe("agent session review route", () => {
  it("creates eval candidates for image turns without durable run evidence", async () => {
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: async () => USER,
    }));
    vi.doMock("@/lib/agent/run-ledger", () => ({
      isAgentRunLedgerAvailable: () => true,
    }));
    const createSessionAnomalyEvalCandidates = vi.fn(async () => [{
      id: 1,
      failure_type: "image_intake_not_called",
      task_type: "jd_evaluation",
    }]);
    vi.doMock("@/lib/agent/run-review", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/agent/run-review")>();
      return {
        ...actual,
        createSessionAnomalyEvalCandidates,
      };
    });
    const route = await import("@/app/api/agent/session-review/route");

    const response = await route.POST(new Request("http://localhost/api/agent/session-review", {
      method: "POST",
      body: JSON.stringify({
        sessionId: 33,
        messages: [
          { role: "user", content: "帮我评估一个JD", images: ["data:image/png;base64,AAAA"] },
        ],
        recentRuns: [],
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(createSessionAnomalyEvalCandidates).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      sessionId: 33,
      messages: [expect.objectContaining({ role: "user", content: "帮我评估一个JD" })],
    }));
  });

  it("returns disabled when durable run ledger is unavailable", async () => {
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: async () => USER,
    }));
    vi.doMock("@/lib/agent/run-ledger", () => ({
      isAgentRunLedgerAvailable: () => false,
    }));
    const route = await import("@/app/api/agent/session-review/route");

    const response = await route.POST(new Request("http://localhost/api/agent/session-review", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ success: true, enabled: false, data: [] });
  });
});
