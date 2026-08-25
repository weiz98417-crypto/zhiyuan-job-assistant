import { describe, expect, it, vi } from "vitest";
import { AgentRuntimeMaintenanceService } from "@/lib/agent/runtime/runtime-maintenance";

describe("Agent Runtime maintenance", () => {
  it("expires waiting_user Runs and their pending Gates after seven days", async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        const normalized = sql.replace(/\s+/g, " ").trim();
        queries.push(normalized);
        if (normalized.startsWith("SELECT id, user_id")) {
          return { rows: [{ id: "run-1", user_id: "user-1", event_sequence: 4 }], rowCount: 1 };
        }
        if (normalized.startsWith("UPDATE agent_runs")) {
          return { rows: [{ event_sequence: 5 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      }),
    };
    const maintenance = new AgentRuntimeMaintenanceService(async (operation) => operation(client as never));

    const result = await maintenance.expireWaitingUserRuns(new Date("2026-08-24T12:00:00.000Z"));

    expect(result).toEqual({ runsExpired: 1, gatesExpired: 1 });
    expect(queries.join("\n")).toContain("status = 'waiting_user'");
    expect(queries.join("\n")).toContain("UPDATE agent_run_gates SET status = 'expired'");
    expect(queries.join("\n")).toContain("event_type");
    expect(queries.join("\n")).toContain("agent_run_outbox");
    expect(queries.at(-1)).toBe("COMMIT");
  });
});
