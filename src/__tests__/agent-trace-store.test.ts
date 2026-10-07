import { describe, expect, it, vi } from "vitest";
import {
  finishTrace,
  purgeExpiredTraces,
  recordModelGeneration,
  recordTraceSpan,
  traceStatusForRunEvent,
} from "@/lib/agent/runtime/agent-trace-store";

function fakeClient() {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  return {
    queries,
    client: {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params: params || [] });
        return { rows: [{ purged: 0 }] };
      }),
    },
  };
}

describe("Spec 18 / ADR-0040: trace store is metadata-only", () => {
  it("records a generation with only whitelisted metadata fields", async () => {
    const { client, queries } = fakeClient();
    await recordModelGeneration({
      runId: "run-1",
      model: "deepseek-flash",
      promptTokens: 100,
      completionTokens: 40,
      latencyMs: 812,
    }, client as never);

    const insert = queries.find((entry) => entry.sql.includes("INSERT INTO agent_observations"));
    expect(insert).toBeDefined();
    // 列清单里只有元数据列——没有正文列。
    expect(insert!.sql).toContain("prompt_tokens");
    expect(insert!.sql).not.toContain("prompt_text");
    expect(insert!.sql).not.toContain("content");
    expect(insert!.sql).not.toContain("messages");
    expect(insert!.params).toContain("deepseek-flash");
  });

  it("skips generations without a runId loudly instead of silently dropping them", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await recordModelGeneration({ model: "deepseek-flash", promptTokens: 1, completionTokens: 1, latencyMs: 5 });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("[agent-trace]"), expect.anything());
    } finally {
      warn.mockRestore();
    }
  });

  it("records spans with bounded names and source event sequence", async () => {
    const { client, queries } = fakeClient();
    await recordTraceSpan({
      runId: "run-2",
      name: "run.claimed",
      status: "running",
      sourceEventSequence: 3,
    }, client as never);

    const insert = queries.find((entry) => entry.sql.includes("INSERT INTO agent_observations"));
    expect(insert!.sql).toContain("'span'");
    expect(insert!.params).toContain("run.claimed");
    expect(insert!.params).toContain(3);
  });

  it("finishes a trace on terminal run statuses only", async () => {
    expect(traceStatusForRunEvent("run.status_changed", "succeeded")).toEqual({ finished: true, traceStatus: "succeeded" });
    expect(traceStatusForRunEvent("run.status_changed", "waiting_user").finished).toBe(false);
    expect(traceStatusForRunEvent("run.claimed", "running").finished).toBe(false);

    const { client, queries } = fakeClient();
    await finishTrace({ runId: "run-3", status: "failed" }, client as never);
    expect(queries[0].sql).toContain("UPDATE agent_traces");
  });

  it("purges traces and observations after the retention window", async () => {
    const { client, queries } = fakeClient();
    await purgeExpiredTraces(180, client as never);
    expect(queries.some((entry) => entry.sql.includes("DELETE FROM agent_traces"))).toBe(true);
    expect(queries.some((entry) => entry.sql.includes("DELETE FROM agent_observations"))).toBe(true);
  });
});
