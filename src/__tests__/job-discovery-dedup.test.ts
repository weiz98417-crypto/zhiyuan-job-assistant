import { describe, expect, it } from "vitest";
import { makeDedupKey, normalizeJobUrl } from "../../lib/scan/orchestrator.mjs";

describe("job discovery URL deduplication", () => {
  it("normalizes common URL variants to the same canonical job URL", () => {
    const variants = [
      " https://jobs.example.com/job/123 ",
      "https://JOBS.EXAMPLE.com/job/123/",
      "https://jobs.example.com/job/123?utm_source=wechat&utm_campaign=share",
      "https://jobs.example.com/job/123?spm=a2c4g.11186623.0.0#detail",
      "https://jobs.example.com/job/123#from-chat",
    ];

    expect(variants.map(normalizeJobUrl)).toEqual([
      "https://jobs.example.com/job/123",
      "https://jobs.example.com/job/123",
      "https://jobs.example.com/job/123",
      "https://jobs.example.com/job/123",
      "https://jobs.example.com/job/123",
    ]);
    expect(new Set(variants.map(makeDedupKey)).size).toBe(1);
  });

  it("preserves meaningful query params and sorts them before hashing", () => {
    const left = "https://jobs.example.com/job/detail?jobId=123&dept=pm&utm_medium=social";
    const right = "https://jobs.example.com/job/detail?dept=pm&jobId=123#section";

    expect(normalizeJobUrl(left)).toBe("https://jobs.example.com/job/detail?dept=pm&jobId=123");
    expect(normalizeJobUrl(right)).toBe("https://jobs.example.com/job/detail?dept=pm&jobId=123");
    expect(makeDedupKey(left)).toBe(makeDedupKey(right));
  });
});
