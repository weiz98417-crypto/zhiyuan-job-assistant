import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Regression: ISSUE-ONLINE-005 — waiting_user toolbar still said the Agent was processing
// Found by /qa on 2026-08-28
// Report: .gstack/qa-reports/qa-report-121-43-198-13-2026-08-28.md
describe("waiting_user run toolbar regression", () => {
  it("labels waiting and paused Runs without claiming they are still processing", () => {
    // 0.11.0-D 任务 5.3:工具条迁至 AgentRunToolbar 组件。
    const source = readFileSync(path.join(process.cwd(), "src/components/agent/AgentRunToolbar.tsx"), "utf8");

    expect(source).toContain('status === "waiting_user"');
    expect(source).toContain('status === "paused"');
    expect(source).toContain('等待你的回复');
    expect(source).toContain('任务已暂停');
  });
});
