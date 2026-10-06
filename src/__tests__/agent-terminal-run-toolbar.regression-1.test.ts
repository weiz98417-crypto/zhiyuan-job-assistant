import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("terminal Agent run toolbar regression", () => {
  it("removes terminal Run notices instead of showing processing controls forever", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/agent/use-agent-conversation.tsx"), "utf8");
    // spec 35 拆分:状态集合声明移入 use-agent-conversation-helpers,用法仍在门面
    const helpers = readFileSync(path.join(process.cwd(), "src/components/agent/use-agent-conversation-helpers.ts"), "utf8");

    expect(helpers).toContain('const TERMINAL_DURABLE_RUN_STATUSES = new Set(["succeeded", "failed", "cancelled"]);');
    expect(source).toContain("setActiveRunNotice((current) => (current?.id === runId ? null : current));");
    expect(source).toContain("activeRunNotice && NON_TERMINAL_DURABLE_RUN_STATUSES.has(activeRunNotice.status)");
  });
});
