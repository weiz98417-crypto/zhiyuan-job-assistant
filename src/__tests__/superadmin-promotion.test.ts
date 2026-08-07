import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { planSoleAdminPromotion } from '../../scripts/lib/superadmin-promotion.mjs';

describe('sole administrator promotion planning', () => {
  it('promotes the one expected active administrator', () => {
    expect(planSoleAdminPromotion([
      { id: 'admin-1', username: 'admin', role: 'admin', status: 'active' },
    ], 'admin')).toEqual({ action: 'promote', userId: 'admin-1', username: 'admin' });
  });

  it('is idempotent when the expected account is already the sole superadmin', () => {
    expect(planSoleAdminPromotion([
      { id: 'admin-1', username: 'admin', role: 'superadmin', status: 'active' },
    ], 'admin')).toEqual({ action: 'noop', userId: 'admin-1', username: 'admin' });
  });

  it('refuses ambiguous privileged-account state', () => {
    expect(() => planSoleAdminPromotion([
      { id: 'admin-1', username: 'admin', role: 'admin', status: 'active' },
      { id: 'admin-2', username: 'backup', role: 'admin', status: 'active' },
    ], 'admin')).toThrow('exactly one active privileged account');
  });

  it('refuses to promote an unexpected account', () => {
    expect(() => planSoleAdminPromotion([
      { id: 'admin-1', username: 'admin', role: 'admin', status: 'active' },
    ], 'owner')).toThrow('does not match');
  });

  it('atomically promotes and audits an SQLite account through the CLI', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'zhiyuan-superadmin-'));
    const databasePath = path.join(directory, 'security.db');
    const database = new Database(databasePath);
    try {
      database.exec(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          role TEXT NOT NULL,
          status TEXT NOT NULL,
          token_version INTEGER NOT NULL DEFAULT 0,
          last_security_event_at TEXT
        );
        CREATE TABLE auth_security_events (
          id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          actor_user_id TEXT,
          target_user_id TEXT,
          actor_role TEXT,
          outcome TEXT NOT NULL,
          request_id TEXT NOT NULL,
          user_agent TEXT,
          metadata_json TEXT NOT NULL
        );
        INSERT INTO users (id, username, role, status) VALUES ('admin-1', 'admin', 'admin', 'active');
      `);
      database.close();

      const output = execFileSync(process.execPath, [
        'scripts/promote-sole-admin.mjs',
        '--apply',
        '--driver', 'sqlite',
        '--sqlite', databasePath,
        '--username', 'admin',
      ], { cwd: process.cwd(), encoding: 'utf8' });

      const verified = new Database(databasePath, { readonly: true });
      expect(verified.prepare('SELECT role, token_version FROM users WHERE id = ?').get('admin-1'))
        .toEqual({ role: 'superadmin', token_version: 1 });
      expect(verified.prepare('SELECT event_type, outcome, target_user_id FROM auth_security_events').get())
        .toEqual({ event_type: 'role_change', outcome: 'success', target_user_id: 'admin-1' });
      verified.close();
      expect(output).toContain('apply: promote admin (admin-1)');
    } finally {
      if (database.open) database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
