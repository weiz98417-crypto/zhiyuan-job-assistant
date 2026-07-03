import { describe, expect, it } from "vitest";
import { getWeakDuplicateHintCounts, jobFingerprint, mergeJobDiscoveryItems } from "@/lib/job-discovery";

describe("job discovery frontend fingerprint", () => {
  it("uses the normalized URL as the shared card fingerprint", () => {
    expect(jobFingerprint({ id: 1, url: "https://jobs.example.com/job/123?utm_source=chat#detail" }))
      .toBe(jobFingerprint({ id: 2, url: "https://jobs.example.com/job/123/" }));
  });

  it("merges URL variants and keeps the most progressed card state", () => {
    const merged = mergeJobDiscoveryItems([
      {
        id: 1,
        url: "https://jobs.example.com/job/123?utm_source=chat",
        status: "new",
        discovered_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: 2,
        url: "https://jobs.example.com/job/123/#detail",
        status: "saved",
        jd_id: 88,
        discovered_at: "2025-01-01T00:00:00.000Z",
      },
      {
        id: 3,
        url: "https://jobs.example.com/job/456",
        status: "new",
        discovered_at: "2026-01-02T00:00:00.000Z",
      },
    ]);

    expect(merged.map((job) => job.id)).toEqual([2, 3]);
  });

  it("hints weak duplicates without merging different normalized URLs", () => {
    const jobs = [
      {
        id: 1,
        company: "Example",
        title: "AI Product Manager",
        location: "Shanghai",
        url: "https://jobs.example.com/job/123",
        status: "new",
      },
      {
        id: 2,
        company: "example",
        title: "AI Product Manager (Platform)",
        location: " Shanghai ",
        url: "https://jobs.example.com/job/456",
        status: "new",
      },
    ] as const;

    expect(mergeJobDiscoveryItems([...jobs]).map((job) => job.id)).toEqual([1, 2]);
    const hints = getWeakDuplicateHintCounts([...jobs]);
    expect(hints.get(jobFingerprint(jobs[0]))).toBe(1);
    expect(hints.get(jobFingerprint(jobs[1]))).toBe(1);
  });
});
