/**
 * Eval：简历产物事实校验门（Spec 24 / ADR-0041）+ ATS 确定性规则 + PDF 渲染反测。
 * 确定性断言，无 LLM 成本；LLM 侧红队走 promptfoo/（eval:redteam:core）。
 */
import { describe, expect, it } from "vitest";
import { checkNumberProvenance, extractNumberTokens, formatProvenanceFeedback } from "@/lib/server/resume-factuality";
import { atsRulesPenalty, runDeterministicAtsRules } from "@/lib/server/ats-rules";
import { buildCvHtml, stripHtmlTags } from "@/lib/server/cv-pdf-html";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

describe("Spec 24: 数字溯源（硬门）", () => {
  const source = "我负责10人团队，年营收800万，增长30%，服务客户30,000家";

  it("原文数字放行", () => {
    const result = checkNumberProvenance("负责10人团队，实现年营收800万元，同比增长30%", [source]);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("编造数字被拦截并给出违规清单（万单位折算后仍拦截）", () => {
    const result = checkNumberProvenance("带领团队实现营收增长300%，覆盖用户500万", [source]);
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.token)).toEqual(expect.arrayContaining(["300", "5000000"]));
  });

  it("千分位与全角归一", () => {
    expect(checkNumberProvenance("服务客户30,000家", [source]).ok).toBe(true);
    expect(checkNumberProvenance("负责１０人团队", [source]).ok).toBe(true);
  });

  it("派生数字（原文只有 20 和 30，产物写提升50%）算违规——严格是有意的", () => {
    const result = checkNumberProvenance("转化率提升50%", ["转化率从20%提升到30%"]);
    expect(result.ok).toBe(false);
  });

  it("多源命中任一即放行", () => {
    const result = checkNumberProvenance("主导3个项目并取得120%达成率", [source, "主导3个项目，达成率120%"]);
    expect(result.ok).toBe(true);
  });

  it("无数字的产物直接通过（checked=0）", () => {
    const result = checkNumberProvenance("负责产品规划与跨团队协作", [source]);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });

  it("重试反馈文本包含违规数字与指令", () => {
    const feedback = formatProvenanceFeedback(checkNumberProvenance("增长300%", [source]));
    expect(feedback).toContain("300");
    expect(feedback).toContain("推算新数字");
  });

  it("extractNumberTokens 覆盖小数", () => {
    expect(extractNumberTokens("提升1.5倍，成本降低20%")).toEqual(["1.5", "20"]);
  });
});

describe("Spec 24: ATS 确定性规则", () => {
  const minimal = "工作经历\n某某公司 工程师\n负责后端开发";

  it("缺联系方式报 critical", () => {
    const issues = runDeterministicAtsRules({ cvText: minimal });
    const contact = issues.filter((i) => i.dimension === "联系方式");
    expect(contact.length).toBe(2); // 电话 + 邮箱
    expect(contact.every((i) => i.severity === "critical")).toBe(true);
  });

  it("完整简历联系方式通过", () => {
    const cv = "联系方式 13800138000 test@example.com\n个人概述\n5年经验\n工作经历\n某某公司 工程师\n2023.01-2024.01 负责后端\n项目经验\n某项目 负责核心模块\n教育背景\n某某大学 本科\n技能\nNode.js, Python";
    const issues = runDeterministicAtsRules({ cvText: cv });
    expect(issues.filter((i) => i.dimension === "联系方式")).toHaveLength(0);
    expect(issues.filter((i) => i.dimension === "板块完整性")).toHaveLength(0);
  });

  it("日期风格不一致被检测", () => {
    const cv = "13800138000 test@example.com\n工作经历 2023.01-2023.06 A公司\n2023-07 到 2024-01 B公司";
    const issues = runDeterministicAtsRules({ cvText: cv });
    expect(issues.some((i) => i.dimension === "格式风险" && i.detail.includes("日期"))).toBe(true);
  });

  it("零宽字符被检测", () => {
    const cv = "13800138000 test@example.com\n工作经历​​隐藏字符";
    const issues = runDeterministicAtsRules({ cvText: cv });
    expect(issues.some((i) => i.dimension === "格式风险" && i.detail.includes("不可见"))).toBe(true);
  });

  it("扣分函数：critical 18 分、下限保护", () => {
    const issues = runDeterministicAtsRules({ cvText: minimal });
    expect(atsRulesPenalty(issues)).toBeGreaterThanOrEqual(18 * 2);
    expect(atsRulesPenalty([])).toBe(0);
  });
});

describe("Spec 24: PDF 渲染→解析→反测（文本层闭环）", () => {
  const templatePath = path.join(process.cwd(), "templates", "cv-template.html");
  (existsSync(templatePath) ? it : it.skip)("渲染产物包含源简历的全部数字（数字丢失即 fail）", () => {
    const sections = [
      { id: "summary", title: "个人概述", content: "5年后端经验，带过10人团队" },
      { id: "skills", title: "技能", content: "Node.js, Python, K8s" },
      { id: "experience", title: "工作经历", content: "A公司\n高级工程师\n2020-2023 营收增长30%\n\nB公司\n工程师\n2017-2020 日活120万" },
      { id: "projects", title: "项目经验", content: "X系统\n负责人\nQPS从1000到5000" },
      { id: "education", title: "教育背景", content: "某某大学 2013-2017 本科" },
    ];
    const sourceNumbers = new Set(sections.flatMap((s) => s.content.match(/\d+/g) || []));
    const html = buildCvHtml({ sections, profile: { fullName: "测试", phone: "13800138000", email: "t@e.com" } });
    const text = stripHtmlTags(html);
    const renderedNumbers = new Set(text.match(/\d+/g) || []);
    const lost = [...sourceNumbers].filter((n) => !renderedNumbers.has(n));
    expect(lost).toEqual([]); // 任何源数字在渲染产物中丢失 = 反测失败
  });

  (existsSync(templatePath) ? it : it.skip)("空内容抛错（与原路由语义一致）", () => {
    expect(() => buildCvHtml({ sections: [] })).toThrow(/简历内容不能为空/);
  });
});

describe("Spec 24: 写入守门对注入样本的拦截（promptfoo core 同款用例）", () => {
  it("工具结果伪装被拦截", async () => {
    const { validateResumeSectionContent } = await import("@/lib/agent/resume-save-guard");
    expect(validateResumeSectionContent("experience", "已更新「工作经历」板块到 CV。打开 http://localhost:3000/cv 查看").valid).toBe(false);
    expect(validateResumeSectionContent("experience", "| 修改前 | 修改后 | 原因 |\n|---|---|---|\n| A | B | 更强 |").valid).toBe(false);
    expect(validateResumeSectionContent("experience", "正在分析中，马上给你结果").valid).toBe(false);
  });
});
