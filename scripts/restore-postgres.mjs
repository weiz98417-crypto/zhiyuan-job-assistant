#!/usr/bin/env node

import fs from "fs";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

const PREFERRED_RESTORE_ORDER = [
  "users",
  "profiles",
  "cv_data",
  "applications",
  "reports",
  "jds",
  "offers",
  "offer_reports",
  "sessions",
  "agent_runs",
  "agent_run_steps",
  "stories",
  "profile_signals",
  "reference_resumes",
  "reference_resume_usage",
  "optimization_preferences",
  "agent_preferences",
  "session_memory",
  "reference_resume_chunks",
  "memory_items",
  "memory_evidence",
  "memory_status_transitions",
  "memory_chunks",
  "scan_queue",
  "scan_source_runs",
  "scan_jobs",
  "news_cache",
];

function parseArgs(argv) {
  const args = {
    databaseUrl: process.env.DATABASE_URL || "",
    input: "",
    apply: false,
    allowOverwrite: false,
    schemaPath: "src/lib/postgres-schema.sql",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--database-url") args.databaseUrl = readValue(argv, ++index, arg);
    else if (arg === "--input") args.input = readValue(argv, ++index, arg);
    else if (arg === "--schema") args.schemaPath = readValue(argv, ++index, arg);
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--allow-overwrite") args.allowOverwrite = true;
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
  node scripts/restore-postgres.mjs --input <backup.json> [options]

Options:
  --database-url <url>   PostgreSQL target. Defaults to DATABASE_URL.
  --schema <path>        Schema SQL to bootstrap before restore. Defaults to src/lib/postgres-schema.sql.
  --apply                Actually restore rows. Without this flag the script only prints a dry-run.
  --allow-overwrite      Allow truncating existing target rows before restore. Requires --apply.
`);
}

function readBackup(inputPath) {
  if (!inputPath) throw new Error("--input is required.");
  const backup = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  if (backup.format !== "zhiyuan-postgres-json-backup-v1" || !Array.isArray(backup.tables)) {
    throw new Error("Unsupported backup format.");
  }
  return backup;
}

function sortTablesForRestore(tables) {
  const byName = new Map(tables.map((table) => [table.name, table]));
  const ordered = [];
  for (const name of PREFERRED_RESTORE_ORDER) {
    if (byName.has(name)) ordered.push(byName.get(name));
  }
  for (const table of tables) {
    if (!PREFERRED_RESTORE_ORDER.includes(table.name)) ordered.push(table);
  }
  return ordered;
}

async function tableRowCount(client, tableName) {
  const result = await client.query(`SELECT COUNT(*) AS count FROM "${tableName}"`);
  return Number(result.rows[0]?.count || 0);
}

async function existingTargetRows(client, tables) {
  const rows = [];
  for (const table of tables) {
    try {
      rows.push({ table: table.name, rowCount: await tableRowCount(client, table.name) });
    } catch (error) {
      rows.push({ table: table.name, rowCount: 0, missing: true, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return rows;
}

async function resetSequences(client, tables) {
  for (const table of tables) {
    const sample = table.rows?.[0];
    if (!sample || !Object.prototype.hasOwnProperty.call(sample, "id")) continue;
    const seq = await client.query("SELECT pg_get_serial_sequence($1, 'id') AS seq", [`public.${table.name}`]);
    const seqName = seq.rows[0]?.seq;
    if (!seqName) continue;
    await client.query(`SELECT setval($1, COALESCE((SELECT MAX(id) FROM "${table.name}"), 0) + 1, false)`, [seqName]);
  }
}

async function insertRows(client, table) {
  let inserted = 0;
  for (const row of table.rows || []) {
    const columns = Object.keys(row);
    if (columns.length === 0) continue;
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    const columnSql = columns.map((column) => `"${column.replace(/"/g, '""')}"`).join(", ");
    await client.query(
      `INSERT INTO "${table.name}" (${columnSql}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
      columns.map((column) => row[column]),
    );
    inserted += 1;
  }
  return inserted;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.databaseUrl) throw new Error("DATABASE_URL is not configured.");
  const backup = readBackup(args.input);
  const tables = sortTablesForRestore(backup.tables);

  const totalRows = tables.reduce((sum, table) => sum + Number(table.rowCount || table.rows?.length || 0), 0);
  console.log(`Backup: ${args.input}`);
  console.log(`Created: ${backup.createdAt}`);
  console.log(`Tables: ${tables.length}`);
  console.log(`Rows: ${totalRows}`);

  const pool = new Pool({ connectionString: args.databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    if (fs.existsSync(args.schemaPath)) {
      await client.query(fs.readFileSync(args.schemaPath, "utf-8"));
    }

    const existing = await existingTargetRows(client, tables);
    const nonEmpty = existing.filter((item) => item.rowCount > 0);
    if (!args.apply) {
      console.log("Dry-run only. Pass --apply to restore.");
      if (nonEmpty.length) console.log(`Target has existing rows in ${nonEmpty.length} table(s). Pass --allow-overwrite to truncate before restore.`);
      return;
    }
    if (nonEmpty.length && !args.allowOverwrite) {
      throw new Error(`Target database is not empty (${nonEmpty.length} table(s)). Re-run with --allow-overwrite to truncate first.`);
    }

    await client.query("BEGIN");
    try {
      if (args.allowOverwrite && tables.length > 0) {
        const tableSql = tables.map((table) => `"${table.name.replace(/"/g, '""')}"`).join(", ");
        await client.query(`TRUNCATE ${tableSql} RESTART IDENTITY CASCADE`);
      }
      for (const table of tables) {
        const inserted = await insertRows(client, table);
        console.log(`- ${table.name}: restored ${inserted}/${table.rows?.length || 0}`);
      }
      await resetSequences(client, tables);
      await client.query("COMMIT");
      console.log("PostgreSQL restore complete.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
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
