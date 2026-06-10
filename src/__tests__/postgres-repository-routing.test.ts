import { afterEach, describe, expect, it, vi } from "vitest";

describe("Postgres repository routing", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("routes CV/session/report/JD writes through Postgres repositories without touching SQLite", async () => {
    const queries: string[] = [];
    const query = vi.fn(async (sql: string) => {
      queries.push(sql);
      return { rows: [{ id: 101 }], rowCount: 1 };
    });
    const getDb = vi.fn(() => {
      throw new Error("SQLite getDb should not be called in postgres mode");
    });

    vi.doMock("@/lib/postgres", () => ({
      getDatabaseDriver: () => "postgres",
      isPostgresConfigured: () => true,
      bootstrapPostgresSchema: vi.fn(),
      withPostgresClient: async (fn: (client: { query: typeof query }) => Promise<unknown>) => fn({ query }),
    }));
    vi.doMock("@/lib/server-db", () => ({ getDb }));

    const { getDataRepositories } = await import("@/lib/data-repositories");
    const repos = getDataRepositories();

    expect(repos.driver).toBe("postgres");
    await repos.cv.upsert("user-1", { activeVersion: "v1", versions: {} });
    await repos.sessions.create({ title: "test", messages: [] }, "user-1");
    await repos.reports.upsert({
      report_num: 1,
      date: "2026-06-10",
      company: "Acme",
      role: "AI PM",
      archetype: "test",
      overall_score: 3,
      legitimacy: "ok",
      blocks_json: "{}",
      keywords_json: "[]",
    }, "user-1");
    await repos.jds.insert({
      company: "Acme",
      role: "AI PM",
      source_type: "paste",
      source_url: "",
      body: "JD body",
      keywords_json: "[]",
    }, "user-1");

    expect(getDb).not.toHaveBeenCalled();
    expect(queries.join("\n")).toContain("INSERT INTO cv_data");
    expect(queries.join("\n")).toContain("INSERT INTO sessions");
    expect(queries.join("\n")).toContain("INSERT INTO reports");
    expect(queries.join("\n")).toContain("INSERT INTO jds");
  });
});
