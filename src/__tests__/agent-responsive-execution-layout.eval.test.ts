import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const shell = readFileSync(path.join(root, "src/components/shell/WorkbenchShell.tsx"), "utf8");
const page = readFileSync(path.join(root, "src/app/agent/page.tsx"), "utf8");
const toolbar = readFileSync(path.join(root, "src/components/agent/AgentRunToolbar.tsx"), "utf8");

describe("窄屏 Agent 执行态布局 eval", () => {
  it("main switches to a vertical mobile layout", () => {
    expect(shell).toContain("flex flex-col lg:flex-row");
    expect(shell).toContain("min-h-14 w-full flex-shrink-0");
    expect(shell).toContain("lg:hidden");
  });

  it("execution controls wrap below the activity content", () => {
    expect(page).toContain("flex-col items-stretch");
    expect(page).toContain("sm:flex-row sm:items-center sm:justify-between");
    expect(toolbar).toContain("flex-col items-stretch");
    expect(toolbar).toContain("sm:flex-row sm:items-center");
    expect(toolbar).toContain("flex-wrap items-center");
  });
});
