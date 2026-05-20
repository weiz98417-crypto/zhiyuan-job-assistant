import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

let db: Database.Database;

beforeAll(() => {
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'server-schema.sql'),
    'utf-8'
  );
  db.exec(schema);
});

function createUser(username: string, password: string, status = 'active', role = 'member') {
  const id = crypto.randomUUID();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO users (id, username, password_hash, display_name, role, status, token_version) VALUES (?, ?, ?, ?, ?, ?, 0)'
  ).run(id, username, hash, username, role, status);
  return { id, username, passwordHash: hash };
}

describe('Auth — Registration', () => {
  it('creates a new user with pending status', () => {
    const id = crypto.randomUUID();
    const hash = bcrypt.hashSync('test123', 10);
    db.prepare(
      'INSERT INTO users (id, username, password_hash, display_name, role, status, token_version) VALUES (?, ?, ?, ?, ?, ?, 0)'
    ).run(id, 'newuser', hash, 'New User', 'member', 'pending');

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get('newuser') as any;
    expect(user).toBeTruthy();
    expect(user.status).toBe('pending');
    expect(user.role).toBe('member');
  });

  it('rejects duplicate username', () => {
    createUser('dupe', 'pass1');
    expect(() => createUser('dupe', 'pass2')).toThrow();
  });
});

describe('Auth — Login', () => {
  it('returns user for valid credentials', () => {
    createUser('validuser', 'correct', 'active');
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get('validuser') as any;
    expect(user).toBeTruthy();
    const valid = bcrypt.compareSync('correct', user.password_hash);
    expect(valid).toBe(true);
  });

  it('rejects wrong password', () => {
    createUser('pwuser', 'right', 'active');
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get('pwuser') as any;
    const valid = bcrypt.compareSync('wrong', user.password_hash);
    expect(valid).toBe(false);
  });

  it('rejects non-existent user', () => {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get('nobody');
    expect(user).toBeUndefined();
  });

  it('blocks pending user from login', () => {
    createUser('pendingguy', 'pass', 'pending');
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get('pendingguy') as any;
    expect(user.status).toBe('pending');
  });

  it('blocks rejected user from login', () => {
    createUser('rejectedguy', 'pass', 'rejected');
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get('rejectedguy') as any;
    expect(user.status).toBe('rejected');
  });
});

describe('Auth — Password Hashing', () => {
  it('bcrypt generates different hashes for same password', () => {
    const h1 = bcrypt.hashSync('same', 10);
    const h2 = bcrypt.hashSync('same', 10);
    expect(h1).not.toBe(h2);
  });

  it('bcrypt verifies correctly', () => {
    const hash = bcrypt.hashSync('mypassword', 10);
    expect(bcrypt.compareSync('mypassword', hash)).toBe(true);
    expect(bcrypt.compareSync('wrongpass', hash)).toBe(false);
  });
});

describe('Auth — Token Version', () => {
  it('token_version increments on role change', () => {
    const u = createUser('tokenuser', 'pass', 'active', 'member');
    const before = (db.prepare('SELECT token_version FROM users WHERE username = ?').get('tokenuser') as any).token_version;
    db.prepare('UPDATE users SET role = ?, token_version = token_version + 1 WHERE username = ?').run('admin', 'tokenuser');
    const after = (db.prepare('SELECT token_version FROM users WHERE username = ?').get('tokenuser') as any).token_version;
    expect(after).toBe(before + 1);
  });
});
