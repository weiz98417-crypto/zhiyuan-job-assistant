import { createHash } from "node:crypto";
import { getDatabaseDriver, withPostgresClient } from "@/lib/postgres";
import { getDb } from "@/lib/server-db";

export function jdResumeMatchingSourceHash(jdText: string): string {
  const normalized = jdText.replace(/\s+/g, " ").trim();
  return normalized.length >= 50
    ? createHash("sha256").update(normalized).digest("hex")
    : "";
}

export async function getJDResumeMatchingPreference(userId: string, jdText: string): Promise<boolean | null> {
  const sourceHash = jdResumeMatchingSourceHash(jdText);
  if (!sourceHash) return null;
  if (getDatabaseDriver() === "postgres") {
    return withPostgresClient(async (client) => {
      const result = await client.query(
        "SELECT match_resume FROM jd_resume_matching_preferences WHERE user_id = $1 AND source_hash = $2",
        [userId, sourceHash],
      );
      return result.rows[0] ? result.rows[0].match_resume === true : null;
    });
  }
  const row = getDb().prepare(
    "SELECT match_resume FROM jd_resume_matching_preferences WHERE user_id = ? AND source_hash = ?",
  ).get(userId, sourceHash) as { match_resume: number } | undefined;
  return row ? row.match_resume === 1 : null;
}

export async function setJDResumeMatchingPreference(userId: string, jdText: string, matchResume: boolean): Promise<void> {
  const sourceHash = jdResumeMatchingSourceHash(jdText);
  if (!sourceHash) return;
  if (getDatabaseDriver() === "postgres") {
    await withPostgresClient(async (client) => {
      await client.query(`
        INSERT INTO jd_resume_matching_preferences (user_id, source_hash, match_resume)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, source_hash)
        DO UPDATE SET match_resume = EXCLUDED.match_resume, updated_at = now()
      `, [userId, sourceHash, matchResume]);
    });
    return;
  }
  getDb().prepare(`
    INSERT INTO jd_resume_matching_preferences (user_id, source_hash, match_resume)
    VALUES (?, ?, ?)
    ON CONFLICT (user_id, source_hash)
    DO UPDATE SET match_resume = excluded.match_resume, updated_at = datetime('now')
  `).run(userId, sourceHash, matchResume ? 1 : 0);
}
