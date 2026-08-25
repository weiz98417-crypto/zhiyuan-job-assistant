import type { PoolClient } from "pg";
import { withPostgresClient } from "@/lib/postgres";
import type {
  RunOutboxItem,
  RunOutboxStore,
} from "@/lib/agent/runtime/run-evidence-observer";

type WithClient = <T>(fn: (client: PoolClient) => Promise<T>) => Promise<T>;

export class PostgresRunOutboxStore implements RunOutboxStore {
  constructor(
    private readonly withClient: WithClient = withPostgresClient,
    private readonly deadLetterThreshold = 5,
  ) {}

  async claimBatch(observerId: string, limit: number, now = new Date()): Promise<RunOutboxItem[]> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const selected = await client.query(`
          SELECT id
          FROM agent_run_outbox
          WHERE status = 'pending' AND next_attempt_at <= $1
          ORDER BY next_attempt_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $2
        `, [now, limit]);
        if (selected.rows.length === 0) {
          await client.query("COMMIT");
          return [];
        }
        const ids = selected.rows.map((row) => Number(row.id));
        const claimed = await client.query(`
          UPDATE agent_run_outbox
          SET status = 'processing', locked_by = $2, locked_at = $3
          WHERE id = ANY($1::bigint[])
          RETURNING *
        `, [ids, observerId, now]);
        await client.query("COMMIT");
        return claimed.rows.map(normalizeOutboxItem).sort((left, right) => left.id - right.id);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async markDelivered(itemId: number): Promise<void> {
    await this.withClient(async (client) => {
      await client.query(`
        UPDATE agent_run_outbox
        SET status = 'delivered', delivered_at = now(), locked_by = NULL, locked_at = NULL
        WHERE id = $1 AND status = 'processing'
      `, [itemId]);
    });
  }

  async markFailed(itemId: number, error: string, now = new Date()): Promise<"pending" | "dead_letter"> {
    return this.withClient(async (client) => {
      const result = await client.query(`
        UPDATE agent_run_outbox
        SET attempt_count = attempt_count + 1,
            status = CASE WHEN attempt_count + 1 >= $2 THEN 'dead_letter' ELSE 'pending' END,
            next_attempt_at = CASE
              WHEN attempt_count + 1 >= $2 THEN next_attempt_at
              ELSE $3 + (LEAST(60, power(2, attempt_count + 1)) * interval '1 second')
            END,
            dead_lettered_at = CASE WHEN attempt_count + 1 >= $2 THEN $3 ELSE NULL END,
            last_error = $4,
            locked_by = NULL,
            locked_at = NULL
        WHERE id = $1
        RETURNING status
      `, [itemId, this.deadLetterThreshold, now, error.slice(0, 500)]);
      if (!result.rows[0]) throw new Error("Run Outbox item not found");
      return result.rows[0].status === "dead_letter" ? "dead_letter" : "pending";
    });
  }
}

function normalizeOutboxItem(row: Record<string, unknown>): RunOutboxItem {
  return {
    id: Number(row.id),
    runId: String(row.run_id),
    userId: String(row.user_id),
    eventSequence: Number(row.event_sequence),
    topic: String(row.topic),
    payload: objectRecord(row.payload_json),
    status: String(row.status) as RunOutboxItem["status"],
    attemptCount: Number(row.attempt_count || 0),
    nextAttemptAt: iso(row.next_attempt_at),
    lockedBy: row.locked_by ? String(row.locked_by) : null,
    lastError: String(row.last_error || ""),
    createdAt: iso(row.created_at),
  };
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value || "");
}
