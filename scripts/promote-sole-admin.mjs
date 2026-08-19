#!/usr/bin/env node

import crypto from 'crypto';
import path from 'path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { planSoleAdminPromotion } from './lib/superadmin-promotion.mjs';

dotenv.config({ path: '.env.local' });
dotenv.config();

function parseArgs(argv) {
  const args = {
    apply: false,
    driver: (process.env.DB_DRIVER || 'sqlite').trim().toLowerCase(),
    username: '',
    sqlitePath: path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'zhiyuan.db'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--dry-run') args.apply = false;
    else if (arg === '--driver') args.driver = readValue(argv, ++index, arg);
    else if (arg === '--username') args.username = readValue(argv, ++index, arg);
    else if (arg === '--sqlite') args.sqlitePath = readValue(argv, ++index, arg);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['postgres', 'sqlite'].includes(args.driver)) {
    throw new Error('--driver must be postgres or sqlite');
  }
  if (!args.username.trim()) throw new Error('--username is required');
  return args;
}

function readValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage:
  node scripts/promote-sole-admin.mjs --dry-run --username <username>
  node scripts/promote-sole-admin.mjs --apply --username <username>

Options:
  --driver <postgres|sqlite>  Defaults to DB_DRIVER or sqlite.
  --sqlite <path>             SQLite database path when driver=sqlite.
  --username <username>       Required exact sole privileged account.
  --dry-run                   Validate and print the action without writing.
  --apply                     Promote and append a security event atomically.
`);
}

function promotionEvent(target) {
  return {
    id: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    targetUserId: target.userId,
    metadata: JSON.stringify({
      oldRole: 'admin',
      newRole: 'superadmin',
      reason: 'sole_admin_security_migration',
      source: 'scripts/promote-sole-admin.mjs',
    }),
  };
}

function runSqlite(args) {
  const db = new Database(args.sqlitePath, { fileMustExist: true });
  try {
    return db.transaction(() => {
      const users = db.prepare(`
        SELECT id, username, role, status
        FROM users
        WHERE status = 'active' AND role IN ('admin', 'superadmin')
        ORDER BY id
      `).all();
      const plan = planSoleAdminPromotion(users, args.username);
      if (!args.apply || plan.action === 'noop') return plan;

      const event = promotionEvent(plan);
      const result = db.prepare(`
        UPDATE users
        SET role = 'superadmin', token_version = token_version + 1,
            last_security_event_at = datetime('now')
        WHERE id = ? AND role = 'admin' AND status = 'active'
      `).run(plan.userId);
      if (result.changes !== 1) throw new Error('Promotion target changed during the transaction');
      db.prepare(`
        INSERT INTO auth_security_events (
          id, event_type, actor_user_id, target_user_id, actor_role, outcome,
          request_id, user_agent, metadata_json
        ) VALUES (?, 'role_change', NULL, ?, 'system', 'success', ?, ?, ?)
      `).run(event.id, event.targetUserId, event.requestId, 'security-migration-script', event.metadata);
      return plan;
    })();
  } finally {
    db.close();
  }
}

async function runPostgres(args) {
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required for postgres');
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT id, username, role, status
      FROM users
      WHERE status = 'active' AND role IN ('admin', 'superadmin')
      ORDER BY id
      FOR UPDATE
    `);
    const plan = planSoleAdminPromotion(result.rows, args.username);
    if (args.apply && plan.action === 'promote') {
      const event = promotionEvent(plan);
      const update = await client.query(`
        UPDATE users
        SET role = 'superadmin', token_version = token_version + 1,
            last_security_event_at = now()
        WHERE id = $1 AND role = 'admin' AND status = 'active'
      `, [plan.userId]);
      if (update.rowCount !== 1) throw new Error('Promotion target changed during the transaction');
      await client.query(`
        INSERT INTO auth_security_events (
          id, event_type, actor_user_id, target_user_id, actor_role, outcome,
          request_id, user_agent, metadata_json
        ) VALUES ($1, 'role_change', NULL, $2, 'system', 'success', $3, $4, $5::jsonb)
      `, [event.id, event.targetUserId, event.requestId, 'security-migration-script', event.metadata]);
    }
    await client.query(args.apply ? 'COMMIT' : 'ROLLBACK');
    return plan;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = args.driver === 'postgres' ? await runPostgres(args) : runSqlite(args);
  const mode = args.apply ? 'apply' : 'dry-run';
  console.log(`${mode}: ${plan.action} ${plan.username} (${plan.userId})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
