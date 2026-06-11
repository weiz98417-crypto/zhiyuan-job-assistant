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
    expect(json.jdReadBackVerified).toBe(true);

    const jd = db.prepare("SELECT * FROM jds WHERE id = ?").get(json.jdId) as { company: string; role: string; body: string; report_id: number } | undefined;
    expect(jd).toMatchObject({
      company: "深圳评估科技",
      role: "AI 产品经理",
      body: jdText,
      report_id: 1,
    });
  });
});
