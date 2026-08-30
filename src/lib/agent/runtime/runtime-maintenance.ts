import type { PoolClient } from "pg";
import { withPostgresClient } from "@/lib/postgres";

type WithClient = <T>(operation: (client: PoolClient) => Promise<T>) => Promise<T>;

export interface AgentRuntimeMaintenanceResult {
  runsExpired: number;
  gatesExpired: number;
}

export class AgentRuntimeMaintenanceService {
  constructor(private readonly withClient: WithClient = withPostgresClient) {}

  async expireWaitingUserRuns(
    now = new Date(),
    timeoutMs = 7 * 24 * 60 * 60 * 1_000,
  ): Promise<AgentRuntimeMaintenanceResult> {
    const cutoff = new Date(now.getTime() - Math.max(1, timeoutMs));
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const candidates = await client.query(`
          SELECT id, user_id, event_sequence
          FROM agent_runs
          WHERE legacy = FALSE
            AND status = 'waiting_user'
            AND updated_at < $1
          ORDER BY updated_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 100
        `, [cutoff]);
        let runsExpired = 0;
        let gatesExpired = 0;
        for (const candidate of candidates.rows) {
          const gates = await client.query(`
            UPDATE agent_run_gates
            SET status = 'expired', resolved_at = $2,
                response_json = '{"reason":"waiting_user_timeout"}'::jsonb
            WHERE run_id = $1 AND status = 'pending'
          `, [candidate.id, now]);
          gatesExpired += gates.rowCount || 0;
          const updated = await client.query(`
            UPDATE agent_runs
            SET status = 'failed', snapshot_version = snapshot_version + 1,
                event_sequence = event_sequence + 1, owner_id = NULL,
                lease_expires_at = NULL, completed_at = $2::timestamptz,
                retention_expires_at = $2::timestamptz + interval '30 days', updated_at = $2::timestamptz
            WHERE id = $1 AND status = 'waiting_user'
            RETURNING event_sequence
          `, [candidate.id, now]);
          if (!updated.rows[0]) continue;
          runsExpired += 1;
          const sequence = Number(updated.rows[0].event_sequence);
          const payload = JSON.stringify({
            type: "run.status_changed",
            status: "failed",
            reason: "waiting_user_timeout",
          });
          await client.query(`
            INSERT INTO agent_run_events (
              run_id, user_id, sequence, event_type, schema_version, payload_json
            ) VALUES ($1, $2, $3, 'run.status_changed', 1, $4::jsonb)
          `, [candidate.id, candidate.user_id, sequence, payload]);
          await client.query(`
            INSERT INTO agent_run_outbox (
              run_id, user_id, event_sequence, topic, schema_version, payload_json
            ) VALUES ($1, $2, $3, 'run_event', 1, $4::jsonb)
          `, [candidate.id, candidate.user_id, sequence, payload]);
          await client.query(`
            INSERT INTO agent_run_outbox (
              run_id, user_id, event_sequence, topic, schema_version, payload_json
            ) VALUES ($1, $2, $3, 'run_review', 1, $4::jsonb)
          `, [candidate.id, candidate.user_id, sequence, payload]);
        }
        await client.query("COMMIT");
        return { runsExpired, gatesExpired };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }
}
