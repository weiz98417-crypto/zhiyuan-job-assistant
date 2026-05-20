import { describe, it, expect } from 'vitest';

// Simulate the core logic from scripts/check-isolation.mjs

const PRIVATE_TABLES = [
  'profiles', 'profile_signals', 'sessions', 'stories', 'cv_data',
  'applications', 'agent_preferences', 'session_memory', 'optimization_preferences',
];

const SAFE_CONTEXTS = ['PRAGMA table_info', 'CREATE TABLE', 'ALTER TABLE', '--'];

function checkContent(content: string): string[] {
  const violations: string[] = [];
  for (const table of PRIVATE_TABLES) {
    if (!content.includes(table)) continue;
    const hasUserId = content.includes('user_id');
    const hasAuth = content.includes('getCurrentUser') || content.includes('scopedDb');
    if (hasAuth) continue;
    if (!hasUserId) {
      const lines = content.split('\n');
      let usedInQuery = false;
      for (const line of lines) {
        if (
          line.includes(table) &&
          !SAFE_CONTEXTS.some(
            (ctx) =>
              line.includes(`${ctx} ${table}`) ||
              line.includes(`${ctx}(${table}`)
          )
        ) {
          usedInQuery = true;
          break;
        }
      }
      if (usedInQuery) violations.push(table);
    }
  }
  return violations;
}

describe('check-isolation logic', () => {
  it('passes when route has getCurrentUser', () => {
    const content = `
      import { getCurrentUser } from '@/lib/auth';
      const db = getDb();
      db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
    `;
    expect(checkContent(content)).toEqual([]);
  });

  it('passes when route has scopedDb', () => {
    const content = `
      import { scopedDb } from '@/lib/auth';
      const db = scopedDb(userId);
      db.get('SELECT * FROM profiles');
    `;
    expect(checkContent(content)).toEqual([]);
  });

  it('flags route using private table without user_id or auth', () => {
    const content = `
      const db = getDb();
      db.prepare('SELECT * FROM profiles').all();
    `;
    const violations = checkContent(content);
    expect(violations).toContain('profiles');
  });

  it('ignores CREATE TABLE and ALTER TABLE statements', () => {
    const content = `
      CREATE TABLE IF NOT EXISTS profiles (id INTEGER PRIMARY KEY);
      ALTER TABLE profiles ADD COLUMN user_id TEXT;
    `;
    expect(checkContent(content)).toEqual([]);
  });

  it('passes when route does not reference any private table', () => {
    const content = `
      import { getDb } from '@/lib/server-db';
      const db = getDb();
      db.prepare('SELECT * FROM offers').all();
      db.prepare('SELECT * FROM jds').all();
    `;
    expect(checkContent(content)).toEqual([]);
  });
});
