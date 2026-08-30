import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Regression: ISSUE-ONLINE-005 — waiting_user toolbar still said the Agent was processing
// Found by /qa on 2026-08-28
// Report: .gstack/qa-reports/qa-report-121-43-198-13-2026-08-28.md
describe("waiting_user run toolbar regression", () => {
  it("labels waiting and paused Runs without claiming they are still processing", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/agent/page.tsx"), "utf8");

    expect(source).toContain('activeRunNotice.status === "waiting_user"');
    expect(source).toContain('activeRunNotice.status === "paused"');
    expect(source).toContain('等待你的回复');
    expect(source).toContain('任务已暂停');
  });
});
