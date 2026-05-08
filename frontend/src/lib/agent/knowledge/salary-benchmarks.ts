/* ── 薪资基准数据（城市 × 级别 × 行业） ── */

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

const BASE_BENCHMARKS: Omit<SalaryBenchmark, "industry">[] = [
  { city: "北京", level: "P5", minMonthlyK: 15, maxMonthlyK: 28, medianMonthlyK: 22, typicalBonusMonths: "13-15薪", notes: "互联网大厂偏高" },
  { city: "北京", level: "P6", minMonthlyK: 28, maxMonthlyK: 48, medianMonthlyK: 38, typicalBonusMonths: "14-16薪", notes: "大厂P6对标30-50K" },
  { city: "北京", level: "P7", minMonthlyK: 45, maxMonthlyK: 75, medianMonthlyK: 60, typicalBonusMonths: "15-18薪", notes: "含股票/期权" },
  { city: "北京", level: "P8", minMonthlyK: 70, maxMonthlyK: 120, medianMonthlyK: 95, typicalBonusMonths: "16-20薪", notes: "股票占比较大" },
  { city: "上海", level: "P5", minMonthlyK: 14, maxMonthlyK: 26, medianMonthlyK: 20, typicalBonusMonths: "13-15薪", notes: "" },
  { city: "上海", level: "P6", minMonthlyK: 25, maxMonthlyK: 45, medianMonthlyK: 35, typicalBonusMonths: "14-16薪", notes: "" },
  { city: "上海", level: "P7", minMonthlyK: 42, maxMonthlyK: 70, medianMonthlyK: 55, typicalBonusMonths: "15-18薪", notes: "" },
  { city: "上海", level: "P8", minMonthlyK: 65, maxMonthlyK: 110, medianMonthlyK: 88, typicalBonusMonths: "16-20薪", notes: "" },
  { city: "深圳", level: "P5", minMonthlyK: 15, maxMonthlyK: 28, medianMonthlyK: 22, typicalBonusMonths: "13-15薪", notes: "腾讯/华为偏高" },
  { city: "深圳", level: "P6", minMonthlyK: 28, maxMonthlyK: 48, medianMonthlyK: 38, typicalBonusMonths: "14-16薪", notes: "" },
  { city: "深圳", level: "P7", minMonthlyK: 45, maxMonthlyK: 75, medianMonthlyK: 60, typicalBonusMonths: "15-18薪", notes: "" },
  { city: "深圳", level: "P8", minMonthlyK: 70, maxMonthlyK: 120, medianMonthlyK: 95, typicalBonusMonths: "16-20薪", notes: "" },
  { city: "杭州", level: "P5", minMonthlyK: 13, maxMonthlyK: 24, medianMonthlyK: 18, typicalBonusMonths: "13-15薪", notes: "阿里系主导" },
  { city: "杭州", level: "P6", minMonthlyK: 24, maxMonthlyK: 42, medianMonthlyK: 33, typicalBonusMonths: "14-16薪", notes: "" },
  { city: "杭州", level: "P7", minMonthlyK: 40, maxMonthlyK: 68, medianMonthlyK: 52, typicalBonusMonths: "15-18薪", notes: "" },
  { city: "杭州", level: "P8", minMonthlyK: 62, maxMonthlyK: 105, medianMonthlyK: 82, typicalBonusMonths: "16-20薪", notes: "" },
];

const INDUSTRIES = ["互联网/电商", "AI/大模型", "金融科技", "企业服务/SaaS", "游戏", "硬件/芯片"];

export const SALARY_BENCHMARKS: SalaryBenchmark[] = INDUSTRIES.flatMap((industry) =>
  BASE_BENCHMARKS.map((b) => ({
    ...b,
    industry,
    // AI/大模型 行业上浮15%，硬件/芯片 上浮10%
    medianMonthlyK: industry === "AI/大模型"
      ? Math.round(b.medianMonthlyK * 1.15)
      : industry === "硬件/芯片"
        ? Math.round(b.medianMonthlyK * 1.1)
        : b.medianMonthlyK,
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

  const lines: string[] = ["## 薪资基准参考\n"];
  for (const [c, list] of byCity) {
    const summary = list
      .map((b) => `  ${b.level}: ${b.minMonthlyK}K-${b.maxMonthlyK}K（中位${b.medianMonthlyK}K）${b.typicalBonusMonths}`)
      .join("\n");
    lines.push(`**${c}**：\n${summary}`);
  }

  return lines.join("\n");
}
