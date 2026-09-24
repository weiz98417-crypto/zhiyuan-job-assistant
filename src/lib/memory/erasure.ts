import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { withPostgresClient } from "@/lib/postgres";

export interface MemorySuppressionSource {
  sourceType: string;
  sourceId: string;
  subject?: string;
  predicate?: string;
}

export function memoryContentHash(content: string): string {
  return createHash("sha256").update(content.trim()).digest("hex");
}

export function memoryTargetKey(subject: string, predicate: string): string {
  return memoryContentHash(JSON.stringify([subject.trim().toLowerCase(), predicate.trim().toLowerCase()]));
}

export function hasExplicitMemoryErasureIntent(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (/^(?:我|i)\s*(?:忘记|忘掉|forgot|can't\s+remember)\b/i.test(normalized)) return false;
  const action = /(?:忘记|忘掉|删除|删掉|清除|移除|不要(?:再)?记住|forget|delete|remove)/i;
  if (!action.test(normalized)) return false;
  const requestPrefix = /^(?:请(?:帮我|你)?|帮我|麻烦|能否|可以|我要|我想|我不想|我不要再|please|can\s+you|could\s+you)\s*/i;
  const imperative = /^(?:忘记|忘掉|删除|删掉|清除|移除|不要(?:再)?记住|forget|delete|remove)/i;
  if (!requestPrefix.test(normalized) && !imperative.test(normalized)) return false;
  return true;
}

export async function isMemorySuppressed(
  userId: string,
  canonicalText: string,
  source?: MemorySuppressionSource,
  client?: PoolClient,
): Promise<boolean> {
  const targetKey = source?.subject && source.predicate
    ? memoryTargetKey(source.subject, source.predicate)
    : null;
  const query = async (db: PoolClient) => Boolean((await db.query(
    `SELECT 1 FROM memory_erasure_suppressions
     WHERE user_id=$1 AND lifted_at IS NULL
       AND (target_hash=$2 OR
         (target_key=$3 AND source_type=$4 AND source_id=$5))
     LIMIT 1`,
    [userId, memoryContentHash(canonicalText), targetKey, source?.sourceType ?? "", source?.sourceId ?? ""],
  )).rowCount);
  return client ? query(client) : withPostgresClient(query);
}

export async function liftMemorySuppression(
  userId: string,
  canonicalText: string,
  source?: MemorySuppressionSource,
  client?: PoolClient,
): Promise<number> {
  const targetKey = source?.subject && source.predicate
    ? memoryTargetKey(source.subject, source.predicate)
    : null;
  const query = async (db: PoolClient) => (await db.query(
    `UPDATE memory_erasure_suppressions
     SET lifted_at=now()
     WHERE user_id=$1 AND lifted_at IS NULL
       AND (target_hash=$2 OR
         (target_key=$3 AND source_type=$4 AND source_id=$5))`,
    [userId, memoryContentHash(canonicalText), targetKey, source?.sourceType ?? "", source?.sourceId ?? ""],
  )).rowCount ?? 0;
  return client ? query(client) : withPostgresClient(query);
}

export type MemoryErasureTargetType = "fact" | "legacy_item";

interface MemoryErasureScope {
  factIds: number[];
  itemIds: number[];
  episodeIds: number[];
  sourceRefs: Array<{ sourceType: string; sourceId: string }>;
  targetKey: string | null;
}

export interface MemoryErasureRequest {
  id: number;
  targetType: MemoryErasureTargetType;
  targetId: number;
  status: string;
  scope: MemoryErasureScope;
  createdAt: string;
  confirmedAt: string | null;
  completedAt: string | null;
}

interface ErasureTarget {
  canonicalText: string;
  subject: string | null;
  predicate: string | null;
}

export async function prepareMemoryErasure(
  userId: string,
  targetType: MemoryErasureTargetType,
  targetId: number,
): Promise<{ request: MemoryErasureRequest; canonicalText: string }> {
  return withPostgresClient(async (client) => {
    const target = await readErasureTarget(client, userId, targetType, targetId);
    if (!target) throw new Error("Memory not found");

    const facts = await client.query(
      `SELECT id, source_episode_id FROM memory_facts
       WHERE user_id=$1 AND canonical_text=$2`,
      [userId, target.canonicalText],
    );
    const items = await client.query(
      `SELECT id FROM memory_items WHERE user_id=$1 AND canonical_text=$2`,
      [userId, target.canonicalText],
    );
    const factIds = facts.rows.map((row) => Number(row.id));
    const itemIds = items.rows.map((row) => Number(row.id));
    const episodeIds = Array.from(new Set(facts.rows
      .map((row) => Number(row.source_episode_id))
      .filter((id) => Number.isInteger(id) && id > 0)));
    const sources = episodeIds.length
      ? (await client.query(
        `SELECT source_type, source_id FROM memory_episodes
         WHERE user_id=$1 AND id=ANY($2::bigint[])`,
        [userId, episodeIds],
      )).rows
      : [];
    const evidence = itemIds.length
      ? (await client.query(
        `SELECT source_type, source_id FROM memory_evidence
         WHERE user_id=$1 AND memory_item_id=ANY($2::bigint[])`,
        [userId, itemIds],
      )).rows
      : [];
    const sourceRefs = Array.from(new Map([...sources, ...evidence]
      .map((row) => {
        const sourceType = String(row.source_type);
        const sourceId = String(row.source_id);
        return [`${sourceType}:${sourceId}`, { sourceType, sourceId }] as const;
      })).values());
    const scope: MemoryErasureScope = {
      factIds,
      itemIds,
      episodeIds,
      sourceRefs,
      targetKey: target.subject && target.predicate
        ? memoryTargetKey(target.subject, target.predicate)
        : null,
    };
    const result = await client.query(
      `INSERT INTO memory_erasure_requests
        (user_id, target_type, target_id, target_hash, status, scope_json)
       VALUES ($1,$2,$3,$4,'pending_confirmation',$5::jsonb)
       RETURNING id, created_at`,
      [userId, targetType, targetId, memoryContentHash(target.canonicalText), JSON.stringify(scope)],
    );
    return {
      canonicalText: target.canonicalText,
      request: {
        id: Number(result.rows[0].id),
        targetType,
        targetId,
        status: "pending_confirmation",
        scope,
        createdAt: new Date(result.rows[0].created_at).toISOString(),
        confirmedAt: null,
        completedAt: null,
      },
    };
  });
}

export async function getMemoryErasureRequest(userId: string, requestId: number): Promise<MemoryErasureRequest | null> {
  return withPostgresClient(async (client) => {
    const result = await client.query(
      `SELECT id, target_type, target_id, status, scope_json,
              created_at, confirmed_at, completed_at
       FROM memory_erasure_requests WHERE id=$1 AND user_id=$2`,
      [requestId, userId],
    );
    if (!result.rows[0]) return null;
    return toErasureRequest(result.rows[0]);
  });
}

export async function confirmMemoryErasure(userId: string, requestId: number): Promise<MemoryErasureRequest> {
  await withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await client.query(
        `SELECT target_type, target_id, target_hash, status, scope_json
         FROM memory_erasure_requests WHERE id=$1 AND user_id=$2 FOR UPDATE`,
        [requestId, userId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Memory erasure request not found");
      if (row.status === "pending_confirmation") {
        const target = await readErasureTarget(
          client,
          userId,
          row.target_type as MemoryErasureTargetType,
          Number(row.target_id),
        );
        if (!target || memoryContentHash(target.canonicalText) !== row.target_hash) {
          throw new Error("Memory erasure scope changed; prepare again");
        }
        const scope = parseErasureScope(row.scope_json);
        const refs = scope.sourceRefs.length ? scope.sourceRefs : [{ sourceType: "", sourceId: "" }];
        for (const ref of refs) {
          await client.query(
            `INSERT INTO memory_erasure_suppressions
              (user_id, target_hash, target_key, source_type, source_id, request_id)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (user_id, target_hash, source_type, source_id)
             DO UPDATE SET lifted_at=NULL, request_id=EXCLUDED.request_id`,
            [userId, row.target_hash, scope.targetKey, ref.sourceType, ref.sourceId, requestId],
          );
        }
        await client.query(
          `UPDATE memory_erasure_requests
           SET status='pending', confirmed_at=now()
           WHERE id=$1 AND user_id=$2`,
          [requestId, userId],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
  await executeMemoryErasure(userId, requestId);
  const request = await getMemoryErasureRequest(userId, requestId);
  if (!request) throw new Error("Memory erasure request not found");
  return request;
}

export async function cancelMemoryErasure(userId: string, requestId: number): Promise<boolean> {
  return withPostgresClient(async (client) => Boolean((await client.query(
    `UPDATE memory_erasure_requests
     SET status='cancelled'
     WHERE id=$1 AND user_id=$2 AND status='pending_confirmation'`,
    [requestId, userId],
  )).rowCount));
}

async function readErasureTarget(
  client: PoolClient,
  userId: string,
  targetType: MemoryErasureTargetType,
  targetId: number,
): Promise<ErasureTarget | null> {
  const result = targetType === "fact"
    ? await client.query(
       `SELECT canonical_text, subject, predicate FROM memory_facts
        WHERE id=$1 AND user_id=$2`,
      [targetId, userId],
    )
    : await client.query(
      `SELECT canonical_text FROM memory_items WHERE id=$1 AND user_id=$2`,
      [targetId, userId],
    );
  if (!result.rows[0]) return null;
  return {
    canonicalText: String(result.rows[0].canonical_text),
    subject: result.rows[0].subject ? String(result.rows[0].subject) : null,
    predicate: result.rows[0].predicate ? String(result.rows[0].predicate) : null,
  };
}

function parseErasureScope(value: unknown): MemoryErasureScope {
  const scope = typeof value === "string" ? JSON.parse(value) as MemoryErasureScope : value as MemoryErasureScope;
  if (!scope || !Array.isArray(scope.factIds) || !Array.isArray(scope.itemIds)
    || !Array.isArray(scope.episodeIds) || !Array.isArray(scope.sourceRefs)) {
    throw new Error("Invalid memory erasure scope");
  }
  return scope;
}

function toErasureRequest(row: Record<string, unknown>): MemoryErasureRequest {
  return {
    id: Number(row.id),
    targetType: row.target_type as MemoryErasureTargetType,
    targetId: Number(row.target_id),
    status: String(row.status),
    scope: parseErasureScope(row.scope_json),
    createdAt: new Date(String(row.created_at)).toISOString(),
    confirmedAt: row.confirmed_at ? new Date(String(row.confirmed_at)).toISOString() : null,
    completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
  };
}

async function executeMemoryErasure(userId: string, requestId: number): Promise<void> {
  try {
    const execution = await withPostgresClient(async (client) => {
      const requestResult = await client.query(
        `SELECT target_type, target_id, status, scope_json, completed_layers_json
         FROM memory_erasure_requests WHERE id=$1 AND user_id=$2`,
        [requestId, userId],
      );
      const request = requestResult.rows[0];
      if (!request) throw new Error("Memory erasure request not found");
      if (String(request.status) === "cancelled") throw new Error("Memory erasure request was cancelled");
      if (String(request.status) === "completed") return null;
      return {
        targetType: request.target_type as MemoryErasureTargetType,
        targetId: Number(request.target_id),
        scope: parseErasureScope(request.scope_json),
        completedLayers: parseCompletedLayers(request.completed_layers_json),
      };
    });

    if (!execution) return;

    const sessionRefs = execution.scope.sourceRefs.filter((source) => source.sourceType === "session");
    let target: ErasureTarget | null = null;
    const needsTarget = !execution.completedLayers.session;
    if (needsTarget) {
      target = await withPostgresClient((client) => readErasureTarget(
        client,
        userId,
        execution.targetType,
        execution.targetId,
      ));
      if (!target && !execution.completedLayers.session) throw new Error("Memory erasure target is no longer available");
    }

    if (!execution.completedLayers.session) {
      if (sessionRefs.length) {
        const { eraseConversationMemory } = await import("@/lib/memory/postgres-memory");
        for (const ref of sessionRefs) {
          if (!target) throw new Error("Memory erasure target is no longer available for session cleanup");
          await eraseConversationMemory(
            { userId },
            { conversationId: Number(ref.sourceId), targetText: target!.canonicalText },
          );
        }
      }
      await markErasureLayer(userId, requestId, "session");
    }

    if (!execution.completedLayers.postgres) {
      const postgresTarget = target || await withPostgresClient((client) => readErasureTarget(
        client,
        userId,
        execution.targetType,
        execution.targetId,
      ));
      await executePostgresErasureLayer(userId, requestId, execution.scope, postgresTarget);
    }
  } catch (error) {
    await withPostgresClient((client) => client.query(
       `UPDATE memory_erasure_requests
        SET status='failed', last_error=$3
        WHERE id=$1 AND user_id=$2 AND status <> 'completed'`,
      [requestId, userId, error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)],
    )).catch(() => undefined);
    throw error;
  }
}

interface CompletedErasureLayers {
  session: boolean;
  postgres: boolean;
}

function parseCompletedLayers(value: unknown): CompletedErasureLayers {
  const parsed = typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : value as Record<string, unknown>;
  return {
    session: parsed?.session === true,
    postgres: parsed?.postgres === true,
  };
}

async function markErasureLayer(userId: string, requestId: number, layer: "session" | "postgres"): Promise<void> {
  await withPostgresClient((client) => client.query(
    `UPDATE memory_erasure_requests
     SET status='pending',
         completed_layers_json=jsonb_set(COALESCE(completed_layers_json, '{}'::jsonb), $3::text[], 'true'::jsonb, true),
         last_error=NULL
     WHERE id=$1 AND user_id=$2 AND status <> 'completed'`,
     [requestId, userId, [layer]],
  ));
}

async function executePostgresErasureLayer(
  userId: string,
  requestId: number,
  scope: MemoryErasureScope,
  target: ErasureTarget | null,
): Promise<void> {
  await withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      if (scope.factIds.length) {
        await client.query(
          `DELETE FROM memory_admission_candidates
           WHERE user_id=$1 AND (fact_id=ANY($2::bigint[])
             OR ($3::text IS NOT NULL AND canonical_text=$3))`,
          [userId, scope.factIds, target?.canonicalText ?? null],
        );
        await client.query(
          `UPDATE memory_facts
           SET superseded_by=NULL
           WHERE user_id=$1 AND superseded_by=ANY($2::bigint[])`,
          [userId, scope.factIds],
        );
        await client.query(
          `UPDATE memory_facts
           SET decision_id=NULL
           WHERE user_id=$1
             AND decision_id IN (
               SELECT id FROM memory_fact_decisions
               WHERE user_id=$1
                 AND (target_fact_id=ANY($2::bigint[]) OR result_fact_id=ANY($2::bigint[]))
             )`,
          [userId, scope.factIds],
        );
        await client.query(
          `DELETE FROM memory_fact_decisions
           WHERE user_id=$1
             AND (target_fact_id=ANY($2::bigint[]) OR result_fact_id=ANY($2::bigint[]))`,
          [userId, scope.factIds],
        );
        await client.query("DELETE FROM memory_fact_chunks WHERE fact_id=ANY($1::bigint[])", [scope.factIds]);
        await client.query("DELETE FROM memory_profile_block_facts WHERE fact_id=ANY($1::bigint[])", [scope.factIds]);
        await client.query("DELETE FROM memory_entity_facts WHERE fact_id=ANY($1::bigint[])", [scope.factIds]);
        await client.query("DELETE FROM memory_facts WHERE id=ANY($1::bigint[]) AND user_id=$2", [scope.factIds, userId]);
      }
      if (scope.itemIds.length) {
        await client.query("DELETE FROM memory_evidence WHERE memory_item_id=ANY($1::bigint[]) AND user_id=$2", [scope.itemIds, userId]);
        await client.query("DELETE FROM memory_items WHERE id=ANY($1::bigint[]) AND user_id=$2", [scope.itemIds, userId]);
      }
      if (scope.episodeIds.length && target) {
        await client.query(
          `UPDATE memory_episodes
           SET content_json=replace(content_json::text, $2, '[已清除]')::jsonb
           WHERE id=ANY($1::bigint[]) AND user_id=$3`,
          [scope.episodeIds, target.canonicalText, userId],
        );
      }
      if (target) {
        const { redactSessionMessagesForUser } = await import("@/lib/memory/postgres-memory");
        await redactSessionMessagesForUser(client, userId, target.canonicalText);
        const executionRows = await client.query(
          `SELECT id, content FROM session_memory
           WHERE user_id=$1 AND summary_type='execution_conversation'
           FOR UPDATE`,
          [userId],
        );
        for (const row of executionRows.rows as Array<{ id: number; content?: unknown }>) {
          let parsed: unknown;
          try { parsed = typeof row.content === "string" ? JSON.parse(row.content) : row.content; } catch { parsed = null; }
          if (!parsed || typeof parsed !== "object") continue;
          const redact = (value: unknown): unknown => {
            if (typeof value === "string") return value.split(target.canonicalText).join("[已删除]");
            if (Array.isArray(value)) return value.map(redact);
            if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
            return value;
          };
          const next = redact(parsed);
          if (JSON.stringify(next) !== JSON.stringify(parsed)) {
            await client.query("UPDATE session_memory SET content=$1 WHERE id=$2 AND user_id=$3", [JSON.stringify(next), row.id, userId]);
          }
        }
        await client.query(
          `UPDATE memory_entities
           SET summary=replace(summary, $2, '[已清除]'), updated_at=now()
           WHERE user_id=$1 AND strpos(summary, $2) > 0`,
          [userId, target.canonicalText],
        );
        await client.query(
          `UPDATE profile_blocks
           SET value_json=replace(value_json::text, $2, '[已清除]')::jsonb, updated_at=now()
           WHERE user_id=$1 AND strpos(value_json::text, $2) > 0`,
          [userId, target.canonicalText],
        );
        await client.query(
          `UPDATE session_memory
            SET content=replace(content, $2, '[已清除]')
            WHERE user_id=$1 AND summary_type <> 'execution_conversation'
              AND strpos(content, $2) > 0`,
          [userId, target.canonicalText],
        );
        await client.query(
          `DELETE FROM memory_chunks
           WHERE user_id=$1 AND strpos(chunk_text, $2) > 0`,
          [userId, target.canonicalText],
        );
      }
      await client.query(
        `UPDATE memory_entities e
         SET summary = COALESCE((
           SELECT string_agg(f.canonical_text, '; ' ORDER BY f.valid_at DESC, f.id DESC)
           FROM memory_entity_facts ef
           JOIN memory_facts f ON f.id = ef.fact_id AND f.user_id = e.user_id
           WHERE ef.entity_id = e.id AND f.invalid_at IS NULL
         ), ''), updated_at=NOW()
         WHERE e.user_id=$1`,
        [userId],
      );
      if (target) {
        await client.query(
          `DELETE FROM memory_admission_candidates
           WHERE user_id=$1 AND canonical_text=$2`,
          [userId, target.canonicalText],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
  await verifyPostgresErasureReadBack(userId, requestId, scope, target);
  await withPostgresClient((client) => client.query(
    `UPDATE memory_erasure_requests
     SET status='completed',
         completed_layers_json=jsonb_set(
           jsonb_set(COALESCE(completed_layers_json, '{}'::jsonb), '{session}', 'true'::jsonb, true),
           '{postgres}', 'true'::jsonb, true
         ),
         completed_at=now(), last_error=NULL
     WHERE id=$1 AND user_id=$2 AND status <> 'cancelled'`,
    [requestId, userId],
  ));
}

async function verifyPostgresErasureReadBack(
  userId: string,
  requestId: number,
  scope: MemoryErasureScope,
  target: ErasureTarget | null,
): Promise<void> {
  await withPostgresClient(async (client) => {
    if (scope.factIds.length) {
      const result = await client.query(
        "SELECT 1 FROM memory_facts WHERE user_id=$1 AND id=ANY($2::bigint[]) LIMIT 1",
        [userId, scope.factIds],
      );
      if (result.rowCount) throw new Error("Memory erasure read-back failed at facts");
    }
    if (scope.itemIds.length) {
      const result = await client.query(
        "SELECT 1 FROM memory_items WHERE user_id=$1 AND id=ANY($2::bigint[]) LIMIT 1",
        [userId, scope.itemIds],
      );
      if (result.rowCount) throw new Error("Memory erasure read-back failed at items");
    }
    if (target) {
      const candidates = await client.query(
        `SELECT 1 FROM memory_admission_candidates
         WHERE user_id=$1 AND status <> 'rejected' AND canonical_text=$2 LIMIT 1`,
        [userId, target.canonicalText],
      );
      if (candidates.rowCount) throw new Error("Memory erasure read-back failed at candidates");
    }
    if (target) {
      const checks: Array<[string, string, unknown[]]> = [
        ["episodes", "SELECT 1 FROM memory_episodes WHERE user_id=$1 AND id=ANY($2::bigint[]) AND strpos(content_json::text, $3) > 0 LIMIT 1", [userId, scope.episodeIds, target.canonicalText]],
        ["entities", "SELECT 1 FROM memory_entities WHERE user_id=$1 AND strpos(summary, $2) > 0 LIMIT 1", [userId, target.canonicalText]],
        ["profiles", "SELECT 1 FROM profile_blocks WHERE user_id=$1 AND strpos(value_json::text, $2) > 0 LIMIT 1", [userId, target.canonicalText]],
        ["sessions", "SELECT 1 FROM sessions WHERE user_id=$1 AND deleted_at IS NULL AND strpos(messages_json::text, $2) > 0 LIMIT 1", [userId, target.canonicalText]],
        ["session_memory", "SELECT 1 FROM session_memory WHERE user_id=$1 AND strpos(content, $2) > 0 LIMIT 1", [userId, target.canonicalText]],
        ["chunks", "SELECT 1 FROM memory_chunks WHERE user_id=$1 AND strpos(chunk_text, $2) > 0 LIMIT 1", [userId, target.canonicalText]],
      ] as const;
      for (const [name, sql, params] of checks) {
        try {
          const result = await client.query(sql, params);
          if (result.rowCount) throw new Error(`Memory erasure read-back failed at ${name}`);
        } catch (error) {
          if ((error as { code?: string })?.code === "42P01") continue;
          throw error;
        }
      }
    }
    const suppression = await client.query(
      "SELECT 1 FROM memory_erasure_suppressions WHERE user_id=$1 AND request_id=$2 AND lifted_at IS NULL LIMIT 1",
      [userId, requestId],
    );
    if (!suppression.rowCount) throw new Error("Memory erasure suppression read-back failed");
  });
}
