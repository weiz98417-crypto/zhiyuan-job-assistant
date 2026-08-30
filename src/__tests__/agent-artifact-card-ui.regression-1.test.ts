import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Agent artifact card sizing regression", () => {
  it("keeps rich result cards compact instead of filling the chat column", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/agent/AgentChat.tsx"), "utf8");

    expect(source).toContain('const COMPACT_AGENT_CARD_CLASS = "w-fit max-w-[min(560px,78%)] min-w-0";');
    expect(source).toContain("className={COMPACT_AGENT_CARD_CLASS}");
    expect(source).not.toContain('className="w-full max-w-[96%] min-w-0"');
    expect(source).not.toContain('className="max-w-[94%] min-w-0"');
  });
});
