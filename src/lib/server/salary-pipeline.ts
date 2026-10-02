/**
 * 薪资管线（Spec 28）：应用侧惰性触发——
 * ① 对近期 scan_jobs 中缺薪资字段的行做确定性正则抽取（存量不回填超过 12 个月的行）；
 * ② 聚合达标条目进 salary_benchmarks（≥30 样本 + 12 个月窗）。
 * 不碰 scan-worker.mjs（ADR-0039 先例）；不得在岗位精选无人值守 Run 内调用（只读契约）。
 * 触发点：扫描状态读取路径（getScanStatusForUser），模块级 1 小时节流。
 */
import { getDatabaseDriver, isPostgresConfigured, getPostgresPool } from "@/lib/postgres";
import { extractSalaryFromJD } from "./salary-extraction";
import { aggregateSalaryBenchmarks } from "./salary-benchmarks-store";

const THROTTLE_MS = 60 * 60 * 1000;
let lastRunAt = 0;
let running: Promise<{ extracted: number; aggregated: number }> | null = null;

export async function runSalaryPipeline(force = false): Promise<{ extracted: number; aggregated: number }> {
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) {
    return { extracted: 0, aggregated: 0 };
  }
  if (!force && Date.now() - lastRunAt < THROTTLE_MS) {
    return { extracted: 0, aggregated: 0 };
  }
  if (running) return running;
  running = (async () => {
    const pool = getPostgresPool();
    const client = await pool.connect();
    let extracted = 0;
    try {
      // ① 抽取：只处理缺字段且有 jd_snippet 的近期行（增量，不回填历史）
      const pending = await client.query(
        `SELECT id, jd_snippet FROM scan_jobs
         WHERE salary_extracted_at IS NULL AND COALESCE(jd_snippet, '') <> ''
           AND discovered_at >= now() - interval '12 months'
         LIMIT 500`,
      );
      for (const row of pending.rows as Array<Record<string, unknown>>) {
        const extraction = extractSalaryFromJD(String(row.jd_snippet || ""));
        await client.query(
          `UPDATE scan_jobs SET salary_min = $2, salary_max = $3, salary_unit = $4,
             salary_negotiable = $5, salary_extracted_at = now()
           WHERE id = $1`,
          [
            row.id,
            extraction?.minMonthly ?? null,
            extraction?.maxMonthly ?? null,
            extraction && extraction.minMonthly !== null ? "CNY/month" : null,
            extraction?.negotiable ? 1 : 0,
          ],
        );
        if (extraction && extraction.minMonthly !== null) extracted += 1;
      }
    } finally {
      client.release();
    }
    // ② 聚合
    const { aggregated } = await aggregateSalaryBenchmarks();
    lastRunAt = Date.now();
    return { extracted, aggregated };
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}
