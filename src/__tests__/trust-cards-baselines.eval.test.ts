/** Spec 30 / 0.19.0 基线：锚定词映射、未评分观察、薪资时效、会话代理——确定性边界。 */
import { describe, expect, it } from "vitest";
import { bandLabel, stateLabel, bandBadge } from "@/lib/agent/knowledge/registry/band-labels";
import { seedAsOfStale, SALARY_STALE_MONTHS } from "@/lib/server/salary-benchmarks-store";
import { buildUnscoredObservations } from "@/lib/server/interview-analysis-service";
import { isPerceptionMetric } from "@/lib/server/perception-events";

describe("基线: 锚定词映射（与 rubric prompt 逐词一致）", () => {
  it("0-4 → 未作答/薄弱/基础/扎实/出色", () => {
    expect(bandLabel(0)).toBe("未作答");
    expect(bandLabel(1)).toBe("薄弱");
    expect(bandLabel(2)).toBe("基础");
    expect(bandLabel(3)).toBe("扎实");
    expect(bandLabel(4)).toBe("出色");
  });

  it("三态徽标：none 返回 null（不显示）", () => {
    expect(stateLabel("does_not_know")).toBe("不会");
    expect(stateLabel("did_not_articulate")).toBe("没说清");
    expect(stateLabel("not_on_resume")).toBe("简历没写");
    expect(stateLabel("none")).toBeNull();
    expect(stateLabel("")).toBeNull();
  });

  it("档位徽标形态：扎实 · 3/4", () => {
    expect(bandBadge(3)).toBe("扎实 · 3/4");
  });
});

describe("基线: 未评分兜底观察（WP6 纯规则）", () => {
  it("偏短回答 → 提示展开", () => {
    const obs = buildUnscoredObservations("就是做了一个项目");
    expect(obs.some((o) => o.includes("偏短"))).toBe(true);
  });

  it("无数字 → 提示补数字", () => {
    const obs = buildUnscoredObservations("我负责了一个从零到一的产品项目，前前后后做了很长时间才最终上线，整体效果还算不错，团队里的同事也都比较认可这段经历");
    expect(obs.some((o) => o.includes("数字"))).toBe(true);
  });

  it("纯观察输出：不含鼓励句（鼓励句由调用方固定追加）", () => {
    const obs = buildUnscoredObservations("短");
    expect(obs.every((o) => !o.includes("下一题"))).toBe(true);
  });
});

describe("基线: 薪资时效（WP4）", () => {
  it("阈值 9 个月基线锁定", () => {
    expect(SALARY_STALE_MONTHS).toBe(9);
  });

  it("seed asOf=2025-06 → 相对 2026-10 已超期（isStale=true 语义）", () => {
    // 2026-10-03 距 2025-06 约 16 个月 > 9
    expect(seedAsOfStale(new Date("2026-10-03T00:00:00Z"))).toBe(true);
  });

  it("9 个月内不降级", () => {
    expect(seedAsOfStale(new Date("2026-02-01T00:00:00Z"))).toBe(false);
  });
});

describe("基线: 感知指标白名单（WP5）", () => {
  it("四指标白名单锁定", () => {
    expect(isPerceptionMetric("fact_gate_repair")).toBe(true);
    expect(isPerceptionMetric("score_evidence_expand")).toBe(true);
    expect(isPerceptionMetric("sourced_jd_follow_through")).toBe(true);
    expect(isPerceptionMetric("question_source_followup")).toBe(true);
    expect(isPerceptionMetric("arbitrary")).toBe(false);
  });
});
