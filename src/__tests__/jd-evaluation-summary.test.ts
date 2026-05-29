import { describe, expect, it } from "vitest";

import { formatJDEvaluationSummary } from "@/lib/agent/loop/client-runner";

describe("formatJDEvaluationSummary", () => {
  it("uses risk-bearing A-G blocks instead of resume advice table lines", () => {
    const summary = formatJDEvaluationSummary({
      company: "深圳华启数智科技有限公司",
      role: "数据产品经理",
      archetype: "AI产品经理",
      overallScore: 1.9,
      reportNum: 10,
      risks: [
        { signal: "JD 里出现了“优先邀你下午茶”这类招聘黑话", excerpt: "优先邀你下午茶", severity: "high" },
      ],
      blocks: {
        a: {
          score: 4.2,
          content: "公司与岗位信息基本明确。",
        },
        b: {
          score: 1.8,
          content: "简历匹配风险：候选人缺少地产/建筑行业数据产品经验。",
        },
        c: {
          score: 2.1,
          content: "职级策略风险：岗位要求 5 年以上经验，与当前阶段不匹配。",
        },
        d: {
          score: 3.7,
          content: "薪资信息需要面试确认。",
        },
        e: {
          score: 1.2,
          content: [
            "好的，作为AI求职评估引擎，我已完成对候选人简历与AI产品经理JD的精确匹配分析。",
            "| 修改前 | 修改后 | 原因 |",
            "| --- | --- | --- |",
            "| 原项目经历 | 建议包装为数据产品项目 | 对齐JD |",
          ].join("\n"),
        },
        f: {
          score: 1.6,
          content: "面试准备建议：重点准备数据产品方法论。",
        },
        g: {
          score: 3.8,
          content: "合规风险：岗位行业门槛较强，需要确认是否接受应届/转行背景。",
        },
      },
    });

    expect(summary).toContain("A 职位概览");
    expect(summary).toContain("B 简历匹配");
    expect(summary).toContain("C 职级与策略");
    expect(summary).toContain("D 薪资与市场");
    expect(summary).toContain("E 定制化方案");
    expect(summary).toContain("F 面试准备");
    expect(summary).toContain("G 职位合法性");
    expect(summary).toContain("行业黑话 / 风险扫描");
    expect(summary).toContain("优先邀你下午茶");
    expect(summary).not.toContain("作为AI求职评估引擎");
    expect(summary).not.toContain("修改前");
    expect(summary).not.toContain("|");
  });
});
