import { describe, expect, it } from "vitest";
import { computeEvaluationOverallScore, extractEvaluationBlockScore } from "@/lib/evaluation-scoring";

describe("JD evaluation scoring", () => {
  it("does not collapse complete customization and interview-prep blocks to 1 because they mention gaps", () => {
    const customization = [
      "| 修改前 | 修改后 | 原因 |",
      "|---|---|---|",
      "| 原项目经历缺少SQL表达 | 增加SQL分析、指标体系和BI看板建设证据 | 对齐JD数据产品要求 |",
      "| 未明确原型评审 | 补充需求评审、验收测试和交付闭环 | 回应岗位职责缺口 |",
      "| 简历摘要偏泛 | 改为AI数据产品经理定位 | 强化匹配度 |",
    ].join("\n");
    const interviewPrep = [
      "### F板块·面试准备",
      "| 适用场景 | 故事标题 | 行动 | 结果 | 反思 |",
      "|---|---|---|---|---|",
      "| 需求调研 | 从0到1搭建AI助手 | 访谈用户并拆解流程 | 效率提升 | 复盘边界条件 |",
      "| 红线问题 | 为什么转向数据产品 | 用业务理解和AI落地经验回答 | 建立可信叙事 | 避免夸大 |",
    ].join("\n");

    expect(extractEvaluationBlockScore(customization, "e")).toBeGreaterThanOrEqual(3.5);
    expect(extractEvaluationBlockScore(interviewPrep, "f")).toBeGreaterThanOrEqual(3.5);
  });

  it("scores legitimacy separately and excludes block G from the weighted overall score", () => {
    const blocks = {
      a: { score: 3 },
      b: { score: 4 },
      c: { score: 4 },
      d: { score: 3 },
      e: { score: 4 },
      f: { score: 4 },
      g: { score: extractEvaluationBlockScore("高可信度。JD包含具体技术细节，岗位职责清晰，未发现培训公司或收集简历风险。", "g") },
    };

    expect(blocks.g.score).toBe(5);
    expect(computeEvaluationOverallScore(blocks)).toBe(3.7);
  });

  it("keeps missing-resume CV matching low without poisoning strategy blocks", () => {
    const noResumeBlock = [
      "| JD要求 | 简历匹配 | 缺口/应对策略 |",
      "|---|---|---|",
      "| 需求调研 | 待提供简历 | 待评估 |",
      "| SQL | 待提供简历 | 待评估 |",
      "| 数据建模 | 待提供简历 | 待评估 |",
    ].join("\n");
    const strategyBlock = "### C板块·职级与策略\n| 维度 | 判断 | 应对 |\n|---|---|---|\n| 职级 | JD未明确，但从5年经验推断为P6/P7 | 准备senior叙事和downlevel谈判方案 |";

    expect(extractEvaluationBlockScore(noResumeBlock, "b")).toBe(0);
    expect(extractEvaluationBlockScore(strategyBlock, "c")).toBeGreaterThanOrEqual(3);
  });
});
