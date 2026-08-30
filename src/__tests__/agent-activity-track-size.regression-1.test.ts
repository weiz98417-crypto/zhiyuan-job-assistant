import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("Agent activity track sizing regression", () => {
  it("keeps progress status inline and bounded like the reference harnesses", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/agent/AgentActivityTrack.tsx"), "utf8");

    expect(source).toContain('className="w-fit max-w-[min(560px,78%)] text-[var(--color-text-soft)]"');
    expect(source).not.toContain('max-w-[90%]');
    expect(source).not.toContain('rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]');
  });
});
