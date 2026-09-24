import { withPostgresClient } from "@/lib/postgres";

export interface MemorySupportGrant {
  id: number;
  userId: string;
  supportUserId: string;
  scope: string[];
  reason: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

function normalizeScope(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean))).slice(0, 20);
}

function toGrant(row: Record<string, unknown>): MemorySupportGrant {
  const rawScope = typeof row.scope_json === "string" ? JSON.parse(row.scope_json) : row.scope_json;
  const scope = rawScope && typeof rawScope === "object" && Array.isArray((rawScope as Record<string, unknown>).scopes)
    ? normalizeScope((rawScope as Record<string, unknown>).scopes)
    : [];
  return {
    id: Number(row.id),
    userId: String(row.user_id),
    supportUserId: String(row.support_user_id),
    scope,
    reason: String(row.reason || ""),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    revokedAt: row.revoked_at ? new Date(String(row.revoked_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export async function createMemorySupportGrant(input: {
  userId: string;
  supportUserId: string;
  scopes: string[];
  reason?: string;
  expiresAt: string | Date;
}): Promise<MemorySupportGrant> {
  if (!input.userId.trim() || !input.supportUserId.trim() || input.userId === input.supportUserId) {
    throw new Error("A distinct support identity is required");
  }
  const scopes = normalizeScope(input.scopes);
  if (!scopes.length) throw new Error("At least one support scope is required");
  const expiresAt = new Date(input.expiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) throw new Error("Support grant expiry must be in the future");
  if (expiresAt.getTime() > Date.now() + 30 * 24 * 60 * 60 * 1000) throw new Error("Support grant cannot exceed 30 days");
  return withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await client.query(
        `INSERT INTO memory_support_grants (user_id, support_user_id, scope_json, reason, expires_at)
         VALUES ($1,$2,$3::jsonb,$4,$5) RETURNING *`,
        [input.userId, input.supportUserId, JSON.stringify({ scopes }), String(input.reason || "").slice(0, 500), expiresAt.toISOString()],
      );
      const grant = toGrant(result.rows[0]);
      await client.query(
        `INSERT INTO memory_support_access_audit (grant_id, user_id, support_user_id, action, scope_json)
         VALUES ($1,$2,$3,'grant',$4::jsonb)`,
        [grant.id, input.userId, input.supportUserId, JSON.stringify({ scopes })],
      );
      await client.query("COMMIT");
      return grant;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function listMemorySupportGrants(userId: string): Promise<MemorySupportGrant[]> {
  return withPostgresClient(async (client) => {
    const result = await client.query(
      `SELECT * FROM memory_support_grants
       WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [userId],
    );
    return result.rows.map((row) => toGrant(row));
  });
}

export async function revokeMemorySupportGrant(userId: string, grantId: number): Promise<boolean> {
  return withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await client.query(
        `UPDATE memory_support_grants SET revoked_at=NOW()
         WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING *`,
        [grantId, userId],
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        return false;
      }
      const grant = toGrant(result.rows[0]);
      await client.query(
        `INSERT INTO memory_support_access_audit (grant_id, user_id, support_user_id, action, scope_json)
         VALUES ($1,$2,$3,'revoke',$4::jsonb)`,
        [grant.id, userId, grant.supportUserId, JSON.stringify({ scopes: grant.scope })],
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function assertMemorySupportAccess(input: {
  userId: string;
  supportUserId: string;
  scope: string;
}): Promise<MemorySupportGrant> {
  return withPostgresClient(async (client) => {
    const result = await client.query(
      `SELECT * FROM memory_support_grants
       WHERE user_id=$1 AND support_user_id=$2 AND revoked_at IS NULL
         AND expires_at > NOW()
         AND scope_json->'scopes' ? $3
       ORDER BY expires_at DESC LIMIT 1`,
      [input.userId, input.supportUserId, input.scope],
    );
    if (!result.rows[0]) throw new Error("Support memory access is not authorized");
    const grant = toGrant(result.rows[0]);
    await client.query(
      `INSERT INTO memory_support_access_audit (grant_id, user_id, support_user_id, action, scope_json)
       VALUES ($1,$2,$3,'read',$4::jsonb)`,
      [grant.id, input.userId, input.supportUserId, JSON.stringify({ scope: input.scope })],
    );
    return grant;
  });
}
