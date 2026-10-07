import { NextResponse } from "next/server";
import { getCurrentUser, verifyTokenVersion } from "@/lib/auth";
import { getDatabaseDriver, isPostgresConfigured, getPostgresPool } from "@/lib/postgres";
import { PERCEPTION_METRICS } from "@/lib/server/perception-events";

/**
 * 感知指标查询视图(spec 33):四指标 30 天计数 + 逐日序列,供最小仪表盘。
 * Postgres-only(与写入通道同边界);只读聚合,无个人内容。
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    await verifyTokenVersion(user);
    if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) {
      return NextResponse.json({ success: false, error: "unavailable" }, { status: 503 });
    }
    const pool = getPostgresPool();
    const totalsResult = await pool.query(
      `SELECT metric, COUNT(*)::int AS count
         FROM perception_events
        WHERE user_id = $1 AND created_at > now() - interval '30 days'
        GROUP BY metric`,
      [user.userId],
    );
    const dailyResult = await pool.query(
      `SELECT metric, to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
         FROM perception_events
        WHERE user_id = $1 AND created_at > now() - interval '30 days'
        GROUP BY 1, 2
        ORDER BY 2`,
      [user.userId],
    );
    const totals: Record<string, number> = {};
    for (const metric of PERCEPTION_METRICS) totals[metric] = 0;
    for (const row of totalsResult.rows as Array<{ metric: string; count: number }>) {
      if (row.metric in totals) totals[row.metric] = row.count;
    }
    const daily: Array<{ day: string; metric: string; count: number }> = dailyResult.rows
      .filter((row) => (row as { metric: string }).metric in totals)
      .map((row) => ({
        day: (row as { day: string }).day,
        metric: (row as { metric: string }).metric,
        count: (row as { count: number }).count,
      }));
    return NextResponse.json({ success: true, data: { totals, daily } });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
