import { withPostgresClient } from "@/lib/postgres";
import type { ConversationItem } from "@/lib/agent/item-projection";

export interface ConversationItemStore {
  upsert(userId: string, item: ConversationItem): Promise<void>;
  upsertMany(userId: string, items: ConversationItem[]): Promise<void>;
  list(userId: string, input?: { conversationId?: number | null; runId?: string }): Promise<ConversationItem[]>;
}

export class InMemoryConversationItemStore implements ConversationItemStore {
  private readonly items = new Map<string, { userId: string; item: ConversationItem }>();

  async upsert(userId: string, item: ConversationItem): Promise<void> {
    if (!userId.trim()) throw new Error("Conversation Item owner is required");
    const key = `${userId}:${item.itemId}`;
    const existing = this.items.get(key);
    this.items.set(key, {
      userId,
      item: existing ? { ...existing.item, ...clone(item), createdAt: existing.item.createdAt } : clone(item),
    });
  }

  async upsertMany(userId: string, items: ConversationItem[]): Promise<void> {
    for (const item of items) await this.upsert(userId, item);
  }

  async list(userId: string, input: { conversationId?: number | null; runId?: string } = {}): Promise<ConversationItem[]> {
    return Array.from(this.items.values())
      .filter((entry) => entry.userId === userId)
      .map((entry) => entry.item)
      .filter((item) => input.conversationId === undefined || item.conversationId === input.conversationId)
      .filter((item) => input.runId === undefined || item.runId === input.runId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.itemId.localeCompare(right.itemId))
      .map(clone);
  }
}

export class PostgresConversationItemStore implements ConversationItemStore {
  async upsert(userId: string, item: ConversationItem): Promise<void> {
    await withPostgresClient(async (client) => {
      await client.query(`
        INSERT INTO agent_conversation_items (
          item_id, user_id, conversation_id, run_id, event_cursor, item_type, schema_version,
          display_state, dedupe_key, payload_json, artifact_id, artifact_version, artifact_hash,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15)
        ON CONFLICT (item_id) DO UPDATE SET
          event_cursor = EXCLUDED.event_cursor,
          display_state = EXCLUDED.display_state,
          payload_json = EXCLUDED.payload_json,
          artifact_id = EXCLUDED.artifact_id,
          artifact_version = EXCLUDED.artifact_version,
          artifact_hash = EXCLUDED.artifact_hash,
          updated_at = EXCLUDED.updated_at
        WHERE agent_conversation_items.user_id = EXCLUDED.user_id
      `, [
        item.itemId,
        userId,
        item.conversationId,
        item.runId || null,
        item.eventCursor ?? null,
        item.type,
        item.schemaVersion,
        item.displayState,
        item.dedupeKey,
        JSON.stringify(item.payload),
        item.artifactRef ? String(item.artifactRef.id) : null,
        item.artifactRef ? String(item.artifactRef.version) : null,
        item.artifactRef?.hash || null,
        item.createdAt,
        item.updatedAt,
      ]);
    });
  }

  async upsertMany(userId: string, items: ConversationItem[]): Promise<void> {
    await withPostgresClient(async (client) => {
      await client.query("BEGIN");
      try {
        for (const item of items) {
          await client.query(`
            INSERT INTO agent_conversation_items (
              item_id, user_id, conversation_id, run_id, event_cursor, item_type, schema_version,
              display_state, dedupe_key, payload_json, artifact_id, artifact_version, artifact_hash,
              created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15)
            ON CONFLICT (item_id) DO UPDATE SET
              event_cursor = EXCLUDED.event_cursor,
              display_state = EXCLUDED.display_state,
              payload_json = EXCLUDED.payload_json,
              artifact_id = EXCLUDED.artifact_id,
              artifact_version = EXCLUDED.artifact_version,
              artifact_hash = EXCLUDED.artifact_hash,
              updated_at = EXCLUDED.updated_at
            WHERE agent_conversation_items.user_id = EXCLUDED.user_id
          `, [item.itemId, userId, item.conversationId, item.runId || null, item.eventCursor ?? null, item.type, item.schemaVersion, item.displayState, item.dedupeKey, JSON.stringify(item.payload), item.artifactRef ? String(item.artifactRef.id) : null, item.artifactRef ? String(item.artifactRef.version) : null, item.artifactRef?.hash || null, item.createdAt, item.updatedAt]);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async list(userId: string, input: { conversationId?: number | null; runId?: string } = {}): Promise<ConversationItem[]> {
    return withPostgresClient(async (client) => {
      const params: unknown[] = [userId];
      const where = ["user_id = $1"];
      if (input.conversationId !== undefined) {
        params.push(input.conversationId);
        where.push(`conversation_id IS NOT DISTINCT FROM $${params.length}`);
      }
      if (input.runId !== undefined) {
        params.push(input.runId);
        where.push(`run_id = $${params.length}`);
      }
      const result = await client.query(`
        SELECT * FROM agent_conversation_items
        WHERE ${where.join(" AND ")}
        ORDER BY created_at, item_id
      `, params);
      return result.rows.map(normalize);
    });
  }
}

function normalize(row: Record<string, unknown>): ConversationItem {
  return {
    itemId: String(row.item_id),
    conversationId: row.conversation_id === null || row.conversation_id === undefined ? null : Number(row.conversation_id),
    ...(row.run_id ? { runId: String(row.run_id) } : {}),
    ...(row.event_cursor === null || row.event_cursor === undefined ? {} : { eventCursor: Number(row.event_cursor) }),
    type: String(row.item_type) as ConversationItem["type"],
    schemaVersion: Number(row.schema_version || 1),
    displayState: String(row.display_state) as ConversationItem["displayState"],
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ""),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || ""),
    dedupeKey: String(row.dedupe_key || row.item_id),
    payload: record(row.payload_json),
    ...(row.artifact_id !== null && row.artifact_id !== undefined ? {
      artifactRef: {
        id: String(row.artifact_id),
        version: String(row.artifact_version),
        ...(row.artifact_hash ? { hash: String(row.artifact_hash) } : {}),
      },
    } : {}),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clone(item: ConversationItem): ConversationItem {
  return JSON.parse(JSON.stringify(item)) as ConversationItem;
}
