#!/usr/bin/env node

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

function parseArgs(argv) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const args = {
    databaseUrl: process.env.DATABASE_URL || "",
    output: path.join("data", "backups", `postgres-backup-${timestamp}.json`),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--database-url") args.databaseUrl = readValue(argv, ++index, arg);
    else if (arg === "--output") args.output = readValue(argv, ++index, arg);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage:
  node scripts/backup-postgres.mjs [options]

Options:
  --database-url <url>  PostgreSQL source. Defaults to DATABASE_URL.
  --output <path>       Backup JSON path. Defaults to data/backups/postgres-backup-<timestamp>.json.
`);
}

async function listTables(client) {
  const result = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return result.rows.map((row) => row.table_name);
}

function redactDatabaseUrl(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return databaseUrl ? "[configured]" : "";
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.databaseUrl) throw new Error("DATABASE_URL is not configured.");

  const pool = new Pool({ connectionString: args.databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    const tables = await listTables(client);
    const backup = {
      format: "zhiyuan-postgres-json-backup-v1",
      createdAt: new Date().toISOString(),
      databaseUrl: redactDatabaseUrl(args.databaseUrl),
      schema: "public",
      tables: [],
    };

    for (const table of tables) {
      const result = await client.query(`SELECT * FROM "${table}"`);
      backup.tables.push({
        name: table,
        rowCount: result.rowCount || 0,
        rows: result.rows,
      });
    }

    fs.mkdirSync(path.dirname(args.output), { recursive: true });
    fs.writeFileSync(args.output, JSON.stringify(backup, null, 2), "utf-8");
    console.log(`PostgreSQL backup written: ${args.output}`);
    for (const table of backup.tables) {
      console.log(`- ${table.name}: ${table.rowCount} rows`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
