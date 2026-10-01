/**
 * Scheduled Runs 调度服务（Spec 19 / ADR-0039）。
 *
 * 职责边界：
 * - 调度器只负责"到点唤醒"——经系统发起 Admission 入口创建真正的持久 Run；它从不执行工作。
 * - 只读契约：job_digest Run 的工具清单只有 get_job_digest（read）；无人值守 Run 没有任何写路径。
 * - 水位线由调度器在精选成功后推进；失败/跳过以调度备注进入下次精选文案（transcript 单写者，
 *   调度器不直接写会话消息，ADR-0030）。
 * - 时区固定偏移：Asia/Shanghai（UTC+8，无夏令时）——每周一 08:00 CST == 每周一 00:00 UTC。
 */
import { randomUUID } from "crypto";
import { withPostgresClient } from "@/lib/postgres";
import { getDurableAgentRuntime } from "@/lib/agent/runtime/runtime-factory";
import { admitScheduledDigestRun } from "@/lib/agent/run-admission";

const DIGEST_SESSION_TITLE = "岗位精选";
/** 错过补跑窗口：超过 24 小时不再补跑，跳过并在下次精选说明（ADR-0039）。 */
const CATCHUP_WINDOW_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface ScheduledRunRow {
  id: string;
  user_id: string;
  task_type: string;
  status: string;
  next_run_at: string;
  last_run_at: string | null;
  last_request_id: string;
  last_status: string;
  note: string;
}

export type DigestScheduleAction =
  | { action: "noop" }
  | { action: "trigger"; dueAtIso: string }
  | { action: "skip_active_run" }
  | { action: "skip_missed"; note: string };

/* ── 纯调度决策（单测目标） ── */

export function nextWeeklyMonday0800Utc(from: Date): Date {
  const candidate = new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
    0, 0, 0, 0,
  ));
  const day = candidate.getUTCDay();
  const daysUntilMonday = (8 - day) % 7 || 7;
  candidate.setUTCDate(candidate.getUTCDate() + daysUntilMonday);
  // 周一 00:00 UTC 即周一 08:00 Asia/Shanghai；严格晚于 from。
  if (candidate.getTime() <= from.getTime()) candidate.setTime(candidate.getTime() + WEEK_MS);
  return candidate;
}

export function digestScheduleDecision(input: {
  nextRunAt: string;
  hasActiveDigestRun: boolean;
}, now: Date): DigestScheduleAction {
  const nextRunAt = new Date(input.nextRunAt).getTime();
  if (!Number.isFinite(nextRunAt) || nextRunAt > now.getTime()) return { action: "noop" };
  if (now.getTime() - nextRunAt > CATCHUP_WINDOW_MS) {
    return { action: "skip_missed", note: "调度窗口已错过超过 24 小时，本次精选跳过" };
  }
  if (input.hasActiveDigestRun) return { action: "skip_active_run" };
  return { action: "trigger", dueAtIso: digestRequestIdSuffix(input.nextRunAt) };
}

export function digestRequestIdSuffix(nextRunAt: string): string {
  return new Date(nextRunAt).toISOString();
}

/** 水位线读取（Spec 19）：精选工具据此只取「自上次精选以来」的新增；失败备注随素材进入本期文案。 */
export async function getDigestWatermark(userId: string): Promise<{ since: string | null; note: string }> {
  return withPostgresClient(async (client) => {
    const result = await client.query(`
      SELECT last_digest_at, note
      FROM scheduled_runs
      WHERE user_id = $1 AND task_type = 'job_digest' AND status = 'active'
      ORDER BY created_at ASC LIMIT 1
    `, [userId]);
    const row = (result.rows[0] || {}) as { last_digest_at?: unknown; note?: unknown };
    return {
      since: row.last_digest_at ? new Date(row.last_digest_at as string).toISOString() : null,
      note: typeof row.note === "string" ? row.note : "",
    };
  });
}

/* ── 存储与服务 ── */

/** 用户第一次使用岗位发现时隐式开启每周精选（设置页开关属第二期，Spec 19）。
 *  Outside-voice #6: per-user 稳定 jitter（0-30 分钟，userId 哈希导出）——所有用户
 *  同一秒到期会在单 ECS / concurrency=2 上制造周一 08:00 风暴。 */
export async function ensureWeeklyDigestSchedule(userId: string): Promise<void> {
  await withPostgresClient(async (client) => {
    const existing = await client.query(
      "SELECT id FROM scheduled_runs WHERE user_id = $1 AND task_type = 'job_digest' LIMIT 1",
      [userId],
    );
    if (existing.rows.length > 0) return;
    const jitterMinutes = stableJitterMinutes(userId);
    const nextRunAt = new Date(nextWeeklyMonday0800Utc(new Date()).getTime() + jitterMinutes * 60_000);
    await client.query(`
      INSERT INTO scheduled_runs (id, user_id, task_type, status, next_run_at)
      VALUES ($1, $2, 'job_digest', 'active', $3)
    `, [randomUUID(), userId, nextRunAt.toISOString()]);
  });
}

function stableJitterMinutes(userId: string): number {
  let hash = 0;
  for (let index = 0; index < userId.length; index++) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }
  return hash % 30;
}

async function listDueScheduledRuns(now: Date): Promise<ScheduledRunRow[]> {
  return withPostgresClient(async (client) => {
    const result = await client.query(`
      SELECT id, user_id, task_type, status, next_run_at, last_run_at, last_request_id, last_status, note
      FROM scheduled_runs
      WHERE status = 'active' AND task_type = 'job_digest' AND next_run_at <= $1
      ORDER BY next_run_at ASC
      LIMIT 50
    `, [now.toISOString()]);
    return result.rows as ScheduledRunRow[];
  });
}

async function hasActiveDigestRun(userId: string): Promise<boolean> {
  const runtime = getDurableAgentRuntime();
  const active = await runtime.listRuns({ userId }, { activeOnly: true, limit: 20 });
  return active.some((run) => run.taskType === "job_digest");
}

async function ensureDigestConversation(userId: string): Promise<number | null> {
  return withPostgresClient(async (client) => {
    const existing = await client.query(`
      SELECT id FROM sessions
      WHERE user_id = $1 AND title = $2 AND deleted_at IS NULL
      ORDER BY created_at ASC LIMIT 1
    `, [userId, DIGEST_SESSION_TITLE]);
    if (existing.rows[0]) return Number(existing.rows[0].id);
    const inserted = await client.query(
      "INSERT INTO sessions (user_id, title) VALUES ($1, $2) RETURNING id",
      [userId, DIGEST_SESSION_TITLE],
    );
    return Number(inserted.rows[0].id);
  });
}

async function advanceSchedule(runId: string, patch: {
  nextRunAt?: Date;
  lastRunAt?: Date;
  lastRequestId?: string;
  lastStatus?: string;
  note?: string;
  lastDigestAt?: Date;
}): Promise<void> {
  await withPostgresClient(async (client) => {
    await client.query(`
      UPDATE scheduled_runs SET
        next_run_at = COALESCE($2, next_run_at),
        last_run_at = COALESCE($3, last_run_at),
        last_request_id = CASE WHEN $4::text = '' THEN last_request_id ELSE $4 END,
        last_status = CASE WHEN $5::text = '' THEN last_status ELSE $5 END,
        note = CASE WHEN $6::text = '' THEN note ELSE $6 END,
        last_digest_at = COALESCE($7, last_digest_at),
        updated_at = now()
      WHERE id = $1
    `, [
      runId,
      patch.nextRunAt?.toISOString() || null,
      patch.lastRunAt?.toISOString() || null,
      patch.lastRequestId || "",
      patch.lastStatus || "",
      patch.note || "",
      patch.lastDigestAt?.toISOString() || null,
    ]);
  });
}

/** 到点唤醒：每个到期调度至多触发一次（幂等键 = scheduled:<id>:<next_run_at>）。 */
export async function triggerDueScheduledRuns(now = new Date()): Promise<{ triggered: number; skipped: number; missed: number; failed: number }> {
  const due = await listDueScheduledRuns(now);
  let triggered = 0;
  let skipped = 0;
  let missed = 0;
  let failed = 0;
  for (const scheduledRun of due) {
    // 逐行隔离（eng review #1A）：一个用户的确定性失败（如 FK 违规）不得饿死
    // 排在其后的用户；失败落该行 note，调度表可见。
    try {
      await triggerOneScheduledRun(scheduledRun, now, (action) => {
        if (action === "triggered") triggered += 1;
        else if (action === "skipped") skipped += 1;
        else if (action === "missed") missed += 1;
      });
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "scheduled run trigger failed";
      console.error(`[scheduled-runs] trigger failed for ${scheduledRun.id} (user ${scheduledRun.user_id}): ${message}`);
      await advanceSchedule(scheduledRun.id, { lastStatus: "failed", note: `精选触发失败：${message.slice(0, 160)}` }).catch(() => undefined);
    }
  }
  return { triggered, skipped, missed, failed };
}

async function triggerOneScheduledRun(
  scheduledRun: ScheduledRunRow,
  now: Date,
  count: (action: "triggered" | "skipped" | "missed") => void,
): Promise<void> {
  const decision = digestScheduleDecision({
    nextRunAt: scheduledRun.next_run_at,
    hasActiveDigestRun: await hasActiveDigestRun(scheduledRun.user_id),
  }, now);

  if (decision.action === "noop") return;
  const nextRunAt = nextWeeklyMonday0800Utc(new Date(scheduledRun.next_run_at));

  if (decision.action === "skip_missed") {
    count("missed");
    await advanceSchedule(scheduledRun.id, { nextRunAt, note: decision.note, lastStatus: "skipped_missed" });
    return;
  }
  if (decision.action === "skip_active_run") {
    count("skipped");
    await advanceSchedule(scheduledRun.id, { nextRunAt, lastStatus: "skipped_active_run", note: "已有进行中的精选任务，本次顺延" });
    return;
  }

  const requestId = `scheduled:${scheduledRun.id}:${decision.dueAtIso}`;
  const runtime = getDurableAgentRuntime();
  const existing = await runtime.getRunByRequestId({ userId: scheduledRun.user_id }, requestId);
  if (existing) {
    await advanceSchedule(scheduledRun.id, { nextRunAt, lastRunAt: now, lastRequestId: requestId, lastStatus: "replayed" });
    return;
  }
  const conversationId = await ensureDigestConversation(scheduledRun.user_id);
  const admission = admitScheduledDigestRun();
  await runtime.createRun(
    { userId: scheduledRun.user_id },
    {
      requestId,
      conversationId,
      taskType: admission.taskType!,
      agentId: admission.agentId!,
      input: { content: "[系统] 每周岗位精选：请汇总自上次精选以来的机会池新增，给出 Top 5 与一句话点评，并说明重复与失败情况。" },
      contract: admission.contract,
      runtimeMode: "worker_all",
    },
  );
  await advanceSchedule(scheduledRun.id, {
    nextRunAt,
    lastRunAt: now,
    lastRequestId: requestId,
    lastStatus: "triggered",
  });
  count("triggered");
}

/** 对账：精选 Run 终态后记录 last_status；失败进入下次精选的调度备注（用户可见）。 */
export async function reconcileFinishedDigestRuns(): Promise<{ reconciled: number }> {
  return withPostgresClient(async (client) => {
    const pending = await client.query(`
      SELECT id, user_id, last_request_id, last_status
      FROM scheduled_runs
      WHERE status = 'active' AND task_type = 'job_digest'
        AND last_request_id <> '' AND last_status IN ('triggered', 'replayed')
      LIMIT 50
    `);
    let reconciled = 0;
    const runtime = getDurableAgentRuntime();
    for (const row of pending.rows as ScheduledRunRow[]) {
      const run = await runtime.getRunByRequestId({ userId: row.user_id }, row.last_request_id);
      if (!run) continue;
      if (run.status !== "succeeded" && run.status !== "failed" && run.status !== "cancelled") continue;
      reconciled += 1;
      if (run.status === "succeeded") {
        // Outside-voice #4: watermark = run **created** time, not finished time. Material
        // is read mid-run; jobs discovered between read and finish would fall outside both
        // this digest and the next one (since > discovery) and be silently dropped forever.
        // created-time slightly overlaps windows instead — the dedup note absorbs that.
        await advanceSchedule(row.id, {
          lastStatus: "succeeded",
          lastDigestAt: new Date(run.createdAt),
          note: " ",
        });
      } else {
        await advanceSchedule(row.id, { lastStatus: run.status, note: `精选任务于 ${new Date(run.updatedAt).toLocaleString()} ${run.status === "failed" ? "失败" : "被取消"}，本次精选可能缺失` });
      }
    }
    return { reconciled };
  });
}
