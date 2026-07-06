import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSearchIndexQueries, expandTitleFilter, matchesExpandedJob } from "../../lib/scan/query-expansion.mjs";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf-8");
}

describe("job discovery recall v2 evals - baseline", () => {
  it("B1 wires BOSS before legacy job boards and keeps domestic search-index leads", () => {
    const fallback = source("lib/scan/job-board-fallback.mjs");

    expect(fallback.indexOf("BOSS直聘")).toBeLessThan(fallback.indexOf("智联招聘"));
    expect(fallback).toContain("https://www.zhipin.com/web/geek/job");
    expect(fallback).toContain('["杭州", "101210100"]');
    expect(fallback).toContain("https://www.so.com/s?q=");
    expect(fallback).toContain("https://www.baidu.com/s?wd=");
    expect(fallback).toContain("待校验线索｜搜索索引");
  });
});

describe("job discovery recall v2 evals - boundary", () => {
  it("E1 expands AI product-manager intent without disabling negative filters", () => {
    const expanded = expandTitleFilter({ positive: ["AI 产品经理"], negative: ["实习", "销售"] });

    expect(expanded.positive).toContain("大模型产品经理");
    expect(expanded.positive).toContain("AIGC 产品经理");
    expect(expanded.positive).toContain("智能体产品经理");
    expect(expanded.negative).toEqual(["实习", "销售"]);
    expect(matchesExpandedJob({ title: "大模型产品专家", jd_snippet: "AI 应用平台" }, expanded)).toBe(true);
    expect(matchesExpandedJob({ title: "AI 产品经理实习生" }, expanded)).toBe(false);
  });

  it("E2 builds domestic-source index queries for Hangzhou searches", () => {
    const queries = buildSearchIndexQueries({ positive: ["AI 产品经理"], negative: [] }, { location: "杭州" });

    expect(queries.some((query) => query.includes("杭州") && query.includes("site:zhipin.com"))).toBe(true);
    expect(queries.some((query) => query.includes("杭州") && query.includes("site:nowcoder.com"))).toBe(true);
    expect(queries.some((query) => query.includes("杭州") && query.includes("大模型产品经理"))).toBe(true);
  });
});

describe("job discovery recall v2 evals - regression", () => {
  it("R1 low-recall scans fall back before true zero", () => {
    const worker = source("scripts/scan-worker.mjs");

    expect(worker).toContain("SCAN_MIN_RESULTS_BEFORE_FALLBACK");
    expect(worker).toContain("jobsNew < SCAN_MIN_RESULTS_BEFORE_FALLBACK");
    expect(worker).toContain("BOSS/Zhaopin/Liepin/51job/search-index leads");
  });

  it("R2 zero-result scans expose a strategy card in Agent Chat", () => {
    const worker = source("scripts/scan-worker.mjs");
    const chat = source("src/components/agent/AgentChat.tsx");

    expect(worker).toContain("zero_result_strategy");
    expect(chat).toContain("function JobDiscoveryZeroResultStrategyCard");
    expect(chat).toContain("0 结果策略卡");
    expect(chat).toContain("BOSS直聘、智联招聘、猎聘、前程无忧、国内搜索索引");
    expect(chat).toContain("用大模型产品经理、AIGC 产品经理、智能体产品经理、AI 应用产品经理");
  });
});
