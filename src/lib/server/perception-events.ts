/**
 * 感知事件（Spec 30 / WP5）：四个「ChatGPT 差距」指标的落库通道。
 * fire-and-forget：写入失败仅 console.warn，绝不阻塞主链路。
 * Postgres-only；payload 只存 id/枚举/计数（无 PII，production 可存——trace metadata-only 约束只管 trace 表）。
 */
import { getDatabaseDriver, isPostgresConfigured, getPostgresPool } from "@/lib/postgres";

export const PERCEPTION_METRICS = [
  "fact_gate_repair",
  "score_evidence_expand",
  "sourced_jd_follow_through",
  "question_source_followup",
] as const;

export type PerceptionMetric = (typeof PERCEPTION_METRICS)[number];

export function isPerceptionMetric(metric: string): metric is PerceptionMetric {
  return (PERCEPTION_METRICS as readonly string[]).includes(metric);
}

/** 记录一条感知事件；失败返回 false 不抛。 */
export async function recordPerceptionEvent(
  userId: string,
  metric: PerceptionMetric,
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) return false;
  try {
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO perception_events (user_id, metric, payload) VALUES ($1, $2, $3::jsonb)`,
      [userId, metric, JSON.stringify(payload)],
    );
    return true;
  } catch (error) {
    console.warn(`[perception] ${metric} 记录失败:`, error instanceof Error ? error.message : error);
    return false;
  }
}
