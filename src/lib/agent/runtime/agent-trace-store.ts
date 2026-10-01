/**
 * Agent Trace Store（Spec 18 / ADR-0040）——Langfuse 形状的 trace→observations 树。
 *
 * 第三类存储：不外键 agent_runs、不继承 ADR-0012 保留策略，独立 180 天清理。
 * 元数据-only：接口只接受白名单元数据字段（模型、token、延迟、工具名、状态、事件序号），
 * 没有 prompt/completion 正文列——生产脱敏约束由接口形状保证，测试固定。
 */
import { randomUUID } from "crypto";
import { withPostgresClient } from "@/lib/postgres";

export type TraceObservationKind = "span" | "generation" | "event";
export type TraceClient = Parameters<Parameters<typeof withPostgresClient>[0]>[0];

export interface ModelGenerationInput {
  runId?: string | null;
  userId?: string | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  status?: "ok" | "error";
}

export interface TraceSpanInput {
  runId: string;
  userId?: string | null;
  name: string;
  status: string;
  sourceEventSequence?: number | null;
  level?: "default" | "warning" | "error";
}

export interface TraceObservationRow {
  id: string;
  run_id: string;
  kind: TraceObservationKind;
  name: string;
  status: string;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  latency_ms: number | null;
  level: string;
  source_event_sequence: number | null;
  created_at: string;
}

export interface AgentTraceRow {
  run_id: string;
  user_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
}

const TERMINAL_RUN_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

/** 记录一次模型调用（generation observation）；无 runId 时跳过并显式记录（不静默丢弃计数）。 */
export async function recordModelGeneration(input: ModelGenerationInput, injectedClient?: TraceClient): Promise<void> {
  const runId = input.runId?.trim();
  if (!runId) {
    console.warn("[agent-trace] model generation without runId is not traceable; run skipped", {
      model: input.model,
      totalTokens: input.promptTokens + input.completionTokens,
    });
    return;
  }
  const promptTokens = nonNegative(input.promptTokens);
  const completionTokens = nonNegative(input.completionTokens);
  const run = async (client: TraceClient) => {
    await upsertTraceRow(client, runId, input.userId);
    await client.query(`
      INSERT INTO agent_observations (
        id, run_id, kind, name, status, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, level
      ) VALUES ($1, $2, 'generation', $3, $4, $5, $6, $7, $8, $9, 'default')
    `, [
      randomUUID(), runId, "model_call", input.status === "error" ? "error" : "ok",
      bounded(input.model), promptTokens, completionTokens, promptTokens + completionTokens,
      nonNegative(input.latencyMs),
    ]);
  };
  await withTraceClient(injectedClient, run);
}

/** 从 Run Evidence 事件投影 span observation（元数据 only：类型/工具名/状态/序号）。
 *  Outside-voice #9: 幂等——outbox 重试会重放整个 handler，span 以
 *  (run_id, source_event_sequence) 唯一索引去重。 */
export async function recordTraceSpan(input: TraceSpanInput, injectedClient?: TraceClient): Promise<void> {
  const run = async (client: TraceClient) => {
    await upsertTraceRow(client, input.runId, input.userId);
    await client.query(`
      INSERT INTO agent_observations (
        id, run_id, kind, name, status, model, latency_ms, level, source_event_sequence
      ) VALUES ($1, $2, 'span', $3, $4, '', NULL, $5, $6)
      ON CONFLICT (run_id, source_event_sequence) WHERE source_event_sequence IS NOT NULL DO NOTHING
    `, [
      randomUUID(), input.runId, bounded(input.name, 120), bounded(input.status, 40),
      input.level || "default", input.sourceEventSequence ?? null,
    ]);
  };
  await withTraceClient(injectedClient, run);
}

export async function finishTrace(input: { runId: string; status: string }, injectedClient?: TraceClient): Promise<void> {
  const run = async (client: TraceClient) => {
    await client.query(`
      UPDATE agent_traces
      SET status = $2, finished_at = now()
      WHERE run_id = $1
    `, [input.runId, bounded(input.status, 40)]);
  };
  await withTraceClient(injectedClient, run);
}

export async function purgeExpiredTraces(retentionDays = 180, injectedClient?: TraceClient): Promise<number> {
  const run = async (client: TraceClient) => {
    const result = await client.query(`
      WITH expired AS (
        DELETE FROM agent_traces WHERE started_at < now() - ($1 || ' days')::interval RETURNING run_id
      )
      SELECT count(*)::int AS purged FROM expired
    `, [String(Math.max(1, Math.floor(retentionDays)))]);
    await client.query(`
      DELETE FROM agent_observations WHERE created_at < now() - ($1 || ' days')::interval
    `, [String(Math.max(1, Math.floor(retentionDays)))]);
    return Number((result.rows[0] as { purged?: number } | undefined)?.purged || 0);
  };
  return withTraceClient(injectedClient, run);
}

export async function listAgentTraces(limit = 50): Promise<AgentTraceRow[]> {
  return withPostgresClient(async (client) => {
    const result = await client.query(`
      SELECT run_id, user_id, started_at, finished_at, status
      FROM agent_traces ORDER BY started_at DESC LIMIT $1
    `, [Math.max(1, Math.min(200, Math.floor(limit)))]);
    return result.rows.map(normalizeTraceRow);
  });
}

export async function getAgentTrace(runId: string): Promise<{ trace: AgentTraceRow | null; observations: TraceObservationRow[] }> {
  return withPostgresClient(async (client) => {
    const traceResult = await client.query(
      "SELECT run_id, user_id, started_at, finished_at, status FROM agent_traces WHERE run_id = $1",
      [runId],
    );
    const observationResult = await client.query(`
      SELECT id, run_id, kind, name, status, model, prompt_tokens, completion_tokens, total_tokens,
             latency_ms, level, source_event_sequence, created_at
      FROM agent_observations WHERE run_id = $1 ORDER BY created_at ASC
    `, [runId]);
    return {
      trace: traceResult.rows[0] ? normalizeTraceRow(traceResult.rows[0]) : null,
      observations: observationResult.rows.map(normalizeObservationRow),
    };
  });
}

async function upsertTraceRow(client: TraceClient, runId: string, userId?: string | null): Promise<void> {
  await client.query(`
    INSERT INTO agent_traces (run_id, user_id, status) VALUES ($1, $2, 'running')
    ON CONFLICT (run_id) DO NOTHING
  `, [runId, bounded(userId || "", 120)]);
}

/** 测试可注入 client 的统一入口（评审修复：替代四处重复的 if/else）。 */
async function withTraceClient<T>(injectedClient: TraceClient | undefined, run: (client: TraceClient) => Promise<T>): Promise<T> {
  if (injectedClient) return run(injectedClient);
  return withPostgresClient(run);
}

function normalizeTraceRow(row: Record<string, unknown>): AgentTraceRow {
  const finishedAt = row.finished_at;
  return {
    run_id: String(row.run_id || ""),
    user_id: String(row.user_id || ""),
    started_at: toIso(row.started_at),
    finished_at: finishedAt ? toIso(finishedAt) : null,
    status: String(row.status || "running"),
  };
}

function normalizeObservationRow(row: Record<string, unknown>): TraceObservationRow {
  return {
    id: String(row.id || ""),
    run_id: String(row.run_id || ""),
    kind: (String(row.kind || "event") as TraceObservationKind),
    name: String(row.name || ""),
    status: String(row.status || "ok"),
    model: String(row.model || ""),
    prompt_tokens: row.prompt_tokens === null || row.prompt_tokens === undefined ? null : Number(row.prompt_tokens),
    completion_tokens: row.completion_tokens === null || row.completion_tokens === undefined ? null : Number(row.completion_tokens),
    total_tokens: row.total_tokens === null || row.total_tokens === undefined ? null : Number(row.total_tokens),
    latency_ms: row.latency_ms === null || row.latency_ms === undefined ? null : Number(row.latency_ms),
    level: String(row.level || "default"),
    source_event_sequence: row.source_event_sequence === null || row.source_event_sequence === undefined ? null : Number(row.source_event_sequence),
    created_at: toIso(row.created_at),
  };
}

/** Run 事件类型 → trace 终态判定（供 evidence handler 使用）。 */
export function traceStatusForRunEvent(eventType: string, status: string): { finished: boolean; traceStatus: string } {
  if (eventType === "run.status_changed" && TERMINAL_RUN_STATUSES.has(status)) {
    return { finished: true, traceStatus: status };
  }
  return { finished: false, traceStatus: status };
}

function bounded(value: unknown, max = 240): string {
  return String(value || "").slice(0, max);
}

function nonNegative(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value || "");
}
