import type Database from 'better-sqlite3';

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
