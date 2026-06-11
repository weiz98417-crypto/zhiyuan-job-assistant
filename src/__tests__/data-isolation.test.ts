import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

let db: Database.Database;
let userA: string;
let userB: string;

beforeAll(() => {
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'server-schema.sql'),
    'utf-8'
  );
  db.exec(schema);

  // Run the user_id migration (mirrors server-db.ts getDb())
  const userTables = [
    'profiles', 'profile_signals', 'sessions', 'stories', 'cv_data',
    'applications', 'agent_preferences', 'session_memory',
    'optimization_preferences', 'offers', 'offer_reports',
  ];
  for (const table of userTables) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === 'user_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN user_id TEXT REFERENCES users(id)`);
    }
  }
});

beforeEach(() => {
  // Clean slate: clear all data, create two users
  db.exec('DELETE FROM sessions');
  db.exec('DELETE FROM applications');
  db.exec('DELETE FROM profiles');
  db.exec('DELETE FROM stories');
  db.exec('DELETE FROM cv_data');
  db.exec('DELETE FROM agent_preferences');
  db.exec('DELETE FROM session_memory');
  db.exec('DELETE FROM optimization_preferences');
  db.exec('DELETE FROM profile_signals');
  db.exec('DELETE FROM offer_reports');
  db.exec('DELETE FROM offers');
  db.exec('DELETE FROM users');

  userA = crypto.randomUUID();
  userB = crypto.randomUUID();

  db.prepare(
    'INSERT INTO users (id, username, password_hash, display_name, role, status, token_version) VALUES (?, ?, ?, ?, ?, ?, 0)'
  ).run(userA, 'userA', 'hash', 'User A', 'member', 'active');
  db.prepare(
    'INSERT INTO users (id, username, password_hash, display_name, role, status, token_version) VALUES (?, ?, ?, ?, ?, ?, 0)'
  ).run(userB, 'userB', 'hash', 'User B', 'member', 'active');
});

describe('Data Isolation — Applications', () => {
  it('user A cannot see user B applications', () => {
    db.prepare(
      'INSERT INTO applications (user_id, num, date, company, role, score, status, pdf_generated, report_path, notes) VALUES (?, 1, ?, ?, ?, ?, ?, 0, ?, ?)'
    ).run(userA, '2026-05-18', 'CompanyA', 'RoleA', 4.5, 'Evaluated', '', '');
    db.prepare(
      'INSERT INTO applications (user_id, num, date, company, role, score, status, pdf_generated, report_path, notes) VALUES (?, 1, ?, ?, ?, ?, ?, 0, ?, ?)'
    ).run(userB, '2026-05-18', 'CompanyB', 'RoleB', 3.0, 'Evaluated', '', '');

    const aApps = db.prepare('SELECT * FROM applications WHERE user_id = ?').all(userA) as any[];
    const bApps = db.prepare('SELECT * FROM applications WHERE user_id = ?').all(userB) as any[];

    expect(aApps.length).toBe(1);
    expect(aApps[0].company).toBe('CompanyA');
    expect(bApps.length).toBe(1);
    expect(bApps[0].company).toBe('CompanyB');
  });
});

describe('Data Isolation — Sessions', () => {
  it('user A cannot see user B sessions', () => {
    db.prepare('INSERT INTO sessions (title, messages_json, user_id) VALUES (?, ?, ?)').run('Session A', '[]', userA);
    db.prepare('INSERT INTO sessions (title, messages_json, user_id) VALUES (?, ?, ?)').run('Session B', '[]', userB);

    const aSessions = db.prepare('SELECT * FROM sessions WHERE user_id = ? AND deleted_at IS NULL').all(userA) as any[];
    const bSessions = db.prepare('SELECT * FROM sessions WHERE user_id = ? AND deleted_at IS NULL').all(userB) as any[];

    expect(aSessions.length).toBe(1);
    expect(aSessions[0].title).toBe('Session A');
    expect(bSessions.length).toBe(1);
    expect(bSessions[0].title).toBe('Session B');
  });
});

describe('Data Isolation — Profiles', () => {
  it('user A cannot see user B profile', () => {
    db.prepare('INSERT INTO profiles (user_id, data_json, goals_json, history_json) VALUES (?, ?, ?, ?)').run(userA, '{"name":"A"}', '{}', '[]');
    db.prepare('INSERT INTO profiles (user_id, data_json, goals_json, history_json) VALUES (?, ?, ?, ?)').run(userB, '{"name":"B"}', '{}', '[]');

    const aProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userA) as any;
    const bProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userB) as any;

    expect(JSON.parse(aProfile.data_json).name).toBe('A');
    expect(JSON.parse(bProfile.data_json).name).toBe('B');
  });
});

describe('Data Isolation — Offers', () => {
  it('user A cannot see user B offers', () => {
    db.prepare(
      'INSERT INTO offers (user_id, company, role, monthly_salary, months_per_year, housing_fund_rate, probation_months, benefits_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(userA, 'OfferCoA', 'Dev', 30000, 12, 7, 3, '{}');
    db.prepare(
      'INSERT INTO offers (user_id, company, role, monthly_salary, months_per_year, housing_fund_rate, probation_months, benefits_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(userB, 'OfferCoB', 'Dev', 31000, 12, 7, 3, '{}');

    const aOffers = db.prepare('SELECT * FROM offers WHERE user_id = ?').all(userA) as any[];
    const bOffers = db.prepare('SELECT * FROM offers WHERE user_id = ?').all(userB) as any[];

    expect(aOffers.length).toBe(1);
    expect(aOffers[0].company).toBe('OfferCoA');
    expect(bOffers.length).toBe(1);
    expect(bOffers[0].company).toBe('OfferCoB');
  });
});
