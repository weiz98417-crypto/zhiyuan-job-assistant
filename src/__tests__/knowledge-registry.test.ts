/**
 * Eval：知识注册表（Spec 25）——清单完整性、frontmatter 纪律、单源一致性、
 * prompt 快照锚点、漂移护栏的 TS 侧等价断言。脚本侧护栏见
 * scripts/check-knowledge-drift.mjs 与 scripts/check-prompt-hygiene.mjs（npm run verify:capability-2026-10b）。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  REGISTRY_MANIFEST,
  getRegistryEntry,
  loadRegistryText,
  stripFrontmatter,
  verifyRegistryIntegrity,
} from "@/lib/agent/knowledge/registry/loader";
import { getEvaluationScoreWeights, resetEvaluationScoreWeightsCache } from "@/lib/agent/knowledge/registry/scoring-weights";
import { COMPANY_MODE_MAP, inferCoachMode } from "@/lib/agent/knowledge/registry/company-mode-map";
import { buildInterviewCoachOverlay } from "@/lib/agent/interview-coach-prompt";

describe("Spec 25: 注册表完整性", () => {
  it("每个条目文件存在且 prompt 条目 frontmatter 含 id/version", () => {
    const results = verifyRegistryIntegrity();
    const failures = results.filter((r) => !r.ok);
    expect(failures).toEqual([]);
  });

  it("消费方引用不存在的条目 id 会抛错（类型级 + 加载时双保险的运行时半边）", () => {
    expect(() => getRegistryEntry("prompt.not-exist")).toThrow(/不存在条目/);
  });

  it("manifest 登记数量与条目唯一性", () => {
    const ids = REGISTRY_MANIFEST.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(REGISTRY_MANIFEST.length).toBeGreaterThanOrEqual(10);
  });
});

describe("Spec 25: frontmatter 剥离", () => {
  it("剥离 frontmatter 后正文不含 --- 头", () => {
    const { body, frontmatter } = stripFrontmatter("---\nid: x\nversion: 1.0.0\n---\n正文第一行");
    expect(frontmatter).toContain("id: x");
    expect(body).toBe("正文第一行");
  });
});

describe("Spec 25: A-G 权重单源（modes/scoring-dimensions.yml 为载体）", () => {
  it("注册表权重与 yml 文件内容一致", () => {
    resetEvaluationScoreWeightsCache();
    const weights = getEvaluationScoreWeights();
    const yml = readFileSync(path.join(process.cwd(), "modes", "scoring-dimensions.yml"), "utf8").replace(/\r\n/g, "\n");
    for (const key of ["a", "b", "c", "d", "e", "f"]) {
      const match = yml.match(new RegExp(`- id: ${key.toUpperCase()}[\\s\\S]*?weight:\\s*(\\d+)`));
      expect(match, `yml 中应能解析到板块 ${key.toUpperCase()} 的 weight`).toBeTruthy();
      expect(weights[key as keyof typeof weights]).toBe(Number(match![1]));
    }
  });

  it("yml 全部维度权重总和为 100（文件头自声明；A-F 由注册表消费，G 在 yml 内）", () => {
    const yml = readFileSync(path.join(process.cwd(), "modes", "scoring-dimensions.yml"), "utf8").replace(/\r\n/g, "\n");
    const weights = [...yml.matchAll(/weight:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(weights.length).toBeGreaterThanOrEqual(7);
    const sum = weights.reduce((sum, value) => sum + value, 0);
    expect(sum).toBe(100);
  });
});

describe("Spec 25: COMPANY_MODE_MAP 单源", () => {
  it("13 家大厂映射存在（review 核查：实为 13 家）", () => {
    expect(Object.keys(COMPANY_MODE_MAP)).toHaveLength(13);
    expect(COMPANY_MODE_MAP.bytedance).toBe("project-review");
  });

  it("模式推断：国企→稳重应答、初创→创始人、外企→行为问答", () => {
    expect(inferCoachMode("某国有银行")).toBe("stability");
    expect(inferCoachMode("某某初创公司")).toBe("founder");
    expect(inferCoachMode("某外企")).toBe("behavioral");
  });

  it("coach overlay 消费单源（不再有本地副本）", () => {
    const overlay = buildInterviewCoachOverlay({ jdCompany: "字节跳动" });
    expect(overlay).toContain("面试教练模式（已激活）");
  });
});

describe("Spec 25: 服务内嵌 prompt 迁移快照（最终态锚点）", () => {
  it("分栏 prompt 与迁移前逐字节一致", () => {
    const body = loadRegistryText("prompt.resume-section-split");
    expect(body).toBe(`你是精确的简历重新分栏器。逐字保留输入内容，不增不减不改，把内容归入 personal、summary、experience、projects、skills、education。具体项目块必须放入 projects，并保留公司/岗位/时间上下文。严格返回 JSON：{"personal":"","summary":"","experience":"","projects":"","skills":"","education":""}`);
  });

  it("ATS prompt 只保留两个语义维度（规则路不再交给 LLM）", () => {
    const body = loadRegistryText("prompt.ats-analysis");
    expect(body).toContain("量化数据");
    expect(body).toContain("关键词");
    expect(body).toContain("已由确定性规则检查完毕");
  });

  it("评分 rubric 锚点纪律三要素齐备（Spec 26）", () => {
    const body = loadRegistryText("prompt.interview-answer-scoring");
    expect(body).toContain("0-4");
    expect(body).toContain("引用回答原文");
    expect(body).toContain("does_not_know");
    expect(body).toContain("不换算百分制");
    expect(body).toContain("[需要你补充");
  });

  it("出题 prompt 强制出处标签（Spec 27）", () => {
    const body = loadRegistryText("prompt.interview-question-generation");
    expect(body).toContain("provenance");
    expect(body).toContain("不得编造");
  });
});

describe("Spec 25: 环境混淆清理回归", () => {
  it("resume-agent / evaluate-agent / interview-agent 源码无 localhost fetch 与 localStorage", () => {
    for (const file of [
      "src/lib/agent/registry/agents/resume-agent.ts",
      "src/lib/agent/registry/agents/evaluate-agent.ts",
      "src/lib/agent/registry/agents/interview-agent.ts",
    ]) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source, `${file} 不应再含 localhost fetch`).not.toMatch(/fetch\(["'`]http:\/\/localhost/);
      expect(source, `${file} 不应再读 localStorage`).not.toContain("localStorage");
    }
  });
});

describe("Spec 25: jd-signals 死接线清理", () => {
  it("词表保留、检测函数已删", async () => {
    const module = await import("@/lib/agent/knowledge/jd-signals");
    const keys = Object.keys(module);
    expect(keys).toContain("JD_SIGNALS");
    expect(keys).not.toContain("detectSignals");
    expect(keys).not.toContain("formatSignalsForLLM");
    const knowledge = await import("@/lib/agent/knowledge/index");
    expect((knowledge as unknown as Record<string, unknown>).detectSignals).toBeUndefined();
  });
});
