import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type ServerDbModule = typeof import("@/lib/server-db");
type ScanJobsRoute = typeof import("@/app/api/scan/jobs/route");

const TEST_USER_ID = "user-scan-jobs-api";

let dataDir: string | null = null;
let serverDb: ServerDbModule | null = null;

async function loadHarness() {
  vi.resetModules();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyuan-scan-jobs-api-"));
  process.env.DATA_DIR = dataDir;
  process.env.DB_DRIVER = "sqlite";
  delete process.env.ALLOW_SQLITE_LEGACY;

  vi.doMock("@/lib/auth", () => ({
    getCurrentUser: async () => ({
      userId: TEST_USER_ID,
      username: "scan-jobs-api-user",
      role: "member",
      tokenVersion: 0,
    }),
  }));

  serverDb = await import("@/lib/server-db");
  const route = await import("@/app/api/scan/jobs/route");
  const { getScanJobsForRun } = await import("@/lib/scan-data");
  const db = serverDb.getDb();
  db.prepare(
    "INSERT INTO users (id, username, password_hash, display_name, role, status, token_version) VALUES (?, ?, ?, ?, ?, ?, 0)",
  ).run(TEST_USER_ID, "scan-jobs-api-user", "hash", "Scan Jobs API User", "member", "active");
  db.prepare("INSERT INTO scan_queue (id, user_id, status) VALUES (?, ?, ?)").run("scan-api-1", TEST_USER_ID, "done");
  db.prepare("INSERT INTO scan_queue (id, user_id, status) VALUES (?, ?, ?)").run("scan-api-2", TEST_USER_ID, "done");
  return { db, route, getScanJobsForRun };
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

function insertJob(
  db: ServerDbModule extends { getDb: () => infer T } ? T : never,
  input: { scanId: string; status: string; title: string; discoveredAt: string },
) {
  db.prepare(`
    INSERT INTO scan_jobs (
      scan_id, user_id, company, title, url, location, department,
      jd_snippet, status, dedup_key, discovered_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.scanId,
    TEST_USER_ID,
    "Example",
    input.title,
    `https://jobs.example.com/${input.scanId}/${encodeURIComponent(input.title)}`,
    "上海",
    "产品",
    "",
    input.status,
    `${input.scanId}-${input.title}`,
    input.discoveredAt,
  );
}

async function getJson(route: ScanJobsRoute, query: string) {
  const response = await route.GET(new Request(`http://localhost/api/scan/jobs${query}`) as never);
  return { response, json: await response.json() };
}

describe("scan jobs API", () => {
  it("filters scan jobs by scanId without leaking other scan results", async () => {
    const { db, route } = await loadHarness();
    insertJob(db, { scanId: "scan-api-1", status: "new", title: "AI 产品经理", discoveredAt: "2026-01-01 10:00:00" });
    insertJob(db, { scanId: "scan-api-1", status: "viewed", title: "Agent 产品经理", discoveredAt: "2026-01-01 11:00:00" });
    insertJob(db, { scanId: "scan-api-2", status: "new", title: "增长产品经理", discoveredAt: "2026-01-01 12:00:00" });

    const { response, json } = await getJson(route, "?scanId=scan-api-1&status=all&limit=10");

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.total).toBe(2);
    expect(json.data.jobs.map((job: { title: string }) => job.title)).toEqual(["Agent 产品经理", "AI 产品经理"]);
    expect(json.data.jobs.every((job: { scan_id: string }) => job.scan_id === "scan-api-1")).toBe(true);
  });

  it("supports incremental polling with after", async () => {
    const { db, route } = await loadHarness();
    insertJob(db, { scanId: "scan-api-1", status: "new", title: "旧岗位", discoveredAt: "2026-01-01 10:00:00" });
    insertJob(db, { scanId: "scan-api-1", status: "new", title: "新岗位", discoveredAt: "2026-01-01 12:00:00" });

    const { response, json } = await getJson(route, "?scanId=scan-api-1&after=2026-01-01%2010%3A00%3A00");

    expect(response.status).toBe(200);
    expect(json.data.total).toBe(1);
    expect(json.data.jobs[0].title).toBe("新岗位");
  });

  it("gets all jobs for a run through the shared helper when status is omitted", async () => {
    const { db, getScanJobsForRun } = await loadHarness();
    insertJob(db, { scanId: "scan-api-1", status: "new", title: "新发现", discoveredAt: "2026-01-01 10:00:00" });
    insertJob(db, { scanId: "scan-api-1", status: "dismissed", title: "已跳过", discoveredAt: "2026-01-01 11:00:00" });

    const result = await getScanJobsForRun(TEST_USER_ID, "scan-api-1", { limit: 10 });

    expect(result.total).toBe(2);
    expect(result.jobs.map((job) => job.status)).toEqual(["dismissed", "new"]);
  });
});
