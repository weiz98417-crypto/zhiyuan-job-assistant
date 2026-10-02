/**
 * 薪资基准同步视图（Spec 28）。
 *
 * 硬编码双份数据已合并进注册表 data.salary-seed.json（ADR-0043）；
 * 本文件只是它的同步投影，保持 findBenchmarks/formatBenchmarkForLLM API
 * 供 injectKnowledge（同步路径）使用。实时聚合与来源标注走
 * salary-benchmarks-store.lookupBenchmark（异步路径，JD 评估 D 板块）。
 */
import seedJson from "@/lib/agent/knowledge/registry/data/salary-seed.json";

export interface SalaryBenchmark {
  city: string;
  level: string;
  industry: string;
  minMonthlyK: number;
  maxMonthlyK: number;
  medianMonthlyK: number;
  typicalBonusMonths: string;
  notes: string;
}

interface SalarySeed {
  industryMultipliers: Record<string, number>;
  pLevelBase: Array<{ city: string; level: string; minMonthlyK: number; maxMonthlyK: number; medianMonthlyK: number; typicalBonusMonths: string; notes: string }>;
}

const seed = seedJson as unknown as SalarySeed;

export const SALARY_BENCHMARKS: SalaryBenchmark[] = Object.entries(seed.industryMultipliers).flatMap(([industry, multiplier]) =>
  seed.pLevelBase.map((base) => ({
    city: base.city,
    level: base.level,
    industry,
    minMonthlyK: Math.round(base.minMonthlyK * multiplier),
    maxMonthlyK: Math.round(base.maxMonthlyK * multiplier),
    medianMonthlyK: Math.round(base.medianMonthlyK * multiplier),
    typicalBonusMonths: base.typicalBonusMonths,
    notes: base.notes,
  })),
);

export function findBenchmarks(city?: string, level?: string, industry?: string): SalaryBenchmark[] {
  return SALARY_BENCHMARKS.filter(
    (b) =>
      (!city || b.city === city) &&
      (!level || b.level === level) &&
      (!industry || b.industry === industry),
  );
}

export function formatBenchmarkForLLM(city?: string, level?: string): string {
  const benchmarks = findBenchmarks(city, level);
  if (benchmarks.length === 0) return "";

  const byCity = new Map<string, SalaryBenchmark[]>();
  for (const b of benchmarks) {
    const list = byCity.get(b.city) || [];
    list.push(b);
    byCity.set(b.city, list);
  }

  const lines: string[] = ["## 薪资基准参考（静态参考数据，精确对比以评估报告 D 板块带来源标注的数据为准）\n"];
  for (const [c, list] of byCity) {
    const summary = list
      .map((b) => `  ${b.level}: ${b.minMonthlyK}K-${b.maxMonthlyK}K（中位${b.medianMonthlyK}K）${b.typicalBonusMonths}`)
      .join("\n");
    lines.push(`**${c}**：\n${summary}`);
  }

  return lines.join("\n");
}
