import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

const boundary = vi.hoisted(() => ({
  driver: "sqlite",
  database: undefined as Database.Database | undefined,
  query: vi.fn(),
}));

vi.mock("@/lib/server-db", () => ({ getDb: () => boundary.database }));
vi.mock("@/lib/postgres", () => ({
  getDatabaseDriver: () => boundary.driver,
  isPostgresConfigured: () => boundary.driver === "postgres",
  bootstrapPostgresSchema: vi.fn(),
  withPostgresClient: async (callback: (client: { query: typeof boundary.query }) => unknown) => callback({ query: boundary.query }),
}));

import { getDataRepositories } from "@/lib/data-repositories";

describe("interview checkpoint compare-and-swap repository", () => {
  beforeEach(() => {
    boundary.driver = "sqlite";
    boundary.query.mockReset();
    boundary.database = new Database(":memory:");
    boundary.database.exec(`CREATE TABLE sessions (
      id INTEGER PRIMARY KEY, user_id TEXT, interview_state_json TEXT, agent_state_json TEXT,
      messages_json TEXT, updated_at TEXT
    )`);
    boundary.database.prepare("INSERT INTO sessions (id, user_id, interview_state_json) VALUES (?, ?, ?)")
      .run(42, "owner-1", JSON.stringify({ checkpointVersion: 1, currentQuestion: { id: "q1" } }));
  });
  afterEach(() => boundary.database?.close());

  it("atomically rejects a stale writer and an owner mismatch while retaining the winning question", async () => {
    const sessions = getDataRepositories().sessions;
    expect(await sessions.update(42, "owner-1", {
      interviewState: { checkpointVersion: 2, currentQuestion: { id: "q2" } }, expectedInterviewCheckpointVersion: 1,
    })).toBe(true);
    expect(await sessions.update(42, "owner-1", {
      interviewState: { checkpointVersion: 2, currentQuestion: { id: "stale" } }, expectedInterviewCheckpointVersion: 1,
    })).toBe(false);
    expect(await sessions.update(42, "other-owner", {
      interviewState: { checkpointVersion: 3, currentQuestion: { id: "other-owner" } }, expectedInterviewCheckpointVersion: 2,
    })).toBe(false);
    expect(await sessions.update(42, "owner-1", {
      interviewState: { planSnapshot: {}, questionGraph: [{ id: "late-background" }] },
    })).toBe(false);
    expect(await sessions.update(42, "owner-1", {
      agentState: { checkpointStateHash: "late-background" },
    })).toBe(false);
    const row = await sessions.get(42, "owner-1");
    expect(JSON.parse(String(row?.interview_state_json))).toEqual({ checkpointVersion: 2, currentQuestion: { id: "q2" } });
  });

  it("sends the same owner and expected-version predicate to PostgreSQL", async () => {
    boundary.driver = "postgres";
    boundary.query.mockResolvedValue({ rowCount: 0, rows: [] });
    const saved = await getDataRepositories().sessions.update(42, "owner-1", {
      interviewState: { checkpointVersion: 2, currentQuestion: { id: "q2" } }, expectedInterviewCheckpointVersion: 1,
    });
    expect(saved).toBe(false);
    const [sql, values] = boundary.query.mock.calls[0];
    expect(sql).toContain("id = $2 AND user_id = $3");
    expect(sql).toContain("COALESCE((interview_state_json->>'checkpointVersion')::integer, 0) = $4");
    expect(values).toEqual([JSON.stringify({ checkpointVersion: 2, currentQuestion: { id: "q2" } }), 42, "owner-1", 1]);
  });
});
