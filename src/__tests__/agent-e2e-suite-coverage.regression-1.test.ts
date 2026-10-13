import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

describe("Agent E2E suite coverage regression", () => {
  it("includes runtime tests and browser component tests in the executable suite", () => {
    const result = spawnSync(process.execPath, ["scripts/run-agent-e2e-suite.mjs", "--list"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const files = JSON.parse(result.stdout).map((file: string) => file.replaceAll("\\", "/"));
    expect(files).toContain("src/__tests__/agent-task-runtime.e2e.test.ts");
    expect(files).toContain("src/__tests__/voice-coach-bar.regression.test.tsx");
    expect(files).toContain("src/__tests__/agent-assistant-shell.test.tsx");
    expect(files).toContain("src/__tests__/data-isolation.test.ts");
  });
});
