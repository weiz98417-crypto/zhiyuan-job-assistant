import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf-8");
}

describe("Discovery UI", () => {
  it("shows lightweight scan job state badges on discovery cards", () => {
    const page = source("src/app/discover/page.tsx");

    expect(page).toContain("DISCOVERY_VISIBLE_STATUSES");
    expect(page).toContain("DISCOVERY_JOB_STATUS_BADGES");
    expect(page).toContain("jobStatusBadge(job.status)");
    expect(page).toContain("新发现");
    expect(page).toContain("已查看");
    expect(page).toContain("已保存");
    expect(page).toContain("已评估");
    expect(page).toContain("已跳过");
    expect(page).toContain("status=${status}");
  });
});
