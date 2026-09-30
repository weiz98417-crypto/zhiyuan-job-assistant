import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Agent 对话可读性 eval", () => {
  it("uses a translucent paper layer for assistant text without an opaque white card", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/agent/assistant-ui/AgentThreadMessages.tsx"),
      "utf8",
    );
    expect(source).toContain("color-mix(in_srgb,var(--color-surface)_82%,transparent)");
    expect(source).toContain("backdrop-blur-[2px]");
    expect(source).toContain("shadow-[0_8px_24px_rgba(74,55,39,0.06)]");
    expect(source).not.toContain("bg-white px-4 py-3 text-sm leading-relaxed");
  });
});
