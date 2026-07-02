import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type ServerDbModule = typeof import("@/lib/server-db");

const TEST_USER_ID = "user-persist-eval-jd";

let dataDir: string | null = null;
let serverDb: ServerDbModule | null = null;

async function loadRouteHarness() {
  vi.resetModules();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyuan-persist-eval-jd-"));
  process.env.DATA_DIR = dataDir;
  process.env.DB_DRIVER = "sqlite";
  delete process.env.ALLOW_SQLITE_LEGACY;

  vi.doMock("@/lib/auth", () => ({
    getCurrentUser: async () => ({
      userId: TEST_USER_ID,
      username: "persist-eval-user",
      role: "member",
      tokenVersion: 0,
    }),
  }));

  serverDb = await import("@/lib/server-db");
  const route = await import("@/app/api/agent/persist-eval/route");
  const db = serverDb.getDb();
  db.prepare(
    "INSERT INTO users (id, username, password_hash, display_name, role, status, token_version) VALUES (?, ?, ?, ?, ?, ?, 0)",
  ).run(TEST_USER_ID, "persist-eval-user", "hash", "Persist Eval User", "member", "active");
  return { db, route };
}

afterEach(() => {
  vi.doUnmock("@/lib/auth");
  if (serverDb) {
    serverDb.getDb().close();
    serverDb = null;
  }
  vi.resetModules();
  if (dataDir) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    dataDir = null;
  }
  delete process.env.DATA_DIR;
  delete process.env.DB_DRIVER;
  delete process.env.ALLOW_SQLITE_LEGACY;
});

describe("persist-eval JD verified write", () => {
  it("verifies the saved JD by reading it back before returning success", async () => {
    const { db, route } = await loadRouteHarness();
    const jdText = "岗位职责：负责 AI 产品规划、Agent 工作流设计、RAG 知识库建设、评测体系搭建和跨团队落地。任职要求：熟悉大模型应用、数据分析、Prompt Engineering 和产品交付。";

    const response = await route.POST(new Request("http://localhost/api/agent/persist-eval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: "深圳评估科技",
        role: "AI 产品经理",
        overallScore: 3.7,
        archetype: "AI产品经理",
        legitimacy: "normal",
        blocks: { a: { content: "匹配 AI 产品方向", score: 4 } },
        keywords: ["AI产品", "Agent", "RAG"],
        jdText,
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.reportNum).toBe(1);
    expect(json.jdId).toBeGreaterThan(0);
    expect(json.reportReadBackVerified).toBe(true);
    expect(json.jdReadBackVerified).toBe(true);

    const report = db.prepare("SELECT * FROM reports WHERE report_num = ?").get(json.reportNum) as { company: string; role: string; overall_score: number; blocks_json: string } | undefined;
    expect(report).toMatchObject({
      company: "深圳评估科技",
      role: "AI 产品经理",
      overall_score: 3.7,
    });
    expect(report?.blocks_json).toContain("匹配 AI 产品方向");

    const jd = db.prepare("SELECT * FROM jds WHERE id = ?").get(json.jdId) as { company: string; role: string; body: string; report_id: number } | undefined;
    expect(jd).toMatchObject({
      company: "深圳评估科技",
      role: "AI 产品经理",
      body: jdText,
      report_id: 1,
    });
  });

  it("accepts PostgreSQL jsonb read-back values as semantic JSON matches", async () => {
    vi.resetModules();
    process.env.DB_DRIVER = "postgres";
    process.env.DATABASE_URL = "postgres://example/test";
    const queries: string[] = [];
    let reportSourceHash = "";
    const memory = {
      indexMemorySourceBestEffort: vi.fn(async () => undefined),
      createMemoryItem: vi.fn(async () => 42),
      addMemoryEvidence: vi.fn(async () => undefined),
    };
    const jdText = "岗位职责：负责 AI 产品规划、Agent 工作流设计、RAG 知识库建设、评测体系搭建和跨团队落地。任职要求：熟悉大模型应用、数据分析、Prompt Engineering 和产品交付。";
    const blocks = {
      b: { content: "能覆盖 AI 产品交付", score: 4 },
      a: { content: "方向匹配", score: 3.5 },
    };
    const keywords = ["AI产品", "Agent", "RAG"];
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push(sql);
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return { rows: [], rowCount: null };
      if (sql.includes("MAX(num)")) return { rows: [{ max: 0 }], rowCount: 1 };
      if (sql.includes("SELECT * FROM reports WHERE source_hash")) return { rows: [], rowCount: 0 };
      if (sql.includes("MAX(report_num)")) return { rows: [{ max: 0 }], rowCount: 1 };
      if (sql.includes("INSERT INTO applications")) return { rows: [], rowCount: 1 };
      if (sql.includes("INSERT INTO reports")) {
        reportSourceHash = String(params[10] || "");
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("SELECT * FROM reports WHERE report_num")) {
        return {
          rows: [{
            report_num: 1,
            date: "2026-06-15",
            company: "深圳华启数智科技有限公司",
            role: "数据产品经理",
            archetype: "AI产品经理",
            overall_score: 2,
            legitimacy: "normal",
            blocks_json: { a: blocks.a, b: blocks.b },
            keywords_json: keywords,
            source_hash: reportSourceHash,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes("INSERT INTO jds")) return { rows: [{ id: 101 }], rowCount: 1 };
      if (sql.includes("SELECT * FROM jds WHERE id")) {
        return {
          rows: [{
            id: 101,
            company: "深圳华启数智科技有限公司",
            role: "数据产品经理",
            source_type: "agent",
            source_url: "",
            body: jdText,
            keywords_json: keywords,
            report_id: 1,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: async () => ({
        userId: TEST_USER_ID,
        username: "persist-eval-user",
        role: "member",
        tokenVersion: 0,
      }),
    }));
    vi.doMock("@/lib/server-db", () => ({
      getDb: vi.fn(() => {
        throw new Error("SQLite should not be used in postgres mode");
      }),
    }));
    vi.doMock("@/lib/postgres", () => ({
      getDatabaseDriver: () => "postgres",
      isPostgresConfigured: () => true,
      withPostgresClient: async (fn: (client: { query: typeof query }) => Promise<unknown>) => fn({ query }),
    }));
    vi.doMock("@/lib/memory/postgres-memory", () => memory);

    const route = await import("@/app/api/agent/persist-eval/route");
    const response = await route.POST(new Request("http://localhost/api/agent/persist-eval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: "深圳华启数智科技有限公司",
        role: "数据产品经理",
        overallScore: 2,
        archetype: "AI产品经理",
        legitimacy: "normal",
        blocks,
        keywords,
        jdText,
        date: "2026-06-15",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.reportReadBackVerified).toBe(true);
    expect(json.jdReadBackVerified).toBe(true);
    expect(json.reportNum).toBe(1);
    expect(json.jdId).toBe(101);
    expect(queries).toContain("BEGIN");
    expect(queries).toContain("COMMIT");
    expect(queries).not.toContain("ROLLBACK");
    expect(memory.indexMemorySourceBestEffort).toHaveBeenCalled();
  });

  it("rolls back the PostgreSQL transaction when JD read-back verification fails", async () => {
    vi.resetModules();
    process.env.DB_DRIVER = "postgres";
    process.env.DATABASE_URL = "postgres://example/test";
    const queries: string[] = [];
    let reportSourceHash = "";
    const memory = {
      indexMemorySourceBestEffort: vi.fn(async () => undefined),
      createMemoryItem: vi.fn(async () => 42),
      addMemoryEvidence: vi.fn(async () => undefined),
    };
    const jdText = "岗位职责：负责 AI 产品规划、Agent 工作流设计、RAG 知识库建设、评测体系搭建和跨团队落地。任职要求：熟悉大模型应用、数据分析、Prompt Engineering 和产品交付。";
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push(sql);
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return { rows: [], rowCount: null };
      if (sql.includes("MAX(num)")) return { rows: [{ max: 0 }], rowCount: 1 };
      if (sql.includes("SELECT * FROM reports WHERE source_hash")) return { rows: [], rowCount: 0 };
      if (sql.includes("MAX(report_num)")) return { rows: [{ max: 0 }], rowCount: 1 };
      if (sql.includes("INSERT INTO applications")) return { rows: [], rowCount: 1 };
      if (sql.includes("INSERT INTO reports")) {
        reportSourceHash = String(params[10] || "");
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("SELECT * FROM reports WHERE report_num")) {
        return {
          rows: [{
            report_num: 1,
            date: "2026-06-15",
            company: "深圳华启数智科技有限公司",
            role: "数据产品经理",
            archetype: "AI产品经理",
            overall_score: 2,
            legitimacy: "normal",
            blocks_json: { a: { content: "方向匹配", score: 3.5 } },
            keywords_json: ["AI产品"],
            source_hash: reportSourceHash,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes("INSERT INTO jds")) return { rows: [{ id: 101 }], rowCount: 1 };
      if (sql.includes("SELECT * FROM jds WHERE id")) {
        return {
          rows: [{
            id: 101,
            company: "深圳华启数智科技有限公司",
            role: "数据产品经理",
            source_type: "agent",
            source_url: "",
            body: "truncated body",
            keywords_json: ["AI产品"],
            report_id: 1,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: async () => ({
        userId: TEST_USER_ID,
        username: "persist-eval-user",
        role: "member",
        tokenVersion: 0,
      }),
    }));
    vi.doMock("@/lib/server-db", () => ({
      getDb: vi.fn(() => {
        throw new Error("SQLite should not be used in postgres mode");
      }),
    }));
    vi.doMock("@/lib/postgres", () => ({
      getDatabaseDriver: () => "postgres",
      isPostgresConfigured: () => true,
      withPostgresClient: async (fn: (client: { query: typeof query }) => Promise<unknown>) => fn({ query }),
    }));
    vi.doMock("@/lib/memory/postgres-memory", () => memory);

    const route = await import("@/app/api/agent/persist-eval/route");
    const response = await route.POST(new Request("http://localhost/api/agent/persist-eval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: "深圳华启数智科技有限公司",
        role: "数据产品经理",
        overallScore: 2,
        archetype: "AI产品经理",
        legitimacy: "normal",
        blocks: { a: { content: "方向匹配", score: 3.5 } },
        keywords: ["AI产品"],
        jdText,
        date: "2026-06-15",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.reportReadBackVerified).toBe(true);
    expect(json.jdReadBackVerified).toBe(false);
    expect(queries).toContain("BEGIN");
    expect(queries).toContain("ROLLBACK");
    expect(queries).not.toContain("COMMIT");
    expect(memory.indexMemorySourceBestEffort).not.toHaveBeenCalled();
  });
});
