import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("admin agent review UI", () => {
  it("exposes Chinese admin navigation and eval candidate actions", () => {
    const root = process.cwd();
    const shell = fs.readFileSync(path.join(root, "src", "components", "shell", "AppShell.tsx"), "utf-8");
    const page = fs.readFileSync(path.join(root, "src", "app", "admin", "agent-reviews", "page.tsx"), "utf-8");

    expect(shell).toContain("/admin/agent-reviews");
    expect(shell).toContain("Agent 复盘治理");
    expect(page).toContain("Agent 复盘治理");
    expect(page).toContain("Eval 候选队列");
    expect(page).toContain("不会自动改代码");
    expect(page).toContain("接受");
    expect(page).toContain("拒绝");
    expect(page).toContain("提升为回归草案");
    expect(page).toContain("图片识别链路失败");
    expect(page).toContain("修复动作");
    expect(page).toContain("补跑图片识别");
    expect(page).toContain("引导任务漂移");
    expect(page).not.toContain("data:image/png;base64");
  });
});
