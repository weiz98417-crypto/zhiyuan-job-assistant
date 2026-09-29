import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_USER_ID = "scan-evaluation-status-user";
let dataDir: string | null = null;
let serverDb: typeof import("@/lib/server-db") | null = null;

async function loadHarness() {
  vi.resetModules();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyuan-scan-evaluation-status-"));
  process.env.DATA_DIR = dataDir;
  process.env.DB_DRIVER = "sqlite";
  delete process.env.ALLOW_SQLITE_LEGACY;

  serverDb = await import("@/lib/server-db");
  const scanData = await import("@/lib/scan-data");
  const db = serverDb.getDb();
  db.prepare(
    "INSERT INTO users (id, username, password_hash, display_name, role, status, token_version) VALUES (?, ?, ?, ?, ?, ?, 0)",
  ).run(TEST_USER_ID, "scan-evaluation-status-user", "hash", "Scan Evaluation Status User", "member", "active");
  db.prepare("INSERT INTO scan_queue (id, user_id, status) VALUES (?, ?, ?)").run("scan-status-1", TEST_USER_ID, "done");
  return { db, scanData };
}

afterEach(() => {
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

describe("discovery evaluation status write-back", () => {
  it("marks linked saved/evaluating jobs evaluated after a successful evaluation", async () => {
    const { db, scanData } = await loadHarness();
    const jdId = Number(db.prepare(`
      INSERT INTO jds (user_id, company, role, source_type, source_url, body, keywords_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      TEST_USER_ID,
      "纸鸢科技",
      "AI 产品经理",
      "discovery",
      "https://jobs.example.com/ai-pm",
      "岗位职责：负责 AI 产品规划、用户研究、Agent 场景落地和跨团队交付。任职要求：熟悉 LLM 应用。",
      "[]",
    ).lastInsertRowid);
    const insertJob = (status: string, suffix: string) => db.prepare(`
      INSERT INTO scan_jobs (scan_id, user_id, company, title, url, jd_id, status, dedup_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "scan-status-1",
      TEST_USER_ID,
      "纸鸢科技",
      "AI 产品经理",
      `https://jobs.example.com/ai-pm/${suffix}`,
      jdId,
      status,
      `status-${suffix}`,
    );

    insertJob("evaluating", "evaluating");
    insertJob("saved", "saved");
    insertJob("dismissed", "dismissed");

    const result = await scanData.markScanJobsEvaluatedForJdForUser(jdId, TEST_USER_ID);
    expect(result.updated).toBe(2);

    const rows = db.prepare("SELECT status FROM scan_jobs WHERE jd_id = ? ORDER BY id").all(jdId) as Array<{ status: string }>;
    expect(rows.map((row) => row.status)).toEqual(["evaluated", "evaluated", "dismissed"]);
  });

  it("does not mutate a job when the source JD id is invalid", async () => {
    const { scanData } = await loadHarness();
    await expect(scanData.markScanJobsEvaluatedForJdForUser(0, TEST_USER_ID)).resolves.toEqual({ updated: 0 });
  });
});
