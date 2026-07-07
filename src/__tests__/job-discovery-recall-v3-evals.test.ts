import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyJobMatch, expandTitleFilter } from "../../lib/scan/query-expansion.mjs";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf-8");
}

describe("job discovery recall v3 evals - baseline", () => {
  it("B1 persists source-level scan observability across schema and worker paths", () => {
    const schema = source("src/lib/postgres-schema.sql");
    const serverDb = source("src/lib/server-db.ts");
    const worker = source("scripts/scan-worker.mjs");
    const scanData = source("src/lib/scan-data.ts");

    expect(schema).toContain("CREATE TABLE IF NOT EXISTS scan_source_runs");
    expect(serverDb).toContain("CREATE TABLE IF NOT EXISTS scan_source_runs");
    expect(worker).toContain("recordSourceRun(scanId, userId");
    expect(scanData).toContain("FROM scan_source_runs WHERE scan_id");
    expect(scanData).toContain("parsed");
    expect(scanData).toContain("deduped");
  });

  it("B2 exposes source, verification and match metadata on Discover and Agent cards", () => {
    const discover = source("src/app/discover/page.tsx");
    const chat = source("src/components/agent/AgentChat.tsx");

    for (const text of [discover, chat]) {
      expect(text).toContain("source_name");
      expect(text).toContain("verification_status");
      expect(text).toContain("match_confidence");
      expect(text).toContain("待校验线索");
      expect(text).toContain("详情受阻");
    }
    expect(discover).toContain('activeTab, setActiveTab] = useState<"results" | "sources" | "history">');
    expect(chat).toContain("已尝试来源");
  });
});

describe("job discovery recall v3 evals - boundary", () => {
  it("E1 keeps AI product manager roles and filters obvious engineering role pollution", () => {
    expect(classifyJobMatch({ title: "AI 产品经理", jd_snippet: "负责大模型应用产品设计" })).toMatchObject({
      keep: true,
      confidence: "high",
    });
    expect(classifyJobMatch({ title: "大模型产品专家", jd_snippet: "AI Agent 平台" })).toMatchObject({
      keep: true,
    });
    expect(classifyJobMatch({ title: "AI 全栈工程师", jd_snippet: "负责大模型应用研发" })).toMatchObject({
      keep: false,
      reason: "engineering_role_title",
    });
    expect(classifyJobMatch({ title: "算法工程师", jd_snippet: "推荐系统与 NLP" })).toMatchObject({
      keep: false,
    });
  });

  it("E2 expands Hangzhou AI PM intent without dropping negative filters", () => {
    const expanded = expandTitleFilter({ positive: ["AI 产品经理"], negative: ["实习", "销售"] });

    expect(expanded.positive).toEqual(expect.arrayContaining([
      "大模型产品经理",
      "AIGC 产品经理",
      "智能体产品经理",
      "AI 应用产品经理",
    ]));
    expect(expanded.negative).toEqual(["实习", "销售"]);
  });

  it("E3 strips WAF and captcha pollution instead of saving it as JD detail", () => {
    const fallback = source("lib/scan/job-board-fallback.mjs");
    const worker = source("scripts/scan-worker.mjs");

    expect(fallback).toContain("looksBlockedText");
    expect(fallback).toContain("CF_APP_WAF");
    expect(fallback).toContain("verification_status: \"blocked_detail\"");
    expect(worker).toContain("cleanSnippet(job)");
    expect(worker).toContain("verificationStatusForJob(job)");
  });
});

describe("job discovery recall v3 evals - regression", () => {
  it("R1 prevents one source from monopolizing fallback results", () => {
    const fallback = source("lib/scan/job-board-fallback.mjs");

    expect(fallback).toContain("SCAN_SOURCE_RESULT_QUOTA");
    expect(fallback).toContain("SOURCE_RESULT_QUOTA");
    expect(fallback).toContain("sourceLimited(");
    expect(fallback).toContain("finalizeSourceJobs");
  });

  it("R2 adds Hangzhou company seeds for local AI product-manager recall", () => {
    const worker = source("scripts/scan-worker.mjs");

    expect(worker).toContain("HANGZHOU_SEED_COMPANIES");
    expect(worker).toContain("同花顺");
    expect(worker).toContain("恒生电子");
    expect(worker).toContain("海康威视");
    expect(worker).toContain("withHangzhouSeeds(await loadPortals");
  });

  it("R3 updates the visible scan total after location-specific seeds are added", () => {
    const worker = source("scripts/scan-worker.mjs");

    expect(worker).toContain("updateCompaniesTotal(scanId, companiesTotal)");
    expect(worker).toContain("SET companies_total = ?");
    expect(worker).toContain("SET companies_total = $1");
    expect(worker).toContain("await store.updateCompaniesTotal(scanId, filtered.length)");
  });

  it("R4 migrates and restores source-run observability as user-private data", () => {
    const repositories = source("src/lib/data-repositories.ts");
    const migration = source("scripts/lib/sqlite-postgres-migration.mjs");
    const restore = source("scripts/restore-postgres.mjs");

    expect(repositories).toContain('"scan_source_runs"');
    expect(migration).toContain('table("scan_source_runs", { userOwned: true, jsonColumns: ["metrics_json"] })');
    expect(migration).toContain('jsonColumns: ["source_metadata_json"]');
    expect(restore.indexOf('"scan_queue"')).toBeLessThan(restore.indexOf('"scan_source_runs"'));
    expect(restore.indexOf('"scan_source_runs"')).toBeLessThan(restore.indexOf('"scan_jobs"'));
  });
});
