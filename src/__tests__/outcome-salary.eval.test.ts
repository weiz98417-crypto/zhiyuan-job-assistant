/**
 * Eval：薪资基准管线（Spec 28 / ADR-0043）+ 投递结果回流（Spec 29 / ADR-0034）确定性部分。
 * LLM 侧（拒信解析生产模型）走线上实测（见 evals/README.md）。
 */
import { describe, expect, it } from "vitest";
import { extractSalaryFromJD } from "@/lib/server/salary-extraction";
import { staticSeedEntries, findStaticBenchmark, AGGREGATION_MIN_SAMPLES, AGGREGATION_WINDOW_MONTHS } from "@/lib/server/salary-benchmarks-store";
import { formatBenchmarkForLLM } from "@/lib/agent/knowledge/salary-benchmarks";
import { computeOutcomeSignal } from "@/lib/recommend";
import { REJECTION_REASON_LABELS, REJECTION_LABEL_DESCRIPTIONS } from "@/lib/server/rejection-parsing";
import seedJson from "@/lib/agent/knowledge/registry/data/salary-seed.json";

describe("Spec 28: 薪资抽取正则", () => {
  it("「15-25K·14薪」→ 月薪区间 + 薪资月数", () => {
    const r = extractSalaryFromJD("薪资：15-25K·14薪");
    expect(r).not.toBeNull();
    expect(r!.minMonthly).toBe(15000);
    expect(r!.maxMonthly).toBe(25000);
    expect(r!.bonusMonths).toBe(14);
    expect(r!.negotiable).toBe(false);
    expect(r!.matched).toContain("15-25K");
  });

  it("「20-30万/年」→ 规范化为月薪", () => {
    const r = extractSalaryFromJD("年薪20-30万/年，13薪");
    expect(r).not.toBeNull();
    expect(r!.minMonthly).toBe(Math.round(200000 / 12));
    expect(r!.maxMonthly).toBe(Math.round(300000 / 12));
  });

  it("「2-4万/月」→ 20000-40000", () => {
    const r = extractSalaryFromJD("月薪2-4万/月");
    expect(r!.minMonthly).toBe(20000);
    expect(r!.maxMonthly).toBe(40000);
  });

  it("「15000-25000元/月」→ 元区间", () => {
    const r = extractSalaryFromJD("15000-25000元/月");
    expect(r!.minMonthly).toBe(15000);
    expect(r!.maxMonthly).toBe(25000);
  });

  it("单值「25K」→ 上下限同值", () => {
    const r = extractSalaryFromJD("月薪25K");
    expect(r!.minMonthly).toBe(25000);
    expect(r!.maxMonthly).toBe(25000);
  });

  it("「薪资面议」→ negotiable 标记、无数值不猜", () => {
    const r = extractSalaryFromJD("薪资面议，待遇从优");
    expect(r!.negotiable).toBe(true);
    expect(r!.minMonthly).toBeNull();
  });

  it("无薪资文本 → null（抽取失败留空不猜）", () => {
    expect(extractSalaryFromJD("我们是一家快速发展的公司")).toBeNull();
    expect(extractSalaryFromJD("")).toBeNull();
  });

  it("全角数字归一", () => {
    const r = extractSalaryFromJD("薪资１５-２５K");
    expect(r!.minMonthly).toBe(15000);
  });
});

describe("Spec 28: 聚合纯函数（双条件与百分位）", () => {
  const row = (city: string, min: number, max: number, title = "AI产品经理") => ({ city, title, salary_min: min, salary_max: max });

  it("29 样本不产出聚合条目；30 样本产出 1 条（spec 28 测试决策）", async () => {
    const { buildAggregateEntries } = await import("@/lib/server/salary-benchmarks-store");
    const rows29 = Array.from({ length: 29 }, () => row("北京", 20000, 30000));
    expect(buildAggregateEntries(rows29)).toEqual([]);
    const rows30 = Array.from({ length: 30 }, () => row("北京", 20000, 30000));
    const entries = buildAggregateEntries(rows30);
    expect(entries).toHaveLength(1);
    // title「AI产品经理」→ familyForRole → ai_product（聚合 family 升维，eng review S1-10 收口）
    expect(entries[0]).toMatchObject({ city: "北京", family: "ai_product", sampleSize: 30, p25: 25000, p50: 25000, p75: 25000 });
  });

  it("单族样本不足 30 时级联进城市级 general 池（整城数据不被双条件卡死）", async () => {
    const { buildAggregateEntries } = await import("@/lib/server/salary-benchmarks-store");
    const rows = [
      ...Array.from({ length: 20 }, () => row("杭州", 20000, 30000, "AI产品经理")),
      ...Array.from({ length: 15 }, () => row("杭州", 15000, 25000, "后端开发工程师")),
    ];
    const entries = buildAggregateEntries(rows);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ city: "杭州", family: "general", sampleSize: 35 });
  });

  it("百分位取有序切片：非均匀分布 P25/P50/P75 单调", async () => {
    const { buildAggregateEntries } = await import("@/lib/server/salary-benchmarks-store");
    const rows = Array.from({ length: 40 }, (_, i) => row("上海", 10000 + i * 1000, 10000 + i * 1000));
    const [entry] = buildAggregateEntries(rows);
    expect(entry.p25).toBeLessThan(entry.p50);
    expect(entry.p50).toBeLessThan(entry.p75);
    expect(entry.p25).toBeGreaterThanOrEqual(10000);
    expect(entry.p75).toBeLessThanOrEqual(49000);
  });

  it("脏数据跳过：负数/乱序/超界值不入组", async () => {
    const { buildAggregateEntries } = await import("@/lib/server/salary-benchmarks-store");
    const rows = [
      ...Array.from({ length: 30 }, () => row("杭州", 15000, 25000)),
      row("杭州", -100, 20000),      // 负数
      row("杭州", 30000, 20000),     // max < min
      row("杭州", 500, 800),         // 低于合理下限
      row("杭州", 500000, 600000),   // 超出合理上限
      row("", 15000, 25000),         // 空 city
      row("杭州", "abc", 20000),     // 非数值
    ];
    const [entry] = buildAggregateEntries(rows);
    expect(entry.sampleSize).toBe(30);
  });
});

describe("Spec 28: 静态 seed 合一与标注", () => {
  it("seed 合并完整：P 职级 16 行 × 6 行业 + 年限段 46 行", () => {
    expect(seedJson.pLevelBase).toHaveLength(16);
    expect(seedJson.tenureBandRows).toHaveLength(46);
    const entries = staticSeedEntries();
    expect(entries.filter((e) => e.levelBand.startsWith("P"))).toHaveLength(96);
    expect(entries.filter((e) => e.levelBand.includes("年"))).toHaveLength(46);
  });

  it("行业系数语义保留：AI/大模型 ×1.15、硬件/芯片 ×1.1", () => {
    const ai = findStaticBenchmark("北京", "AI/大模型", "P6");
    const base = findStaticBenchmark("北京", "互联网/电商", "P6");
    const hardware = findStaticBenchmark("北京", "硬件/芯片", "P6");
    expect(ai!.p50).toBe(Math.round(38 * 1.15));
    expect(base!.p50).toBe(38);
    expect(hardware!.p50).toBe(Math.round(38 * 1.1));
  });

  it("每条静态条目带来源标注；asOf 超 9 个月 → 自动降级「方向参考」（WP4）", () => {
    for (const entry of staticSeedEntries().slice(0, 5)) {
      expect(entry.sourceLabel).toMatch(/静态参考|方向参考/);
      expect(entry.source).toBe("static_seed");
    }
    // 2026-10 距 seed asOf 2025-06 已 16 个月 > 9 → 降级生效
    const beijing = findStaticBenchmark("北京", "AI/大模型", "P6");
    expect(beijing!.sourceLabel).toContain("方向参考");
    expect(beijing!.sourceLabel).toContain("2025-06");
  });

  it("聚合双条件常量：≥30 样本 + 12 个月窗", () => {
    expect(AGGREGATION_MIN_SAMPLES).toBe(30);
    expect(AGGREGATION_WINDOW_MONTHS).toBe(12);
  });

  it("injectKnowledge 的同步薪资视图来自 seed（旧的硬编码文件已改为投影）且带时效标注", () => {
    const text = formatBenchmarkForLLM("北京", "P6");
    expect(text).toContain("数据截至 2025-06");
    expect(text).toContain("28K-48K");
  });
});

describe("Spec 29: prefFit 真实信号（确定性）", () => {
  const report = { company: "字节跳动", role: "AI产品经理" };

  it("0 面试样本 → similarity 中性 50（<5 样本由调用方标注数据不足）", () => {
    const signal = computeOutcomeSignal([{ status: "applied", company: "腾讯", role: "后端" }], report);
    expect(signal.sampleSize).toBe(0);
    expect(signal.similarity).toBe(50);
  });

  it("岗位词重叠 → 相似度加权", () => {
    const signal = computeOutcomeSignal([
      { status: "interview", company: "阿里", role: "AI产品经理" },
      { status: "applied", company: "某公司", role: "销售" },
    ], report);
    expect(signal.sampleSize).toBe(1);
    expect(signal.similarity).toBe(70); // 岗位词全命中：70；公司不同：+0
  });

  it("公司完全一致加成，封顶 100", () => {
    const signal = computeOutcomeSignal([{ status: "offer", company: "字节跳动", role: "AI产品经理" }], report);
    expect(signal.sampleSize).toBe(1);
    expect(signal.similarity).toBe(100);
  });

  it("rejected 不算面试进展样本", () => {
    const signal = computeOutcomeSignal([{ status: "rejected", company: "字节跳动", role: "AI产品经理" }], report);
    expect(signal.sampleSize).toBe(0);
  });
});

describe("Spec 29: 拒信封闭标签集", () => {
  it("封闭集完整且描述齐备", () => {
    expect(REJECTION_REASON_LABELS).toEqual(["resume_mismatch", "position_filled", "salary_mismatch", "no_response", "other"]);
    for (const label of REJECTION_REASON_LABELS) {
      expect(REJECTION_LABEL_DESCRIPTIONS[label]).toBeTruthy();
    }
  });
});

describe("Spec 29: memory-policy 白名单更新（Spec 26/29 联合）", () => {
  it("interview_coaching 放行趋势与故事册类型、不再放行 interview_observation", async () => {
    const { resolveAgentMemoryPolicy } = await import("@/lib/agent/memory-policy");
    const policy = resolveAgentMemoryPolicy("interview_coaching");
    expect(policy.allowedMemoryTypes).toContain("interview_weakness_trend");
    expect(policy.allowedMemoryTypes).toContain("interview_story");
    expect(policy.allowedMemoryTypes).not.toContain("interview_observation");
    const growth = resolveAgentMemoryPolicy("profile_growth");
    expect(growth.allowedMemoryTypes).toContain("interview_weakness_trend");
  });

  it("HARD_VETO_PATTERNS 覆盖 missing_evidence_citation（Spec 26 veto 纪律）", async () => {
    const { hardVetoPasses } = await import("@/lib/agent/staging-judge");
    expect(hardVetoPasses("missing_evidence_citation")).toBe(true);
    expect(hardVetoPasses("fabricated_experience")).toBe(true);
    expect(hardVetoPasses("unsupported_claim")).toBe(true);
    expect(hardVetoPasses("完全不认识的veto自由文本")).toBe(false);
  });
});
