import { describe, expect, it, vi } from "vitest";
import { AgentRuntimeRetentionService } from "@/lib/agent/runtime/runtime-retention";

describe("Agent Runtime retention", () => {
  it("removes resumable payloads before aged Evidence while preserving minimal Run state", async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql.replace(/\s+/g, " ").trim());
        return { rowCount: 1, rows: [] };
      }),
      release: vi.fn(),
    };
    const retention = new AgentRuntimeRetentionService(async (operation) => operation(client as never));

    const result = await retention.cleanup(new Date("2026-08-24T00:00:00.000Z"));

    expect(result).toEqual({ checkpointsDeleted: 1, inputsRedacted: 1, eventsDeleted: 1, outboxDeleted: 1 });
    expect(queries.join("\n")).toContain("DELETE FROM agent_run_checkpoints");
    expect(queries.join("\n")).toContain("UPDATE agent_run_inputs");
    expect(queries.join("\n")).toContain("DELETE FROM agent_run_events");
    expect(queries.some((sql) => /^DELETE FROM agent_runs/.test(sql))).toBe(false);
  });
});
