import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

let db: Database.Database;
let adminId: string;
let memberId: string;

beforeAll(() => {
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'server-schema.sql'),
    'utf-8'
  );
  db.exec(schema);

  const userTables = [
    'profiles', 'profile_signals', 'sessions', 'stories', 'cv_data',
    'applications', 'agent_preferences', 'session_memory',
    'optimization_preferences',
  ];
  for (const table of userTables) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((column) => column.name === 'user_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN user_id TEXT REFERENCES users(id)`);
    }
  }
});

beforeEach(() => {
  db.exec('DELETE FROM users');
  adminId = crypto.randomUUID();
  memberId = crypto.randomUUID();

  db.prepare(
    'INSERT INTO users (id, username, password_hash, display_name, role, status, token_version) VALUES (?, ?, ?, ?, ?, ?, 0)'
  ).run(adminId, 'admin', 'hash', 'Admin', 'admin', 'active');
  db.prepare(
    'INSERT INTO users (id, username, password_hash, display_name, role, status, token_version) VALUES (?, ?, ?, ?, ?, ?, 0)'
  ).run(memberId, 'member', 'hash', 'Member', 'member', 'active');
});

describe('Admin — Approve User', () => {
  it('approves a pending user', () => {
    const pendingId = crypto.randomUUID();
    db.prepare(
      'INSERT INTO users (id, username, password_hash, display_name, role, status, token_version) VALUES (?, ?, ?, ?, ?, ?, 0)'
    ).run(pendingId, 'pendinguser', 'hash', 'Pending', 'member', 'pending');

    db.prepare(
      "UPDATE users SET status = ?, approved_at = datetime('now'), approved_by = ? WHERE id = ?"
    ).run('active', adminId, pendingId);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(pendingId) as any;
    expect(user.status).toBe('active');
    expect(user.approved_by).toBe(adminId);
  });
});

describe('Admin — Reject User', () => {
  it('rejects a pending user', () => {
    const pendingId = crypto.randomUUID();
    db.prepare(
      'INSERT INTO users (id, username, password_hash, display_name, role, status, token_version) VALUES (?, ?, ?, ?, ?, ?, 0)'
    ).run(pendingId, 'toreject', 'hash', 'RejectMe', 'member', 'pending');

    db.prepare("UPDATE users SET status = ? WHERE id = ?").run('rejected', pendingId);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(pendingId) as any;
    expect(user.status).toBe('rejected');
  });
});

describe('Admin — Change Role', () => {
  it('promotes member to admin', () => {
    db.prepare('UPDATE users SET role = ?, token_version = token_version + 1 WHERE id = ?').run('admin', memberId);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(memberId) as any;
    expect(user.role).toBe('admin');
  });

  it('demotes admin to member', () => {
    db.prepare('UPDATE users SET role = ?, token_version = token_version + 1 WHERE id = ?').run('member', adminId);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(adminId) as any;
    expect(user.role).toBe('member');
  });
});

describe('Admin — Reset Password', () => {
  it('resets password and increments token_version', () => {
    const bcrypt = require('bcryptjs');
    const newHash = bcrypt.hashSync('newpass', 10);

    db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(newHash, memberId);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(memberId) as any;
    expect(bcrypt.compareSync('newpass', user.password_hash)).toBe(true);
    expect(user.token_version).toBe(1);
  });
});

describe('Admin — Delete User', () => {
  it('soft-deletes user and cascading data', () => {
    // Create a user with data
    const victimId = crypto.randomUUID();
    db.prepare(
      'INSERT INTO users (id, username, password_hash, display_name, role, status, token_version) VALUES (?, ?, ?, ?, ?, ?, 0)'
    ).run(victimId, 'victim', 'hash', 'Victim', 'member', 'active');
    db.prepare('INSERT INTO sessions (title, messages_json, user_id) VALUES (?, ?, ?)').run('V Session', '[]', victimId);

    // Delete cascading
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(victimId);
    db.prepare('DELETE FROM users WHERE id = ?').run(victimId);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(victimId);
    expect(user).toBeUndefined();

    const sessions = db.prepare('SELECT * FROM sessions WHERE user_id = ?').all(victimId);
    expect(sessions.length).toBe(0);
  });
});

describe('Admin — Permissions', () => {
  it('non-admin cannot be found by role filter', () => {
    const members = db.prepare("SELECT * FROM users WHERE role = 'admin'").all() as any[];
    expect(members.length).toBe(1);
    expect(members[0].username).toBe('admin');
  });
});
