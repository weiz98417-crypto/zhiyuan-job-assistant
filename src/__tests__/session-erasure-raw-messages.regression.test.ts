import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const state = {
    rawMessages: JSON.stringify([{ role: "user", content: "我曾在星河科技工作" }]),
    derivedMessages: JSON.stringify([{ role: "user", content: "我曾在星河科技工作" }]),
    queries: [] as string[],
  };

  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      state.queries.push(sql);
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (sql.includes("FROM sessions") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: 42, messages_json: state.rawMessages }], rowCount: 1 };
      }
      if (sql.includes("SELECT id, content") && sql.includes("summary_type=$3")) {
        return { rows: [{ id: 7, content: state.derivedMessages }], rowCount: 1 };
      }
      if (sql.startsWith("UPDATE session_memory SET content=")) {
        state.derivedMessages = String(params[0]);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("SELECT content FROM session_memory") && sql.includes("summary_type=$3")) {
        return { rows: [{ content: state.derivedMessages }], rowCount: 1 };
      }
      if (sql.startsWith("SELECT messages_json FROM sessions")) {
        return { rows: [{ messages_json: state.rawMessages }], rowCount: 1 };
      }
      if (sql.startsWith("UPDATE sessions SET messages_json=")) {
        state.rawMessages = String(params[0]);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };

  return { state, client };
});

vi.mock("@/lib/postgres", () => ({
  isPostgresConfigured: () => true,
  withPostgresClient: async <T>(callback: (client: typeof database.client) => Promise<T>) => callback(database.client),
}));

vi.mock("@/lib/memory/runtime-gates", () => ({
  assertMemoryGateOpen: vi.fn().mockResolvedValue(undefined),
  assertMemoryReadGateOpen: vi.fn().mockResolvedValue(undefined),
  assertMemoryWriteGateOpen: vi.fn().mockResolvedValue(undefined),
}));

describe("targeted session erasure raw message regression", () => {
  beforeEach(() => {
    vi.resetModules();
    database.state.rawMessages = JSON.stringify([{ role: "user", content: "我曾在星河科技工作" }]);
    database.state.derivedMessages = JSON.stringify([{ role: "user", content: "我曾在星河科技工作" }]);
    database.state.queries.length = 0;
    database.client.query.mockClear();
  });

  it("redacts sessions.messages_json as well as derived session memory", async () => {
    const { PostgresSessionMemoryAdapter } = await import("@/lib/memory/postgres-memory");
    const adapter = new PostgresSessionMemoryAdapter();

    await expect(adapter.eraseTarget({ userId: "user-1", conversationId: 42 }, "我曾在星河科技工作"))
      .resolves.toMatchObject({ redactedCount: 2 });

    expect(database.state.rawMessages).not.toContain("我曾在星河科技工作");
    expect(database.state.derivedMessages).not.toContain("我曾在星河科技工作");
    expect(database.state.queries.some((sql) => sql.startsWith("UPDATE sessions SET messages_json="))).toBe(true);
  });
});
