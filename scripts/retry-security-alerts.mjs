#!/usr/bin/env node

import dotenv from 'dotenv';
import { Pool } from 'pg';
import { runSecurityAlertRetryBatch } from './lib/security-alert-retry.mjs';

dotenv.config({ path: '.env.local' });
dotenv.config();

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseArgs(argv) {
  const options = {
    batchSize: positiveInteger(process.env.SECURITY_ALERT_RETRY_BATCH_SIZE, 25, 'SECURITY_ALERT_RETRY_BATCH_SIZE'),
    maxAttempts: positiveInteger(process.env.SECURITY_ALERT_MAX_ATTEMPTS, 5, 'SECURITY_ALERT_MAX_ATTEMPTS'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--batch-size') {
      options.batchSize = positiveInteger(argv[index + 1], undefined, '--batch-size');
      index += 1;
    } else if (arg === '--max-attempts') {
      options.maxAttempts = positiveInteger(argv[index + 1], undefined, '--max-attempts');
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/retry-security-alerts.mjs [--batch-size N] [--max-attempts N]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if ((process.env.DB_DRIVER || '').trim().toLowerCase() !== 'postgres') {
    throw new Error('Security alert retry requires DB_DRIVER=postgres');
  }
  if (!process.env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL is required');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  const client = await pool.connect();
  try {
    const result = await runSecurityAlertRetryBatch({ client, ...options });
    console.log(JSON.stringify(result));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[security/alert-retry] ${error instanceof Error ? error.message : 'worker failed'}`);
  process.exitCode = 1;
});
