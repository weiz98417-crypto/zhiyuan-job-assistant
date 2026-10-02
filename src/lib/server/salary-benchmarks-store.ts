/**
 * 薪资基准 store（Spec 28 / ADR-0043）。
 *
 * salary_benchmarks 表：城市×岗位族×年限段 → P25/P50/P75 + 来源（static_seed|opportunity_pool）
 * + 样本量 + 时间窗。静态 seed 来自注册表 data.salary-seed.json（两套旧数据已合并，原文件已删）。
 * 覆盖规则（确定性）：样本量 ≥30 且 JD 时间在最近 12 个月内，实时聚合才覆盖静态 seed；
 * 未达标时回落 seed 并标注「静态参考」——早期样本不足是预期行为，不是缺陷。
 * 估算值不计入评分总分（career-ops 纪律）：D 板块引用必须带来源标注。
 */
import seedJson from "@/lib/agent/knowledge/registry/data/salary-seed.json";
import { getDatabaseDriver, isPostgresConfigured, getPostgresPool } from "@/lib/postgres";

export const AGGREGATION_MIN_SAMPLES = 30;
export const AGGREGATION_WINDOW_MONTHS = 12;

export interface SalaryBenchmarkEntry {
  city: string;
  family: string;
  levelBand: string;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  unit: string;
  source: "static_seed" | "opportunity_pool";
  sampleSize: number;
  windowStart: string | null;
  windowEnd: string | null;
  /** 面向用户的来源标注（D 板块必带） */
  sourceLabel: string;
}

interface SalarySeed {
  version: string;
  lastReviewed: string;
  sources: string[];
  industryMultipliers: Record<string, number>;
  pLevelBase: Array<{ city: string; level: string; minMonthlyK: number; maxMonthlyK: number; medianMonthlyK: number; typicalBonusMonths: string; notes: string }>;
  tenureBandRows: Array<{ city: string; industry: string; level: string; min: number; max: number; unit: string; note?: string }>;
}

const seed = seedJson as SalarySeed;

/** 从 seed 生成静态基准条目（与旧 knowledge/salary-benchmarks.ts 输出等价，industryMultiplier 语义保留）。 */
export function staticSeedEntries(): SalaryBenchmarkEntry[] {
  const entries: SalaryBenchmarkEntry[] = [];
  const industries = Object.keys(seed.industryMultipliers);
  for (const industry of industries) {
    const multiplier = seed.industryMultipliers[industry] || 1;
    for (const base of seed.pLevelBase) {
      const median = Math.round(base.medianMonthlyK * multiplier);
      entries.push({
        city: base.city,
        family: industry,
        levelBand: base.level,
        p25: Math.round(base.minMonthlyK * multiplier),
        p50: median,
        p75: Math.round(base.maxMonthlyK * multiplier),
        unit: "CNY/month",
        source: "static_seed",
        sampleSize: 0,
        windowStart: null,
        windowEnd: null,
        sourceLabel: `静态参考（${seed.sources.join("、")}；v${seed.version} reviewed ${seed.lastReviewed}）`,
      });
    }
  }
  for (const row of seed.tenureBandRows) {
    entries.push({
      city: row.city,
      family: row.industry,
      levelBand: row.level,
      p25: row.min,
      p50: Math.round((row.min + row.max) / 2),
      p75: row.max,
      unit: "CNY/month",
      source: "static_seed",
      sampleSize: 0,
      windowStart: null,
      windowEnd: null,
      sourceLabel: `静态参考（risk-intel v1.0.0：智联2025AI人才报告/脉脉/Boss直聘）`,
    });
  }
  return entries;
}

export function findStaticBenchmark(city?: string, family?: string, levelBand?: string): SalaryBenchmarkEntry | null {
  const entries = staticSeedEntries().filter((entry) =>
    (!city || entry.city === city) &&
    (!family || entry.family === family) &&
    (!levelBand || entry.levelBand === levelBand));
  return entries[0] || null;
}

/**
 * 查询基准：实时聚合达标（≥30 样本且 12 个月窗内）优先，否则回落静态 seed（带标注）。
 * Postgres-only；非 Postgres 模式只返回静态 seed（本地开发语义不受影响）。
 */
export async function lookupBenchmark(city?: string, family?: string, levelBand?: string): Promise<SalaryBenchmarkEntry | null> {
  if (getDatabaseDriver() === "postgres" && isPostgresConfigured()) {
    try {
      const pool = getPostgresPool();
      const params: unknown[] = [];
      const conditions: string[] = ["source = 'opportunity_pool'", "sample_size >= $1"];
      params.push(AGGREGATION_MIN_SAMPLES);
      if (city) { params.push(city); conditions.push(`city = $${params.length}`); }
      if (family) { params.push(family); conditions.push(`family = $${params.length}`); }
      if (levelBand) { params.push(levelBand); conditions.push(`level_band = $${params.length}`); }
      const result = await pool.query(
        `SELECT city, family, level_band, p25, p50, p75, unit, sample_size, window_start, window_end
         FROM salary_benchmarks WHERE ${conditions.join(" AND ")}
         ORDER BY sample_size DESC LIMIT 1`,
        params,
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (row) {
        return {
          city: String(row.city),
          family: String(row.family),
          levelBand: String(row.level_band),
          p25: row.p25 === null ? null : Number(row.p25),
          p50: row.p50 === null ? null : Number(row.p50),
          p75: row.p75 === null ? null : Number(row.p75),
          unit: String(row.unit),
          source: "opportunity_pool",
          sampleSize: Number(row.sample_size),
          windowStart: row.window_start ? new Date(row.window_start as string).toISOString() : null,
          windowEnd: row.window_end ? new Date(row.window_end as string).toISOString() : null,
          sourceLabel: `实时聚合·${Number(row.sample_size)} 条样本（岗位机会池，近 ${AGGREGATION_WINDOW_MONTHS} 个月）`,
        };
      }
    } catch {
      // 表未建/查询失败回落静态 seed
    }
  }
  return findStaticBenchmark(city, family, levelBand);
}

/**
 * 从 scan_jobs 增量聚合薪资基准（Spec 28：应用侧重算，不碰 scan-worker）。
 * 只统计有薪资且发布/发现时间在窗口内的岗位；≥30 样本时 UPSERT 聚合条目。
 * 存量不回填（旧数据薪资字段缺失、来源时间窗不可考）。
 */
export async function aggregateSalaryBenchmarks(): Promise<{ aggregated: number; inspected: number }> {
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) {
    return { aggregated: 0, inspected: 0 };
  }
  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    const rows = await client.query(
      `SELECT city, salary_min, salary_max
       FROM scan_jobs
       WHERE salary_min IS NOT NULL AND salary_max IS NOT NULL
         AND discovered_at >= now() - interval '12 months'`,
    );
    const groups = new Map<string, number[]>();
    for (const row of rows.rows as Array<Record<string, unknown>>) {
      const city = String(row.city || "").trim();
      const min = Number(row.salary_min);
      const max = Number(row.salary_max);
      if (!city || !Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) continue;
      const key = `${city}||general`;
      const list = groups.get(key) || [];
      list.push((min + max) / 2);
      groups.set(key, list);
    }
    let aggregated = 0;
    for (const [key, values] of groups) {
      if (values.length < AGGREGATION_MIN_SAMPLES) continue;
      const [city, family] = key.split("||");
      const sorted = [...values].sort((a, b) => a - b);
      const percentile = (p: number) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]);
      await client.query(
        `INSERT INTO salary_benchmarks (city, family, level_band, p25, p50, p75, unit, source, sample_size, window_start, window_end, updated_at)
         VALUES ($1,$2,'',$3,$4,$5,'CNY/month','opportunity_pool',$6, now() - interval '12 months', now(), now())
         ON CONFLICT (city, family, level_band, source) DO UPDATE
         SET p25 = EXCLUDED.p25, p50 = EXCLUDED.p50, p75 = EXCLUDED.p75,
             sample_size = EXCLUDED.sample_size, window_start = EXCLUDED.window_start,
             window_end = EXCLUDED.window_end, updated_at = now()`,
        [city, family, percentile(0.25), percentile(0.5), percentile(0.75), values.length],
      );
      aggregated += 1;
    }
    return { aggregated, inspected: rows.rowCount || 0 };
  } finally {
    client.release();
  }
}
