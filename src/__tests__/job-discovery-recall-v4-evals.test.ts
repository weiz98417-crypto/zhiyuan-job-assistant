import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSearchIndexQueries } from "../../lib/scan/query-expansion.mjs";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf-8");
}

describe("job discovery recall v4 evals - baseline", () => {
  it("B1 supports legal user-provided browser sessions without bypassing platform checks", () => {
    const worker = source("scripts/scan-worker.mjs");

    expect(worker).toContain("SCAN_BROWSER_STORAGE_STATE");
    expect(worker).toContain("SCAN_BROWSER_COOKIES_JSON");
    expect(worker).toContain("resolveBrowserStorageState");
    expect(worker).toContain("parseBrowserCookies");
    expect(worker).toContain("storageState");
    expect(worker).toContain("context.addCookies");
    expect(worker).not.toMatch(/bypass|stealth|undetected|captcha solver|2captcha/i);
  });

  it("B2 adds more domestic discovery sources to the board scanner chain", () => {
    const fallback = source("lib/scan/job-board-fallback.mjs");

    for (const text of [
      "async function searchLagou",
      "async function searchKanzhun",
      "async function searchNowcoder",
      "async function searchMaimai",
      '{ name: "拉勾", fn: searchLagou }',
      '{ name: "看准", fn: searchKanzhun }',
      '{ name: "牛客", fn: searchNowcoder }',
      '{ name: "脉脉", fn: searchMaimai }',
    ]) {
      expect(fallback).toContain(text);
    }
  });
});

describe("job discovery recall v4 evals - boundary", () => {
  it("E1 upgrades search-index leads only after detail-page verification", () => {
    const fallback = source("lib/scan/job-board-fallback.mjs");

    expect(fallback).toContain("SEARCH_INDEX_VERIFY_LIMIT");
    expect(fallback).toContain("async function verifySearchIndexLead");
    expect(fallback).toContain('source_type: "search_index_verified"');
    expect(fallback).toContain('verification_status: "verified_jd"');
    expect(fallback).toContain("verified_from_search_index: true");
    expect(fallback).toContain("detail.text.length >= 120");
    expect(fallback).toContain("matchesExpandedJob(upgraded, titleFilter)");
  });

  it("E2 keeps blocked or insufficient detail pages as leads instead of pretending they are JDs", () => {
    const fallback = source("lib/scan/job-board-fallback.mjs");

    expect(fallback).toContain('verification_status: "blocked_detail"');
    expect(fallback).toContain('verify_error: "blocked_detail"');
    expect(fallback).toContain('verify_error: "insufficient_or_unmatched_detail"');
    expect(fallback).toContain('verification_status: "lead"');
  });
});

describe("job discovery recall v4 evals - regression", () => {
  it("R1 expands domestic search-index domains for Hangzhou AI PM discovery", () => {
    const queries = buildSearchIndexQueries({ positive: ["AI 产品经理"], negative: [] }, { location: "杭州" });

    expect(queries).toEqual(expect.arrayContaining([
      "site:lagou.com 杭州 AI 产品经理",
      "site:kanzhun.com 杭州 AI 产品经理",
      "site:dajie.com 杭州 AI 产品经理",
      "site:shixiseng.com 杭州 AI 产品经理",
    ]));
    expect(queries.length).toBeGreaterThan(24);
  });

  it("R2 does not introduce simulated or fabricated job result copy", () => {
    const fallback = source("lib/scan/job-board-fallback.mjs");
    const worker = source("scripts/scan-worker.mjs");

    for (const text of [fallback, worker]) {
      expect(text).not.toMatch(/模拟搜索结果|典型样例|仅供参考，非实时|虚构|fake job|mock job/i);
    }
  });
});
