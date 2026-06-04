import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type ServerDbModule = typeof import("@/lib/server-db");
type DiscoveryJdRoute = typeof import("@/app/api/scan/jobs/[id]/jd/route");

const TEST_USER_ID = "user-discovery-save";

let dataDir: string | null = null;
let serverDb: ServerDbModule | null = null;

async function loadRouteHarness() {
  vi.resetModules();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyuan-discovery-save-"));
  process.env.DATA_DIR = dataDir;
  process.env.DB_DRIVER = "sqlite";
  delete process.env.ALLOW_SQLITE_LEGACY;

  vi.doMock("@/lib/auth", () => ({
    getCurrentUser: async () => ({
      userId: TEST_USER_ID,
      username: "discovery-save-user",
      role: "member",
      tokenVersion: 0,
    }),
  }));

  serverDb = await import("@/lib/server-db");
  const route = await import("@/app/api/scan/jobs/[id]/jd/route");
  const db = serverDb.getDb();
  db.prepare(
    "INSERT INTO users (id, username, password_hash, display_name, role, status, token_version) VALUES (?, ?, ?, ?, ?, ?, 0)",
  ).run(TEST_USER_ID, "discovery-save-user", "hash", "Discovery Save User", "member", "active");
  db.prepare("INSERT INTO scan_queue (id, user_id, status) VALUES (?, ?, ?)").run("scan-save-1", TEST_USER_ID, "done");
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

function insertScanJob(db: ServerDbModule extends { getDb: () => infer T } ? T : never, overrides: Partial<{
  company: string;
  title: string;
  url: string;
  dedupKey: string;
}> = {}) {
  const company = overrides.company || "深圳样例科技";
  const title = overrides.title || "AI 产品经理";
  const url = overrides.url || "https://jobs.example.com/detail/ai-product-manager";
  const dedupKey = overrides.dedupKey || `scan-job-${Date.now()}-${Math.random()}`;
  const result = db.prepare(`
    INSERT INTO scan_jobs (scan_id, user_id, company, title, url, location, department, jd_snippet, status, dedup_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run("scan-save-1", TEST_USER_ID, company, title, url, "深圳", "产品部", "", "viewed", dedupKey);
  return Number(result.lastInsertRowid);
}

async function postSave(route: DiscoveryJdRoute, jobId: number, body: Record<string, unknown>) {
  const request = new Request(`http://localhost/api/scan/jobs/${jobId}/jd`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return route.POST(request as never, { params: Promise.resolve({ id: String(jobId) }) });
}

describe("Discovery save-from-JD API", () => {
  it("creates a discovery-sourced JD and marks the scan job saved", async () => {
    const { db, route } = await loadRouteHarness();
    const jobId = insertScanJob(db);
    const jdBody = "岗位职责：负责 AI 产品规划、需求拆解、Agent 场景落地和跨团队项目推进。任职要求：熟悉 LLM 应用、数据分析和产品交付。";

    const response = await postSave(route, jobId, {
      jdBody,
      company: "深圳样例科技",
      role: "AI 产品经理",
      evaluate: false,
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.reused).toBe(false);
    expect(json.jdId).toBeGreaterThan(0);

    const jd = db.prepare("SELECT * FROM jds WHERE id = ?").get(json.jdId) as { source_type: string; source_url: string; body: string } | undefined;
    const job = db.prepare("SELECT jd_id, status, last_error FROM scan_jobs WHERE id = ?").get(jobId) as { jd_id: number; status: string; last_error: string };
    expect(jd?.source_type).toBe("discovery");
    expect(jd?.source_url).toBe("https://jobs.example.com/detail/ai-product-manager");
    expect(jd?.body).toBe(jdBody);
    expect(job.jd_id).toBe(json.jdId);
    expect(job.status).toBe("saved");
    expect(job.last_error).toBe("");
  });

  it("reuses an existing discovery JD and marks the scan job evaluating", async () => {
    const { db, route } = await loadRouteHarness();
    const url = "https://jobs.example.com/detail/agent-product-manager";
    const existingJdId = db.prepare(`
      INSERT INTO jds (company, role, source_type, source_url, body, keywords_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("杭州样例智能", "Agent 产品经理", "discovery", url, "已有 JD 正文：负责 Agent 产品规划、LLM 应用落地和数据分析。", "[]").lastInsertRowid;
    const jobId = insertScanJob(db, {
      company: "杭州样例智能",
      title: "Agent 产品经理",
      url,
      dedupKey: "agent-product-manager-url",
    });

    const response = await postSave(route, jobId, {
      jdBody: "新的粘贴正文不同，但 URL 已经存在，应复用已有 JD，避免 Discovery 重复沉淀同一个岗位。",
      company: "杭州样例智能",
      role: "Agent 产品经理",
      evaluate: true,
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.reused).toBe(true);
    expect(json.jdId).toBe(Number(existingJdId));

    const job = db.prepare("SELECT jd_id, status, last_error FROM scan_jobs WHERE id = ?").get(jobId) as { jd_id: number; status: string; last_error: string };
    expect(job.jd_id).toBe(Number(existingJdId));
    expect(job.status).toBe("evaluating");
    expect(job.last_error).toBe("");
  });
});
