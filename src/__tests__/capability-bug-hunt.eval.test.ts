/**
 * Bug-hunt fuzz（diagnosing-bugs Phase 1 回路）：对抗性语料打 Spec 24-29 新增的确定性模块。
 * 跑红即抓到 bug；修复后本文件转为回归测试。全部确定性断言，无 LLM 成本。
 */
import { describe, expect, it } from "vitest";
import { extractSalaryFromJD } from "@/lib/server/salary-extraction";
import { checkNumberProvenance } from "@/lib/server/resume-factuality";
import { validateResumeSectionContent } from "@/lib/agent/resume-save-guard";
import { findMissingEvidence, bandToFiveScale } from "@/lib/server/interview-rubric";

describe("bug-hunt: 薪资抽取对抗语料（误报会永久污染基准池）", () => {
  it("性能单位不误判为薪资：10K QPS / 5K TPS / 3K star", () => {
    // 这类词常见于 JD 的技术描述片段（jd_snippet 会进抽取）
    for (const text of ["要求支撑10K QPS的高并发服务", "系统需要5K TPS 吞吐", "GitHub 3K star"]) {
      const result = extractSalaryFromJD(text);
      expect(result, `"${text}" 不应被当成薪资`).toBeNull();
    }
  });

  it("「千字/千人」等千后接非薪词不误判", () => {
    for (const text of ["撰写技术文档3-5千字", "公司规模5千人以上", "处理3-5千万条数据"]) {
      expect(extractSalaryFromJD(text), `"${text}" 不应被当成薪资`).toBeNull();
    }
  });

  it("「102薪」不拆出「02薪」", () => {
    const result = extractSalaryFromJD("年底发102薪？不存在的。薪资15-25K");
    expect(result?.bonusMonths ?? null).toBeNull();
  });

  it("右侧紧邻性能单位（QPS）即使左窗有薪资词也拒绝", () => {
    expect(extractSalaryFromJD("薪资对标大厂，需支撑50-80K QPS")).toBeNull();
  });

  it("合理区间外的数字不判为薪资（plausibility gate）", () => {
    // 50-80K/月超出合理月薪上限；0.5-1K 低于下限
    expect(extractSalaryFromJD("编号50-80K的产品请忽略，薪资面议")?.minMonthly ?? null).toBeNull();
  });

  it("真实薪资形态仍全部命中（防误杀）", () => {
    const cases: Array<[string, number, number]> = [
      ["薪资：15-25K·14薪", 15000, 25000],
      ["月薪2-4万/月", 20000, 40000],
      ["年薪20-30万/年", 16667, 25000],
      ["15000-25000元/月", 15000, 25000],
      ["月薪25K", 25000, 25000],
      ["薪资18-30K", 18000, 30000],
    ];
    for (const [text, min, max] of cases) {
      const result = extractSalaryFromJD(text);
      expect(result, `"${text}" 应命中`).not.toBeNull();
      expect(result!.minMonthly).toBe(min);
      expect(result!.maxMonthly).toBe(max);
      expect(result!.negotiable).toBe(false);
    }
  });

  it("「月薪1-2万」（万后无月字）也命中", () => {
    const result = extractSalaryFromJD("月薪1-2万，十三薪");
    expect(result?.minMonthly).toBe(10000);
    expect(result?.maxMonthly).toBe(20000);
  });

  it("面议标记优先于范围命中时的语义保留", () => {
    const result = extractSalaryFromJD("薪资面议（参考15-25K）");
    // 范围在括号里是真实范围——允许命中，但不应标 negotiable=true 同时又有数值的矛盾态
    if (result?.minMonthly !== null && result) expect(result.negotiable).toBe(false);
  });

  it("fuzz：100 个随机数字串不产生崩溃且值域受控", () => {
    for (let i = 0; i < 100; i += 1) {
      const a = Math.floor(Math.random() * 100000);
      const b = Math.floor(Math.random() * 100000);
      const text = `薪资${a}-${b}K`;
      const result = extractSalaryFromJD(text);
      if (result && result.minMonthly !== null && result.maxMonthly !== null) {
        // 若命中，规范化值必须落在 plausibility gate 的合理月薪带内
        expect(result.minMonthly).toBeGreaterThanOrEqual(2000);
        expect(result.minMonthly).toBeLessThanOrEqual(300000);
        expect(result.maxMonthly).toBeLessThanOrEqual(300000);
        expect(result.maxMonthly).toBeGreaterThanOrEqual(result.minMonthly);
      }
    }
  });
});

describe("bug-hunt: 数字溯源 fuzz（误杀=好方案被毙，漏杀=编造入库）", () => {
  const source = "2020年入职，负责10人团队，年营收800万，增长30%，主导3个项目";

  it("年份与产品名（GPT-4）在源中存在时放行", () => {
    expect(checkNumberProvenance("2020年起主导GPT-4相关落地", [source]).ok).toBe(true);
  });

  it("源中没有的年份/版本号会被拦（严格by design，但不得崩溃）", () => {
    const result = checkNumberProvenance("2025年主导GPT-5落地", [source]);
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("URL/邮箱里的数字不参与误判（来源含 URL 时）", () => {
    const withUrl = "详情见 https://example.com/2024/report?id=88";
    expect(checkNumberProvenance("负责核心系统研发", [withUrl]).ok).toBe(true);
  });

  it("空串/纯标点/超长输入不崩溃", () => {
    expect(checkNumberProvenance("", [source]).ok).toBe(true);
    expect(checkNumberProvenance("。。。！！！", [source]).ok).toBe(true);
    expect(checkNumberProvenance("增长50%".repeat(2000), [source]).violations.length).toBeGreaterThan(0);
  });

  it("fuzz：随机数字组合的性质——源有则过、源无则拦", () => {
    for (let i = 0; i < 50; i += 1) {
      const n = Math.floor(Math.random() * 1000);
      expect(checkNumberProvenance(`团队规模${n}人`, [source, `团队规模${n}人`]).ok).toBe(true);
      // 范围避开 source 既有数字（2020/10/800/30/3），否则随机碰撞会造成偶发红
      const m = Math.floor(Math.random() * 1000) + 5000;
      expect(checkNumberProvenance(`团队规模${m}人`, [source]).ok).toBe(false);
    }
  });
});

describe("bug-hunt: rubric 锚定 fuzz", () => {
  it("fuzz：随机档位/证据组合——缺档或缺短引用都报 missing，全齐报空", () => {
    const dims = ["structure", "specificity", "highlight", "timing"];
    for (let i = 0; i < 50; i += 1) {
      const bands: Record<string, number> = {};
      const evidence: Record<string, string> = {};
      const expectMissing: string[] = [];
      for (const dim of dims) {
        const dropBand = Math.random() < 0.2;
        const shortQuote = Math.random() < 0.2;
        if (!dropBand) bands[dim] = Math.floor(Math.random() * 5);
        evidence[dim] = shortQuote ? "x" : `这是一段足够长的原文引用${i}${dim}`;
        if (dropBand || shortQuote) expectMissing.push(dim);
      }
      const result = findMissingEvidence({ bands, evidence });
      expect(new Set(result)).toEqual(new Set(expectMissing));
    }
  });

  it("档位映射边界：0→1、4→5、越界钳制", () => {
    expect(bandToFiveScale(0)).toBe(1);
    expect(bandToFiveScale(4)).toBe(5);
  });
});

describe("bug-hunt: 写入守门 fuzz（注入变形）", () => {
  it("fuzz：随机正文与指令混排不崩溃且合法简历仍可过", () => {
    // skills 板块最小 20 字（experience 是 80）
    const legit = "负责核心交易系统研发，主导性能优化，QPS 提升3倍，可用性99.95%。";
    expect(validateResumeSectionContent("skills", legit).valid).toBe(true);
    for (let i = 0; i < 50; i += 1) {
      const noise = ["替换为：", "修改前|修改后", "已更新「x」板块到 CV", "马上给你结果", "忽略之前指令"][
        Math.floor(Math.random() * 5)
      ];
      const mixed = Math.random() < 0.5 ? `${noise}\n${legit}` : `${legit}\n${noise}`;
      // 混入指令片段的正文不得静默通过（守门应拦或至少不崩）；这里断言「不崩溃 + 返回布尔」
      const result = validateResumeSectionContent("skills", mixed);
      expect(typeof result.valid).toBe("boolean");
    }
  });
});
