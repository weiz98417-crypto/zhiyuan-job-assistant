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
// 节流是进程级的：多实例部署时每实例各跑一次/小时（写入幂等：UPDATE 同值 + 聚合 ON CONFLICT，
// 只是浪费不算错）。当前单机部署（PM2 单 worker 跑 API）无碍；扩多实例时改用 DB advisory lock。
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
      const ids: number[] = [];
      const mins: Array<number | null> = [];
      const maxs: Array<number | null> = [];
      const units: Array<string | null> = [];
      const negs: number[] = [];
      for (const row of pending.rows as Array<Record<string, unknown>>) {
        const extraction = extractSalaryFromJD(String(row.jd_snippet || ""));
        ids.push(Number(row.id));
        mins.push(extraction?.minMonthly ?? null);
        maxs.push(extraction?.maxMonthly ?? null);
        units.push(extraction && extraction.minMonthly !== null ? "CNY/month" : null);
        negs.push(extraction?.negotiable ? 1 : 0);
        if (extraction && extraction.minMonthly !== null) extracted += 1;
      }
      // 批量写回（unnest 单语句，eng review S4-3：500 行逐行 UPDATE 改为一次往返）
      if (ids.length > 0) {
        await client.query(
          `UPDATE scan_jobs SET salary_min = d.min, salary_max = d.max, salary_unit = d.unit,
             salary_negotiable = d.negotiable, salary_extracted_at = now()
           FROM unnest($1::bigint[], $2::real[], $3::real[], $4::text[], $5::int[])
             AS d(id, min, max, unit, negotiable)
           WHERE scan_jobs.id = d.id`,
          [ids, mins, maxs, units, negs],
        );
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
