import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const featureDir = path.join(process.cwd(), "docs", "feature-system");
const evalDir = path.join(featureDir, "evals");

function readEvalDoc(file: string): string {
  return readFileSync(path.join(evalDir, file), "utf-8");
}

describe("feature-system eval documentation coverage", () => {
  it("has one eval document for every feature-system document from 01 to 26", () => {
    const featureDocs = readdirSync(featureDir)
      .filter((file) => /^\d{2}-.+\.md$/.test(file))
      .filter((file) => {
        const num = Number(file.slice(0, 2));
        return num >= 1 && num <= 26;
      })
      .sort();

    expect(featureDocs).toHaveLength(26);

    for (const featureDoc of featureDocs) {
      const evalDoc = featureDoc.replace(/\.md$/, "-Evals.md");
      expect(
        existsSync(path.join(evalDir, evalDoc)),
        `missing eval doc for ${featureDoc}`,
      ).toBe(true);
    }
  });

  it("keeps every feature eval doc grounded in project facts and explicit eval gaps", () => {
    const evalDocs = readdirSync(evalDir)
      .filter((file) => /^\d{2}-.+-Evals\.md$/.test(file))
      .sort();

    expect(evalDocs).toHaveLength(26);

    for (const file of evalDocs) {
      const doc = readEvalDoc(file);

      expect(doc, `${file} missing title`).toMatch(/^# .+ Evals/m);
      expect(doc, `${file} missing target`).toContain("## 评测对象");
      expect(doc, `${file} missing project facts`).toContain("## 项目事实");
      expect(doc, `${file} missing implementation surface`).toContain("### 关键实现面");
      expect(doc, `${file} missing landed assets`).toContain("### 已落地或部分落地的 eval 资产");
      expect(doc, `${file} missing current-test behavior`).toContain("### 从现有测试读到的行为");
      expect(doc, `${file} missing eval gaps`).toContain("### 待补 eval 缺口");
      expect(doc, `${file} missing governance task list`).toContain("## 实施与治理任务清单");
      expect(doc, `${file} missing baseline section`).toContain("## 基线 Evals");
      expect(doc, `${file} missing boundary section`).toContain("## 边界 Evals");
      expect(doc, `${file} missing regression section`).toContain("## 回归 Evals");
      expect(doc, `${file} missing test mapping`).toContain("## 测试文件映射");
      expect(doc, `${file} missing launch gate`).toContain("## 最小上线门槛");
      expect(doc, `${file} missing B1`).toMatch(/### B1\./);
      expect(doc, `${file} missing E1`).toMatch(/### E1\./);
      expect(doc, `${file} missing R1`).toMatch(/### R1\./);
      expect(doc, `${file} missing fixture definition`).toContain("**输入/fixture**");
      expect(doc, `${file} missing execution path`).toContain("**执行路径**");
      expect(doc, `${file} missing assertions`).toContain("**断言**");
      expect(doc, `${file} missing coverage mapping inside eval cases`).toContain("**现有覆盖**");
      expect(doc, `${file} should not keep the old generic eval template`).not.toContain("使用该功能最小真实入口");
      expect(doc, `${file} should not keep the old generic eval template`).not.toContain("准备一组正例和一组反例");
      expect(doc, `${file} should not contain mojibake replacement markers`).not.toMatch(/鍩|娴|绯|鐩|宀/);
    }
  });

  it("keeps the eval index linked to the integrated job-discovery eval plan", () => {
    const index = readEvalDoc("README.md");
    const jobDiscoveryEval = path.join(featureDir, "27-岗位发现Agent化实施任务与Evals.md");
    const jobDiscoveryEvalCopy = path.join(evalDir, "27-岗位发现Agent化实施任务与Evals.md");

    expect(existsSync(jobDiscoveryEval)).toBe(true);
    expect(existsSync(jobDiscoveryEvalCopy)).toBe(true);
    expect(index).toContain("27 岗位发现 Agent 化实施任务");
    expect(index).toContain("27-%E5%B2%97%E4%BD%8D%E5%8F%91%E7%8E%B0Agent");
  });
});
