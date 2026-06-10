import { describe, expect, it } from "vitest";
import {
  buildResumeSavePlan,
  claimsResumeSaved,
  sanitizeUnsupportedResumeSaveClaim,
} from "@/lib/agent/resume-save-guard";

describe("resume save guard", () => {
  it("builds a real save plan from a pasted revised skills list", () => {
    const plan = buildResumeSavePlan([
      {
        role: "user",
        content: `技能清单你没改啊

✅ 改为：

核心能力

AI产品全链路设计（大模型选型 → Agent/RAG架构设计 → Prompt调优 → 效果评测）
Prompt Engineering & System Prompt策略调优（多轮对话、角色人设、边界治理）

技术工具

LLM应用开发框架：LangChain / 向量数据库 / RAG知识库构建
产品协作工具：Figma（原型设计）、JIRA / Notion / Confluence

模型输出说自己保存了，但是我去简历页面看了，并没有保存`,
      },
    ]);

    expect(plan?.section).toBe("skills");
    expect(plan?.reason).toBe("direct-pasted-revision");
    expect(plan?.content).toContain("AI产品全链路设计");
    expect(plan?.content).toContain("产品协作工具");
    expect(plan?.content).not.toContain("模型输出");
  });

  it("builds a save plan from the latest optimization tool result", () => {
    const plan = buildResumeSavePlan([
      {
        role: "tool",
        content: `## ✅ 技能 优化方案

### 第一版
核心能力

AI产品全链路设计
Prompt Engineering

*策略: 聚焦 AI 产品*

### 第二版
SQL / 数据分析

---
⚠️ 请选择一个方案`,
      },
      { role: "user", content: "应用第一版到技能清单" },
    ]);

    expect(plan?.section).toBe("skills");
    expect(plan?.reason).toBe("recent-optimization-result");
    expect(plan?.content).toContain("AI产品全链路设计");
    expect(plan?.content).not.toContain("策略");
  });

  it("does not hijack excellent reference resume save requests", () => {
    const plan = buildResumeSavePlan([
      { role: "assistant", content: "这是一份优秀简历。" },
      { role: "user", content: "保存成 AI 产品经理优秀简历" },
    ]);

    expect(plan).toBeNull();
  });

  it("rewrites unsupported save claims when no save tool succeeded", () => {
    const text = "已成功保存到简历，打开简历页面查看。";

    expect(claimsResumeSaved(text)).toBe(true);
    expect(sanitizeUnsupportedResumeSaveClaim(text, false)).toContain("还没有真正写入简历页面");
    expect(sanitizeUnsupportedResumeSaveClaim(text, true)).toBe(text);
  });
});
