import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("Agent E2E suite coverage regression", () => {
  it("collects every Vitest feature test instead of filtering by filename prefix", () => {
    const source = readFileSync(path.join(process.cwd(), "scripts/run-agent-e2e-suite.mjs"), "utf8");

    expect(source).toContain('.filter((name) => name.endsWith(".test.ts"))');
    expect(source).not.toContain("const included =");
  });
});
