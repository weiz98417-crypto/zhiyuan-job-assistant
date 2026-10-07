/**
 * 基线回归边界（2026-10B 全部新功能的当前行为锁定）。
 * 每个功能一条基线：改行为前这里必须先红——「边界」的含义是当前契约的下限，
 * 不是理想态。LLM 依赖路径全部注入/跳过，无成本、确定性。
 */
import { describe, expect, it } from "vitest";
import { loadModeDocument, verifyRegistryIntegrity } from "@/lib/agent/knowledge/registry/loader";
import { COMPANY_MODE_MAP, inferCoachMode } from "@/lib/agent/knowledge/registry/company-mode-map";
import { buildSalaryUpdates } from "@/lib/server/salary-pipeline";
import { buildAggregateEntries } from "@/lib/server/salary-benchmarks-store";
import { buildApplicationOutcomeAdmission } from "@/lib/application-workflow";
import { sessionSurrogateFor, TREND_SESSION_THRESHOLD } from "@/lib/server/interview-trend";
import { shouldBecomeStory } from "@/lib/server/interview-story-bank";
import { filterSectionsByProvenance } from "@/lib/server/resume-factuality";
import { findStaticBenchmark } from "@/lib/server/salary-benchmarks-store";

describe("基线: modes 统一加载器（Spec 25 收口）", () => {
  it("zh 文件读取、缺失返回 null（不抛）", () => {
    expect(loadModeDocument("zh", "jianzhi")).toBeTruthy();
    expect(loadModeDocument("zh", "no-such-mode")).toBeNull();
  });

  it("路径穿越被 basename 阻断（安全边界）", () => {
    expect(loadModeDocument("zh", "../../../package")).toBeNull();
    expect(loadModeDocument("zh", "..\\..\\package")).toBeNull();
  });

  it("注册表完整性：13 条全过（含 modes_dir 目录条目）", () => {
    const failures = verifyRegistryIntegrity().filter((r) => !r.ok);
    expect(failures).toEqual([]);
  });
});

describe("基线: 13 家大厂模式差异化（eng 二轮 S1：中文键 + 包含匹配）", () => {
  it("三档分布：美团/京东/拼多多→结构化、网易→稳重、其余→项目复盘", () => {
    expect(inferCoachMode("美团")).toBe("structured-sme");
    expect(inferCoachMode("京东")).toBe("structured-sme");
    expect(inferCoachMode("拼多多")).toBe("structured-sme");
    expect(inferCoachMode("网易")).toBe("stability");
    expect(inferCoachMode("字节")).toBe("project-review");
    expect(inferCoachMode("腾讯")).toBe("project-review");
  });

  it("中文键包含匹配：句子片段也能命中（真实入参形态）", () => {
    expect(inferCoachMode("准备面试字节")).toBe("project-review");
    expect(inferCoachMode("帮我看下美团的产品岗")).toBe("structured-sme");
  });

  it("映射表键数：16 中文键 + 12 拉丁键（无重复声明）", () => {
    expect(Object.keys(COMPANY_MODE_MAP)).toHaveLength(28);
  });
});

describe("基线: 薪资管线批写构建（Spec 28）", () => {
  it("一行一抽取：命中/面议/失败三态都产出参数行", () => {
    const { ids, mins, maxs, units, negs, extracted } = buildSalaryUpdates([
      { id: 1, jd_snippet: "薪资15-25K·14薪" },
      { id: 2, jd_snippet: "薪资面议" },
      { id: 3, jd_snippet: "我们是一家好公司" },
    ]);
    expect(ids).toEqual([1, 2, 3]);
    expect(mins[0]).toBe(15000);
    expect(units[1]).toBeNull();
    expect(negs[1]).toBe(1);
    expect(mins[2]).toBeNull();
    expect(extracted).toBe(1); // 面议不算有效数值抽取
  });

  it("空批返回空参数（不触发 unnest UPDATE）", () => {
    const result = buildSalaryUpdates([]);
    expect(result.ids).toEqual([]);
    expect(result.extracted).toBe(0);
  });
});

describe("基线: 聚合岗位族归组 + general 级联（eng review S1-10 收口）", () => {
  const row = (city: string, title: string, min: number) => ({ city, title, salary_min: min, salary_max: min + 5000 });

  it("title 推断岗位族：AI 产品 30 条独立成组", () => {
    const entries = buildAggregateEntries(Array.from({ length: 30 }, () => row("北京", "AI产品经理", 30000)));
    expect(entries).toHaveLength(1);
    expect(entries[0].family).toBe("ai_product");
  });

  it("两族各 20 条（<30）级联为城市 general 一条", () => {
    const rows = [
      ...Array.from({ length: 20 }, () => row("上海", "AI产品经理", 30000)),
      ...Array.from({ length: 20 }, () => row("上海", "后端开发工程师", 20000)),
    ];
    const entries = buildAggregateEntries(rows);
    expect(entries).toHaveLength(1);
    expect(entries[0].family).toBe("general");
    expect(entries[0].sampleSize).toBe(40);
  });

  it("静态回落取中位档 P6（不是首条 P5）且 AI 族带溢价", () => {
    const p6 = findStaticBenchmark("北京", "AI/大模型", "P6");
    expect(p6?.levelBand).toBe("P6");
    expect(p6?.p50).toBe(Math.round(38 * 1.15));
    const anyBeijing = findStaticBenchmark("北京");
    expect(anyBeijing?.levelBand).toBe("P6"); // 无档位请求 → 中位档，不是 P5
  });
});

describe("基线: 投递结局事件 evidence 三件套（Spec 29 / admission 硬门槛）", () => {
  const app = { id: 42, company: "字节跳动", role: "AI产品经理" };

  it("verified_task 三件套齐备：artifactId + resultEvidence + verifiedReadBack", () => {
    const admission = buildApplicationOutcomeAdmission(app, "applied", "interview", "内推进展", 7);
    expect(admission.kind).toBe("verified_task");
    expect(admission.evidence).toBeTruthy();
    expect(admission.evidence.artifactId).toBe("application-event-7");
    expect(admission.evidence.resultEvidence).toContain("read back");
    expect(admission.evidence.verifiedReadBack).toBe(true);
    expect(admission.fact.predicate).toBe("application_outcome");
    expect(admission.fact.importance).toBe(0.5);
  });

  it("终局状态加权 importance 0.7", () => {
    const offer = buildApplicationOutcomeAdmission(app, "interview", "offer", "", 8);
    expect(offer.fact.importance).toBe(0.7);
    const rejected = buildApplicationOutcomeAdmission(app, "interview", "rejected", "感谢信", 9);
    expect(rejected.fact.importance).toBe(0.7);
  });
});

describe("基线: 趋势会话代理（sess:/fp: 前缀，eng review S1-5）", () => {
  it("真实会话 → sess: 前缀参与跨场计数", () => {
    expect(sessionSurrogateFor("123", "q", "a")).toBe("sess:123");
  });
  it("独立评分 → fp: 指纹且同答案稳定、异答案不同", () => {
    expect(sessionSurrogateFor("", "q", "a")).toMatch(/^fp:[0-9a-f]{16}$/);
    expect(sessionSurrogateFor("", "q", "a")).toBe(sessionSurrogateFor("", "q", "a"));
    expect(sessionSurrogateFor("", "q", "a")).not.toBe(sessionSurrogateFor("", "q", "b"));
  });
  it("阈值 3 场不变（ADR-0042）", () => {
    expect(TREND_SESSION_THRESHOLD).toBe(3);
  });
});

describe("基线: 故事册准入（Spec 29）", () => {
  it("档位 ≥3 且 ≥80 字才准入", () => {
    expect(shouldBecomeStory(3, "x".repeat(80))).toBe(true);
    expect(shouldBecomeStory(2, "x".repeat(200))).toBe(false);
    expect(shouldBecomeStory(3, "太短")).toBe(false);
    expect(shouldBecomeStory(4, "好".repeat(80))).toBe(true);
  });
});

describe("基线: 生成链事实门过滤（Spec 24 补全，filterSectionsByProvenance）", () => {
  const source = "负责10人团队，年营收800万，增长30%";

  it("通过/违规 section 分流，违规清单聚合", () => {
    const { passing, violations } = filterSectionsByProvenance(
      [
        { id: "experience", label: "A", content: "负责10人团队，营收800万" },
        { id: "projects", label: "B", content: "主导X项目，增长500%" },
      ],
      [source],
    );
    expect(passing.map((s) => s.id)).toEqual(["experience"]);
    expect(violations.map((v) => v.token)).toContain("500");
  });

  it("空 section 列表 → 全空（不炸）", () => {
    const { passing, violations } = filterSectionsByProvenance([], [source]);
    expect(passing).toEqual([]);
    expect(violations).toEqual([]);
  });
});
