#!/usr/bin/env node

import dotenv from 'dotenv';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { validateAuthSecurityConfig } from './lib/auth-security-preflight.mjs';

dotenv.config({ path: '.env.local' });
dotenv.config();

const REQUIRED_USER_COLUMNS = [
  'role',
  'status',
  'token_version',
  'password_changed_at',
  'password_changed_by',
  'must_change_password',
  'last_security_event_at',
];

function parseArgs(argv) {
  const args = { skipNetwork: false };
  for (const arg of argv) {
    if (arg === '--skip-network') args.skipNetwork = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/check-auth-security-preflight.mjs [--skip-network]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function checkPostgres() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    const table = await client.query("SELECT to_regclass('public.auth_security_events') AS name");
    if (!table.rows[0]?.name) throw new Error('auth_security_events table is missing');

    const columns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
    `);
    const present = new Set(columns.rows.map((row) => row.column_name));
    const missing = REQUIRED_USER_COLUMNS.filter((column) => !present.has(column));
    if (missing.length) throw new Error(`users security columns are missing: ${missing.join(', ')}`);

    const superadmins = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM users
      WHERE role = 'superadmin' AND status = 'active'
    `);
    if (Number(superadmins.rows[0]?.count || 0) < 1) {
      throw new Error('no active superadmin exists');
    }

    const trigger = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM pg_trigger
      WHERE tgname = 'auth_security_events_no_mutation' AND NOT tgisinternal
    `);
    if (Number(trigger.rows[0]?.count || 0) !== 1) {
      throw new Error('append-only auth security event trigger is missing');
    }
    return ['postgres reachable', 'security schema current', 'active superadmin present'];
  } finally {
    client.release();
    await pool.end();
  }
}

async function checkRedis() {
  const client = createClient({
    url: process.env.REDIS_URL,
    socket: { connectTimeout: 5_000 },
  });
  client.on('error', () => {});
  try {
    await client.connect();
    if (await client.ping() !== 'PONG') throw new Error('Redis PING failed');
    const persistence = await client.info('persistence');
    if (!/(^|\r?\n)aof_enabled:1(\r?\n|$)/.test(persistence)) {
      throw new Error('dedicated Redis must enable AOF persistence');
    }
    return ['redis reachable', 'redis AOF persistence enabled'];
  } finally {
    if (client.isOpen) await client.quit();
  }
}

async function checkHttpsBoundary() {
  const origin = String(process.env.APP_ORIGIN).replace(/\/$/, '');
  const response = await fetch(`${origin}/login`, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status < 200 || response.status >= 400) {
    throw new Error(`HTTPS boundary returned status ${response.status}`);
  }
  const hsts = response.headers.get('strict-transport-security') || '';
  if (!/max-age=\d+/i.test(hsts)) throw new Error('HSTS header is missing');
  return ['https boundary reachable', 'HSTS enabled'];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const checks = validateAuthSecurityConfig(process.env);
  checks.push(...await checkPostgres());
  checks.push(...await checkRedis());
  if (!args.skipNetwork) checks.push(...await checkHttpsBoundary());
  else checks.push('https boundary probe skipped explicitly');

  for (const check of checks) console.log(`PASS ${check}`);
  console.log(`Authentication security preflight passed (${checks.length} checks).`);
}

main().catch((error) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
