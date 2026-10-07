/**
 * 面试弱项趋势入账（Spec 26 / ADR-0042 条款 2）。
 *
 * 单场评分不进记忆账本。同一弱项（维度档位 ≤1）跨 ≥3 个不同会话持续，
 * 才提炼为「趋势事实候选」走 admitMemory——候选即未确认态（ADR-0034），
 * 用户确认后才成为活跃事实、才能被面试教练/画像场景检索。
 * Postgres-only（2026-10-03 决策）；表见 postgres-schema.sql interview_weakness_events。
 */
import { createHash } from "node:crypto";
import { getDatabaseDriver, isPostgresConfigured, getPostgresPool } from "@/lib/postgres";
import { admitMemory } from "@/lib/memory/admission";

export const TREND_SESSION_THRESHOLD = 3;
export const WEAK_BAND: 0 | 1 = 1;

/** 会话代理键（eng review S1-5）：真实会话加 sess: 前缀参与「≥3 场」计数；
 *  独立评分（无会话）以答案指纹 fp: 标记，不计入跨场统计。 */
export function sessionSurrogateFor(sessionId: string, question: string, answer: string): string {
  const id = sessionId.trim();
  if (id) return `sess:${id}`;
  return `fp:${createHash("sha256").update(`${question}\u0000${answer}`).digest("hex").slice(0, 16)}`;
}

export interface WeaknessEventInput {
  userId: string;
  /** 会话代理键（sessionSurrogateFor 产出）。 */
  sessionSurrogate: string;
  dimension: string;
  band: number;
  topic?: string;
}

function weaknessId(userId: string, dimension: string, topic: string): string {
  return createHash("sha256").update(`${userId}\u0000${dimension}\u0000${topic}`).digest("hex").slice(0, 24);
}

/** 记录一次弱项观察；返回（可能的）趋势候选写入结果。
 *  topic 是岗位族（维度×岗位族粒度，Spec 26），不是题干——同一道题不算跨场。 */
export async function recordWeaknessEvent(
  input: WeaknessEventInput,
): Promise<{ recorded: boolean; trendEmitted: boolean; trendCandidateId?: number; reason?: string }> {
  if (input.band > WEAK_BAND) return { recorded: false, trendEmitted: false };
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) {
    return { recorded: false, trendEmitted: false, reason: "postgres_unavailable" };
  }
  const topic = (input.topic || "general").slice(0, 120);
  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO interview_weakness_events (user_id, session_surrogate, dimension, topic, band)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, session_surrogate, dimension, topic) DO NOTHING`,
      [input.userId, input.sessionSurrogate, input.dimension, topic, input.band],
    );
    const distinct = await client.query(
      `SELECT COUNT(DISTINCT session_surrogate)::int AS sessions FROM interview_weakness_events
       WHERE user_id = $1 AND dimension = $2 AND topic = $3 AND band <= $4
         AND session_surrogate LIKE 'sess:%'`,
      [input.userId, input.dimension, topic, WEAK_BAND],
    );
    const sessions = distinct.rows[0]?.sessions || 0;
    if (sessions < TREND_SESSION_THRESHOLD) {
      return { recorded: true, trendEmitted: false, reason: `sessions=${sessions}` };
    }

    // ≥3 场：提炼趋势事实候选（未确认态，用户确认后才激活——ADR-0034）。
    // canonicalText 不含场次计数，保证 admission 按 canonical_text 去重时同一趋势只产生一条候选；
    // 场次数放 object，随最新事件更新。
    const wid = weaknessId(input.userId, input.dimension, topic);
    const result = await admitMemory({
      userId: input.userId,
      agentId: "interview",
      kind: "session_observation",
      sourceType: "interview",
      sourceId: wid,
      fact: {
        partition: "core",
        subject: `interview_trend:${wid}`,
        predicate: "interview_weakness_trend",
        object: { dimension: input.dimension, topic, weakSessions: sessions, threshold: TREND_SESSION_THRESHOLD },
        canonicalText: `跨场面试弱项趋势（${input.dimension}，岗位族 ${topic}）：该维度持续偏弱，此为趋势推断，待用户确认。`,
        confidence: 0.6,
        importance: 0.7,
      },
      evidence: { quote: `interview_weakness_events: ${sessions} distinct sessions`, extractionMethod: "interview_weakness_trend", metadata: { sourceLabel: "面试趋势（≥3 场）" } },
    });
    return { recorded: true, trendEmitted: result.outcome === "candidate", trendCandidateId: result.candidate?.id };
  } finally {
    client.release();
  }
}

// listWeakTrendStats 已删（eng review S2-7：零消费方；趋势读取走统一记忆检索）
