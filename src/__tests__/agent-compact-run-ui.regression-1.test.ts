import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("compact Agent run controls regression", () => {
  it("uses a compact toolbar instead of a full-width card", () => {
    // 0.11.0-D 任务 5.3:工具条迁至 AgentRunToolbar 组件。
    const toolbar = readFileSync(path.join(process.cwd(), "src/components/agent/AgentRunToolbar.tsx"), "utf8");

    expect(toolbar).toContain('data-testid="agent-run-toolbar"');
    expect(toolbar).toContain("h-8");
    expect(toolbar).toContain("w-fit");
    expect(toolbar).not.toContain("rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2");
  });
});
