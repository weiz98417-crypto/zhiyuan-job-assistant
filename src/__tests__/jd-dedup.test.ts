import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type ServerDbModule = typeof import("@/lib/server-db");

let dataDir: string | null = null;
let serverDb: ServerDbModule | null = null;

async function loadServerDb() {
  vi.resetModules();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyuan-jd-dedup-"));
  process.env.DATA_DIR = dataDir;
  process.env.DB_DRIVER = "sqlite";
  delete process.env.ALLOW_SQLITE_LEGACY;
  serverDb = await import("@/lib/server-db");
  return serverDb;
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

describe("JD deduplication", () => {
  it("reuses an existing JD by source URL before checking body text", async () => {
    const { findReusableJD, insertJD } = await loadServerDb();
    const jdId = insertJD({
      company: "深圳样例科技",
      role: "AI 产品经理",
      source_type: "discovery",
      source_url: "https://jobs.example.com/detail/ai-pm",
      body: "原始 JD 正文：负责 AI 产品规划、需求拆解、跨团队协作。",
      keywords_json: "[]",
    });

    const reusable = findReusableJD({
      source_url: "https://jobs.example.com/detail/ai-pm",
      body: "这是一段不同的手动粘贴正文，URL 命中时仍应优先复用已有 JD。",
    });

    expect(reusable?.id).toBe(jdId);
    expect(reusable?.company).toBe("深圳样例科技");
  });

  it("reuses an existing JD by normalized body when source URL is new", async () => {
    const { findReusableJD, insertJD } = await loadServerDb();
    const canonicalBody = [
      "岗位职责:",
      "负责 AI 产品规划 和 Agent 场景落地。",
      "任职要求:",
      "熟悉 LLM 应用、数据分析和跨团队项目推进。",
    ].join("\n");
    const jdId = insertJD({
      company: "杭州样例智能",
      role: "Agent 产品经理",
      source_type: "discovery",
      source_url: "https://jobs.example.com/detail/agent-pm-old",
      body: canonicalBody,
      keywords_json: "[]",
    });

    const reusable = findReusableJD({
      source_url: "https://jobs.example.com/detail/agent-pm-new",
      body: " 岗位职责:   负责 AI 产品规划 和 Agent 场景落地。 任职要求: 熟悉 LLM 应用、数据分析和跨团队项目推进。 ",
    });

    expect(reusable?.id).toBe(jdId);
    expect(reusable?.role).toBe("Agent 产品经理");
  });
});
