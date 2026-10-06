/** spec 38:视觉反测门禁纯函数核心测试(校验/门禁/基线哈希)。 */
import { describe, expect, it } from "vitest";
import {
  REQUIRED_DIMS,
  THRESHOLD,
  validateCritique,
  evaluateGates,
  normalizeHash,
} from "../../scripts/visual-review-core.mjs";

const FULL_CRITIQUE = Object.fromEntries(
  REQUIRED_DIMS.map((dim) => [dim, { score: 7, issues: ["具体问题:某板块日期未右对齐"] }]),
);

describe("validateCritique(spec 38)", () => {
  it("四维齐 + 有限分数 → 通过", () => {
    expect(validateCritique(FULL_CRITIQUE)).toBe(true);
  });

  it("缺维/分数非有限/非对象 → 拒绝", () => {
    const missing = { ...FULL_CRITIQUE };
    delete missing.color;
    expect(validateCritique(missing)).toBe(false);
    expect(validateCritique({ ...FULL_CRITIQUE, color: { score: Number.NaN } })).toBe(false);
    expect(validateCritique(null)).toBe(false);
    expect(validateCritique("text")).toBe(false);
  });
});

describe("evaluateGates(spec 38)", () => {
  it("全 7 分 → 绿(总 28 ≥ 24)", () => {
    const scores = Object.fromEntries(REQUIRED_DIMS.map((d) => [d, 7]));
    expect(evaluateGates({ sampleName: "s", scores }).failures).toEqual([]);
  });

  it("单维 <6 与总分 <24 都触发", () => {
    const scores = { layout_hierarchy: 5, density: 6, alignment: 6, color: 6 };
    const { failures, total } = evaluateGates({ sampleName: "s", scores });
    expect(failures).toEqual(["s.layout_hierarchy=5 < 6", "s.total=23 < 24"]);
    expect(total).toBe(23);
    void THRESHOLD;
  });

  it("同内容回归:基线同哈希且跌超 2 → 红;哈希不同不比", () => {
    const scores = { layout_hierarchy: 7, density: 7, alignment: 7, color: 7 };
    const baselineEntry = { htmlHash: "aaa", scores: { layout_hierarchy: 10, density: 7, alignment: 7, color: 7 } };
    const regressed = evaluateGates({ sampleName: "s", scores, baselineEntry, htmlHash: "aaa" });
    expect(regressed.failures).toEqual(["s.layout_hierarchy 回归:10 → 7(跌超 2)"]);
    const newContent = evaluateGates({ sampleName: "s", scores, baselineEntry, htmlHash: "bbb" });
    expect(newContent.failures).toEqual([]);
  });
});

describe("normalizeHash(spec 38)", () => {
  it("CRLF/BOM 归一后哈希一致(跨机稳定)", () => {
    expect(normalizeHash("a\r\nb")).toBe(normalizeHash("a\nb"));
    expect(normalizeHash("\uFEFFa")).toBe(normalizeHash("a"));
    expect(normalizeHash("a")).not.toBe(normalizeHash("b"));
  });
});
