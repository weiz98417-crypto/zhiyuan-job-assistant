import type { PoolClient } from "pg";
import { withPostgresClient } from "@/lib/postgres";

type WithClient = <T>(operation: (client: PoolClient) => Promise<T>) => Promise<T>;

export interface AgentRuntimeRetentionResult {
  checkpointsDeleted: number;
  inputsRedacted: number;
  eventsDeleted: number;
  outboxDeleted: number;
}

export class AgentRuntimeRetentionService {
  constructor(private readonly withClient: WithClient = withPostgresClient) {}

  async cleanup(now = new Date()): Promise<AgentRuntimeRetentionResult> {
    const payloadCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000);
    const evidenceCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1_000);
    return this.withClient(async (client) => {
      const checkpoints = await client.query(`
        DELETE FROM agent_run_checkpoints checkpoint
        USING agent_runs run
        WHERE checkpoint.run_id = run.id
          AND run.status IN ('succeeded', 'failed', 'cancelled')
          AND run.completed_at < $1
      `, [payloadCutoff]);
      const inputs = await client.query(`
        UPDATE agent_run_inputs input
        SET content_json = '{"redacted":true}'::jsonb
        FROM agent_runs run
        WHERE input.run_id = run.id
          AND run.status IN ('succeeded', 'failed', 'cancelled')
          AND run.completed_at < $1
          AND input.content_json <> '{"redacted":true}'::jsonb
      `, [payloadCutoff]);
      const events = await client.query(`
        DELETE FROM agent_run_events event
        USING agent_runs run
        WHERE event.run_id = run.id
          AND run.status IN ('succeeded', 'failed', 'cancelled')
          AND event.created_at < $1
      `, [evidenceCutoff]);
      const outbox = await client.query(`
        DELETE FROM agent_run_outbox
        WHERE status IN ('delivered', 'dead_letter')
          AND created_at < $1
      `, [evidenceCutoff]);
      return {
        checkpointsDeleted: checkpoints.rowCount || 0,
        inputsRedacted: inputs.rowCount || 0,
        eventsDeleted: events.rowCount || 0,
        outboxDeleted: outbox.rowCount || 0,
      };
    });
  }
}
