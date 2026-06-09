import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("Interview Agent prompt contract", () => {
  it("treats active interview session state as the source of truth", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/agent/registry/agents/interview-agent.ts"),
      "utf-8",
    );

    expect(source).toContain("面试会话状态优先级");
    expect(source).toContain("Active Interview Session");
    expect(source).toContain("planSnapshot");
    expect(source).toContain("questionGraph");
    expect(source).toContain("transcript");
    expect(source).toContain("不要重新生成整套题目计划");
    expect(source).toContain("不要要求用户重新粘贴");
    expect(source).toContain("不能静默切换");
  });
});
