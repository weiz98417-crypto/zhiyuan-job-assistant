import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/postgres");
  vi.doUnmock("@/lib/agent/run-review");
});

describe("agent run review trigger integration", () => {
  it("schedules deterministic review when a run reaches terminal status", async () => {
    vi.resetModules();
    const triggerAgentRunReview = vi.fn(async () => undefined);
    const query = vi.fn(async () => ({
      rows: [{
        id: "run-trigger",
        user_id: "user-1",
        session_id: 1,
        task_type: "jd_evaluation",
        agent_id: "evaluate",
        status: "succeeded",
        contract_json: {},
        result_json: {},
        error_json: {},
        created_at: "2026-06-10T00:00:00.000Z",
        updated_at: "2026-06-10T00:00:01.000Z",
      }],
    }));

    vi.doMock("@/lib/postgres", () => ({
      getDatabaseDriver: () => "postgres",
      isPostgresConfigured: () => true,
      withPostgresClient: async (fn: (client: { query: typeof query }) => Promise<unknown>) => fn({ query }),
    }));
    vi.doMock("@/lib/agent/run-review", () => ({
      triggerAgentRunReview,
    }));

    const ledger = await import("@/lib/agent/run-ledger");
    const updated = await ledger.updateAgentRunStatus("run-trigger", "succeeded");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(updated?.id).toBe("run-trigger");
    expect(query).toHaveBeenCalled();
    expect(triggerAgentRunReview).toHaveBeenCalledWith("run-trigger");
  });
});
