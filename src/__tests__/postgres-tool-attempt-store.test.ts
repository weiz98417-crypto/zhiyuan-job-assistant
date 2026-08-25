import { describe, expect, it, vi } from "vitest";
import { PostgresToolAttemptStore } from "@/lib/agent/runtime/postgres-tool-attempt-store";

describe("Postgres Tool Attempt store", () => {
  it("records intent before dispatch and fences every later state change", async () => {
    const now = new Date("2026-08-24T10:00:00.000Z");
    const baseRow = {
      id: "attempt-1", run_id: "run-1", user_id: "user-1", attempt_sequence: 1,
      tool_name: "save_profile", args_hash: "args-hash", idempotency_key: "idem-1",
      capability_json: { risk: "high", reconciliation: "read_back" }, status: "intent_recorded",
      effect_state: "not_dispatched", result_json: {}, error_json: {}, owner_id: "worker-1",
      fencing_token: 4, created_at: now, updated_at: now,
    };
    const queries: Array<{ sql: string; params?: unknown[] }> = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("FROM agent_runs") && sql.includes("FOR UPDATE")) {
        return { rows: [{ user_id: "user-1", owner_id: "worker-1", fencing_token: 4 }] };
      }
      if (sql.includes("FROM agent_tool_attempts") && sql.includes("idempotency_key")) return { rows: [] };
      if (sql.includes("COALESCE(MAX(attempt_sequence)")) return { rows: [{ next_sequence: 1 }] };
      if (sql.includes("INSERT INTO agent_tool_attempts")) return { rows: [baseRow] };
      if (sql.includes("SET status = 'running'")) return { rows: [{ ...baseRow, status: "running", effect_state: "unknown" }] };
      if (sql.includes("SET status = $2")) return { rows: [{ ...baseRow, status: "succeeded", effect_state: "verified", result_json: { saved: true } }] };
      throw new Error(`Unexpected query: ${sql}`);
    });
    const store = new PostgresToolAttemptStore(async (callback) => callback({ query } as never));

    const begun = await store.beginAttempt({
      principal: { userId: "user-1" }, runId: "run-1", workerId: "worker-1",
      fencingToken: 4, toolName: "save_profile", args: { title: "AI 产品经理" },
      argsHash: "args-hash", idempotencyKey: "idem-1",
      capability: {
        risk: "high", deadlineClass: "verified_write", deadlineMs: 60_000,
        cancellation: "after_dispatch_reconcile", idempotency: "request_key",
        reconciliation: "read_back", verification: "verified_action",
        backgroundCapable: false, workerExecution: "server",
      },
    });
    const running = await store.markAttemptRunning("attempt-1", {
      workerId: "worker-1", fencingToken: 4, effectState: "unknown",
    });
    const finished = await store.finishAttempt("attempt-1", {
      workerId: "worker-1", fencingToken: 4, status: "succeeded", effectState: "verified",
      result: { success: true, data: { saved: true } }, observation: null,
    });

    expect(begun).toMatchObject({ replayed: false, attempt: { status: "intent_recorded" } });
    expect(running.status).toBe("running");
    expect(finished).toMatchObject({ status: "succeeded", effectState: "verified" });
    expect(queries.find((item) => item.sql.includes("INSERT INTO agent_tool_attempts"))?.params).toContainEqual({ title: "AI 产品经理" });
    expect(queries.filter((item) => item.sql.includes("run.owner_id = $"))).toHaveLength(2);
  });
});
