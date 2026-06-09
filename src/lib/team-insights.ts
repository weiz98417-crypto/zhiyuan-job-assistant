import type Database from 'better-sqlite3';
import { getDatabaseDriver, withPostgresClient } from './postgres';
import { getDb } from './server-db';

export interface TeamInsights {
  overview: {
    totalUsers: number;
    activeThisWeek: number;
    pendingApprovals: number;
  };
  weeklyActivity: Array<{ displayName: string; count: number }>;
  hotDirections: Array<{ archetype: string; count: number }>;
  weeklyTrend: Array<{ week: string; count: number }>;
}

export function getTeamInsights(db: Database.Database): TeamInsights {
  const totalUsers = (
    db.prepare('SELECT COUNT(*) as c FROM users WHERE status = ?').get('active') as { c: number }
  ).c;

  const activeThisWeek = (
    db.prepare(`
      SELECT COUNT(DISTINCT user_id) as c FROM reports
      WHERE date >= date('now', '-7 days')
    `).get() as { c: number }
  ).c;

  const pendingApprovals = (
    db.prepare('SELECT COUNT(*) as c FROM users WHERE status = ?').get('pending') as { c: number }
  ).c;

  const weeklyActivity = db.prepare(`
    SELECT u.display_name as displayName, COUNT(*) as count
    FROM reports r JOIN users u ON r.user_id = u.id
    WHERE r.date >= date('now', '-7 days')
    GROUP BY r.user_id
    ORDER BY count DESC
  `).all() as Array<{ displayName: string; count: number }>;

  const hotDirections = db.prepare(`
    SELECT archetype, COUNT(*) as count
    FROM reports
    WHERE date >= date('now', '-30 days') AND archetype != ''
    GROUP BY archetype
    ORDER BY count DESC
    LIMIT 10
  `).all() as Array<{ archetype: string; count: number }>;

  const weeklyTrend = db.prepare(`
    SELECT strftime('%Y-%W', date) as week, COUNT(*) as count
    FROM reports
    WHERE date >= date('now', '-28 days')
    GROUP BY week
    ORDER BY week
  `).all() as Array<{ week: string; count: number }>;

  return {
    overview: { totalUsers, activeThisWeek, pendingApprovals },
    weeklyActivity,
    hotDirections,
    weeklyTrend,
  };
}

export async function getTeamInsightsForSelectedDatabase(): Promise<TeamInsights> {
  if (getDatabaseDriver() !== 'postgres') {
    return getTeamInsights(getDb());
  }

  return withPostgresClient(async (client) => {
    const [totalUsers, activeThisWeek, pendingApprovals, weeklyActivity, hotDirections, weeklyTrend] = await Promise.all([
      client.query("SELECT COUNT(*) AS c FROM users WHERE status = $1", ['active']),
      client.query(`
        SELECT COUNT(DISTINCT user_id) AS c FROM reports
        WHERE date ~ '^\\d{4}-\\d{2}-\\d{2}' AND date::date >= current_date - interval '7 days'
      `),
      client.query("SELECT COUNT(*) AS c FROM users WHERE status = $1", ['pending']),
      client.query(`
        SELECT u.display_name AS "displayName", COUNT(*)::int AS count
        FROM reports r JOIN users u ON r.user_id = u.id
        WHERE r.date ~ '^\\d{4}-\\d{2}-\\d{2}' AND r.date::date >= current_date - interval '7 days'
        GROUP BY r.user_id, u.display_name
        ORDER BY count DESC
      `),
      client.query(`
        SELECT archetype, COUNT(*)::int AS count
        FROM reports
        WHERE date ~ '^\\d{4}-\\d{2}-\\d{2}' AND date::date >= current_date - interval '30 days' AND archetype != ''
        GROUP BY archetype
        ORDER BY count DESC
        LIMIT 10
      `),
      client.query(`
        SELECT to_char(date::date, 'IYYY-IW') AS week, COUNT(*)::int AS count
        FROM reports
        WHERE date ~ '^\\d{4}-\\d{2}-\\d{2}' AND date::date >= current_date - interval '28 days'
        GROUP BY week
        ORDER BY week
      `),
    ]);

    return {
      overview: {
        totalUsers: Number(totalUsers.rows[0]?.c || 0),
        activeThisWeek: Number(activeThisWeek.rows[0]?.c || 0),
        pendingApprovals: Number(pendingApprovals.rows[0]?.c || 0),
      },
      weeklyActivity: weeklyActivity.rows.map((row) => ({ displayName: row.displayName, count: Number(row.count || 0) })),
      hotDirections: hotDirections.rows.map((row) => ({ archetype: row.archetype, count: Number(row.count || 0) })),
      weeklyTrend: weeklyTrend.rows.map((row) => ({ week: row.week, count: Number(row.count || 0) })),
    };
  });
}
