import { beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db: Database.Database;

beforeAll(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'server-schema.sql'),
    'utf8',
  ));
});

describe('authentication security schema', () => {
  it('creates user security state and an append-only event ledger', () => {
    const userColumns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
    expect(userColumns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'password_changed_at',
      'password_changed_by',
      'must_change_password',
      'last_security_event_at',
    ]));

    const eventColumns = db.prepare('PRAGMA table_info(auth_security_events)').all() as { name: string }[];
    expect(eventColumns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'event_type',
      'actor_user_id',
      'target_user_id',
      'outcome',
      'reason_code',
      'request_id',
      'metadata_json',
      'created_at',
    ]));

    db.prepare(`
      INSERT INTO auth_security_events (
        id, event_type, outcome, request_id, metadata_json
      ) VALUES (?, ?, ?, ?, ?)
    `).run('event-1', 'password_change', 'success', 'request-1', '{}');

    expect(() => db.prepare(
      "UPDATE auth_security_events SET outcome = 'failure' WHERE id = 'event-1'",
    ).run()).toThrow();
    expect(() => db.prepare(
      "DELETE FROM auth_security_events WHERE id = 'event-1'",
    ).run()).toThrow();
  });
});
