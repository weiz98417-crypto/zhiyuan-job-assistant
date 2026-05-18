/**
 * Create the first admin user in the SQLite database.
 * Usage: node scripts/create-admin.mjs <username> <password> <displayName>
 */
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'zhiyuan.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'src', 'lib', 'server-schema.sql');

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('Usage: node scripts/create-admin.mjs <username> <password> <displayName>');
  process.exit(1);
}

const [username, password, displayName] = args;

// Ensure DB directory exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Ensure schema is loaded (users table must exist)
const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
db.exec(schema);

// Check if users table has user_id columns (run the getDb migration equivalent)
const userTables = [
  'profiles', 'profile_signals', 'sessions', 'stories', 'cv_data',
  'applications', 'agent_preferences', 'session_memory',
  'optimization_preferences', 'reports',
];
for (const table of userTables) {
  const tCols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!tCols.some((c) => c.name === 'user_id')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN user_id TEXT REFERENCES users(id)`);
  }
}

// Check if admin already exists
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (existing) {
  console.error(`User "${username}" already exists.`);
  db.close();
  process.exit(1);
}

const id = crypto.randomUUID();
const passwordHash = bcrypt.hashSync(password, 10);

db.prepare(`
  INSERT INTO users (id, username, password_hash, display_name, email, role, status, token_version)
  VALUES (?, ?, ?, ?, '', 'admin', 'active', 0)
`).run(id, username, passwordHash, displayName);

console.log(`Admin user created:`);
console.log(`  ID:       ${id}`);
console.log(`  Username: ${username}`);
console.log(`  Name:     ${displayName}`);
console.log(`  Role:     admin`);
console.log(`  Status:   active`);

// Migrate existing data to admin
const migrateTables = [
  'profiles', 'profile_signals', 'sessions', 'stories', 'cv_data',
  'applications', 'agent_preferences', 'session_memory',
  'optimization_preferences', 'reports',
];

const migrate = db.transaction(() => {
  for (const table of migrateTables) {
    const info = db.prepare(
      `UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`
    ).run(id);
    if (info.changes > 0) {
      console.log(`  Migrated ${info.changes} rows in ${table} → admin`);
    }
  }
});

migrate();

db.close();
console.log('\nDone. Admin is ready to use.');
