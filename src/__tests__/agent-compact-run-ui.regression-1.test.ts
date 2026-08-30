import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("compact Agent run controls regression", () => {
  it("uses a compact toolbar instead of a full-width card", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/agent/page.tsx"), "utf8");
    const start = source.indexOf("{activeRunNotice && (");
    const end = source.indexOf("{latestRollbackProposal && (", start);
    const toolbar = source.slice(start, end);

    expect(toolbar).toContain('data-testid="agent-run-toolbar"');
    expect(toolbar).toContain("h-8");
    expect(toolbar).toContain("w-fit");
    expect(toolbar).not.toContain("rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2");
  });
});
