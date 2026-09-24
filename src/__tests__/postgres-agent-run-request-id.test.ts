import { describe, expect, it, vi } from "vitest";
import { PostgresAgentRunStore } from "@/lib/agent/runtime/postgres-agent-run-store";

describe("Postgres Agent Run request id recovery", () => {
  it("replays a completed Run through its continuation input id", async () => {
    const row = {
      id: "run-original",
      user_id: "user-1",
      session_id: 42,
      request_id: "create-request",
      task_type: "resume_diagnosis",
      agent_id: "resume",
      status: "succeeded",
      snapshot_version: 4,
      event_sequence: 7,
      contract_json: {},
      budgets_json: {},
      last_observation_json: {},
      error_json: {},
      runtime_mode: "worker_all",
      created_at: new Date("2026-09-23T00:00:00.000Z"),
      updated_at: new Date("2026-09-23T00:01:00.000Z"),
    };
    const query = vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("FROM agent_runs WHERE user_id = $1 AND request_id = $2")) return { rows: [] };
      if (sql.includes("FROM agent_run_inputs input")) return { rows: [row] };
      throw new Error(`Unexpected query: ${sql}`);
    });
    const store = new PostgresAgentRunStore(async (callback) => callback({ query } as never));
    const principal = { userId: "user-1" };

    const found = await store.getRunByRequestId(principal, "continuation-request");
    const replayed = await store.createRun(principal, {
      requestId: "continuation-request",
      conversationId: 42,
      taskType: "resume_diagnosis",
      agentId: "resume",
      input: { content: "补充这份截图" },
    });

    expect(found).toMatchObject({ id: "run-original", status: "succeeded" });
    expect(replayed).toMatchObject({ run: { id: "run-original" }, replayed: true });
    expect(query.mock.calls.some(([sql]) => sql.includes("input.input_type = 'turn'"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.includes("INSERT INTO agent_runs"))).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql.includes("pg_advisory_xact_lock"))).toBe(true);
  });
});
