import { withPostgresClient } from "@/lib/postgres";
import type {
  RunEvidenceHandler,
  RunOutboxItem,
} from "@/lib/agent/runtime/run-evidence-observer";

export function createRunEvidenceHandlers(): Record<string, RunEvidenceHandler> {
  return {
    run_event: projectRunEvent,
    run_review: triggerRunReview,
  };
}

async function projectRunEvent(item: RunOutboxItem): Promise<void> {
  const payload = redactEvidencePayload(item.payload);
  const type = String(payload.type || "run.event");
  const toolName = String(payload.toolName || "");
  const status = String(payload.status || projectionStatus(type));
  await withPostgresClient(async (client) => {
    await client.query(`
      INSERT INTO agent_run_steps (
        run_id, phase, tool_name, status, input_summary, output_summary,
        verifier_json, error_json, source_event_sequence
      ) VALUES ($1, $2, $3, $4, '', $5, $6::jsonb, '{}'::jsonb, $7)
      ON CONFLICT (run_id, source_event_sequence) WHERE source_event_sequence IS NOT NULL
      DO UPDATE SET
        phase = EXCLUDED.phase,
        tool_name = EXCLUDED.tool_name,
        status = EXCLUDED.status,
        output_summary = EXCLUDED.output_summary,
        verifier_json = EXCLUDED.verifier_json
    `, [
      item.runId,
      type,
      toolName,
      status,
      evidenceSummary(payload),
      JSON.stringify(payload),
      item.eventSequence,
    ]);
  });
}

async function triggerRunReview(item: RunOutboxItem): Promise<void> {
  const { triggerAgentRunReview } = await import("@/lib/agent/run-review");
  await triggerAgentRunReview(item.runId);
}

export function redactEvidencePayload(value: Record<string, unknown>): Record<string, unknown> {
  return redactRecord(value);
}

function redactRecord(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/(authorization|cookie|api[_-]?key|database[_-]?url|ssh|password|token|secret)/i.test(key)) {
      result[key] = "[REDACTED]";
    } else if (Array.isArray(item)) {
      result[key] = item.map((entry) => (
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? redactRecord(entry as Record<string, unknown>)
          : entry
      ));
    } else if (item && typeof item === "object") {
      result[key] = redactRecord(item as Record<string, unknown>);
    } else {
      result[key] = item;
    }
  }
  return result;
}

function projectionStatus(type: string): string {
  if (type === "run.created") return "queued";
  if (type === "run.claimed") return "running";
  if (type === "run.checkpointed") return "succeeded";
  if (type === "run.cancel_requested") return "cancel_requested";
  return "recorded";
}

function evidenceSummary(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  return json.length > 500 ? `${json.slice(0, 500)}…` : json;
}
