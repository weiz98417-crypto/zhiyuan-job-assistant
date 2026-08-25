import type { PoolClient } from "pg";
import { withPostgresClient } from "@/lib/postgres";
import type {
  DurableRunContextMaterial,
  DurableRunContextSource,
} from "@/lib/agent/runtime/run-context";

type WithClient = <T>(callback: (client: PoolClient) => Promise<T>) => Promise<T>;

export class PostgresRunContextSource implements DurableRunContextSource {
  constructor(private readonly withClient: WithClient = withPostgresClient) {}

  async load(principal: { userId: string }, runId: string): Promise<DurableRunContextMaterial> {
    return this.withClient(async (client) => {
      const [attempts, recoveryAttempts, gates, evidence] = await Promise.all([
        client.query(`
          SELECT attempt.id, attempt.tool_name, attempt.args_hash, attempt.effect_state,
                 attempt.result_json, attempt.updated_at
          FROM agent_tool_attempts attempt
          JOIN agent_runs run ON run.id = attempt.run_id
          WHERE attempt.run_id = $1 AND run.user_id = $2 AND attempt.status = 'succeeded'
          ORDER BY attempt.attempt_sequence ASC
        `, [runId, principal.userId]),
        client.query(`
          SELECT attempt.tool_name, attempt.status, attempt.effect_state,
                 attempt.error_json, attempt.updated_at
          FROM agent_tool_attempts attempt
          JOIN agent_runs run ON run.id = attempt.run_id
          WHERE attempt.run_id = $1 AND run.user_id = $2
            AND attempt.status <> 'succeeded'
          ORDER BY attempt.attempt_sequence ASC
        `, [runId, principal.userId]),
        client.query(`
          SELECT gate.tool_name, gate.status, gate.scope_hash
          FROM agent_run_gates gate
          JOIN agent_runs run ON run.id = gate.run_id
          WHERE gate.run_id = $1 AND run.user_id = $2
          ORDER BY gate.created_at ASC
        `, [runId, principal.userId]),
        client.query(`
          SELECT event.event_type, event.payload_json
          FROM agent_run_events event
          JOIN agent_runs run ON run.id = event.run_id
          WHERE event.run_id = $1 AND run.user_id = $2
            AND event.event_type IN ('run.model_output_complete', 'run.model_output_interrupted')
          ORDER BY event.sequence ASC
        `, [runId, principal.userId]),
      ]);

      return {
        completedToolFacts: attempts.rows.map((row) => ({
          toolName: String(row.tool_name || ""),
          summary: attemptSummary(row),
        })),
        recoveryObservations: recoveryAttempts.rows.map((row) => ({
          toolName: String(row.tool_name || "unknown"),
          summary: recoverySummary(row),
        })),
        evidence: evidence.rows.flatMap((row) => {
          const payload = record(row.payload_json);
          const summary = cleanSummary(payload.summary);
          if (summary && String(row.event_type) === "run.model_output_complete") {
            return [{ type: "model.output_complete", content: summary }];
          }
          const charCount = Number(payload.charCount || 0);
          return [{
            type: String(row.event_type) === "run.model_output_interrupted"
              ? "model.output_interrupted"
              : "model.output_complete_meta",
            content: `charCount=${Number.isFinite(charCount) ? Math.max(0, charCount) : 0}`,
          }];
        }),
        gates: gates.rows.map((row) => ({
          toolName: String(row.tool_name || ""),
          status: String(row.status || ""),
          scopeHash: String(row.scope_hash || ""),
        })),
        factRefs: attempts.rows.map((row) => ({
          type: "tool_attempt",
          id: String(row.id || ""),
          version: String(row.effect_state || "succeeded"),
          hash: String(row.args_hash || "") || undefined,
        })),
      };
    });
  }
}

function attemptSummary(row: Record<string, unknown>): string {
  const result = record(row.result_json);
  return cleanSummary(result.llmSummary)
    || `工具 ${String(row.tool_name || "unknown")} 已完成并记录为 ${String(row.effect_state || "succeeded")}`;
}

function recoverySummary(row: Record<string, unknown>): string {
  const error = record(row.error_json);
  const observation = record(error.observation);
  const userSafeSummary = cleanSummary(observation.userSafeSummary);
  const status = String(row.status || "unknown");
  const effectState = String(row.effect_state || "unknown");
  return userSafeSummary
    ? `工具尝试状态为 ${status}/${effectState}：${userSafeSummary}`
    : `工具尝试状态为 ${status}/${effectState}，恢复前必须先确认其副作用状态`;
}

function cleanSummary(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, 2_000)
    : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
