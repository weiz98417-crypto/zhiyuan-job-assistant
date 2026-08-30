import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("terminal Agent run toolbar regression", () => {
  it("removes terminal Run notices instead of showing processing controls forever", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/agent/page.tsx"), "utf8");

    expect(source).toContain('const TERMINAL_DURABLE_RUN_STATUSES = new Set(["succeeded", "failed", "cancelled"]);');
    expect(source).toContain("setActiveRunNotice((current) => (current?.id === runId ? null : current));");
    expect(source).toContain("activeRunNotice && NON_TERMINAL_DURABLE_RUN_STATUSES.has(activeRunNotice.status)");
  });
});
