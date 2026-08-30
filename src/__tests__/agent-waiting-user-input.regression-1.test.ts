import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Regression: ISSUE-ONLINE-001 — waiting_user runs kept the composer disabled
// Found by /qa on 2026-08-28
// Report: .gstack/qa-reports/qa-report-121-43-198-13-2026-08-28.md
describe("waiting_user Agent input regression", () => {
  it("enables user input while keeping the durable observer alive", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/agent/page.tsx"), "utf8");
    const start = source.indexOf("const notice = activeRunNotice;");
    const end = source.indexOf("return observeDurableAgentRun(runId", start);
    const observer = source.slice(start, end);

    expect(observer).toContain('setStreaming(notice.status !== "waiting_user")');
    expect(observer).toContain('if (notice.status === "waiting_user") setPhase(null);');
    expect(observer).not.toContain('if (notice.status === "waiting_user") {');
  });
});
