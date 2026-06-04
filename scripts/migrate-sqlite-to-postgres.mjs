#!/usr/bin/env node

import fs from "fs";
import path from "path";
import {
  DEFAULT_SQLITE_PATH,
  createPostgresPool,
  formatMigrationPlan,
  formatMigrationResult,
  formatVerificationReport,
  migrateSqliteToPostgres,
  openSqlite,
  verifyMigration,
} from "./lib/sqlite-postgres-migration.mjs";

function parseArgs(argv) {
  const args = {
    mode: "dry-run",
    sqlitePath: DEFAULT_SQLITE_PATH,
    databaseUrl: process.env.DATABASE_URL || "",
    defaultOwner: "",
    reportPath: "",
    schemaPath: undefined,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--dry-run") args.mode = "dry-run";
    else if (arg === "--apply") args.mode = "apply";
    else if (arg === "--verify-only") args.mode = "verify-only";
    else if (arg === "--sqlite") args.sqlitePath = readValue(argv, ++index, arg);
    else if (arg === "--database-url") args.databaseUrl = readValue(argv, ++index, arg);
    else if (arg === "--default-owner") args.defaultOwner = readValue(argv, ++index, arg);
    else if (arg === "--report") args.reportPath = readValue(argv, ++index, arg);
    else if (arg === "--schema") args.schemaPath = readValue(argv, ++index, arg);
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
  node scripts/migrate-sqlite-to-postgres.mjs --dry-run [options]
  node scripts/migrate-sqlite-to-postgres.mjs --apply --default-owner <user-id-or-username> [options]
  node scripts/migrate-sqlite-to-postgres.mjs --verify-only --default-owner <user-id-or-username> [options]

Options:
  --sqlite <path>          SQLite source database. Defaults to data/zhiyuan.db.
  --database-url <url>     PostgreSQL target. Defaults to DATABASE_URL.
  --default-owner <id>     Required when legacy private rows have null/missing user_id.
  --report <path>          Also write the human-readable report to a file.
  --schema <path>          PostgreSQL schema file for apply mode.
`);
}

function writeReport(reportPath, content) {
  if (!reportPath) return;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, content, "utf-8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sqliteDb = openSqlite(args.sqlitePath);
  const pool = createPostgresPool(args.databaseUrl);
  const client = await pool.connect();

  try {
    let output = "";
    if (args.mode === "dry-run") {
      const result = await migrateSqliteToPostgres({
        sqliteDb,
        pgClient: client,
        defaultOwner: args.defaultOwner || null,
        dryRun: true,
        schemaPath: args.schemaPath,
      });
      output = formatMigrationPlan(result.plan);
    } else if (args.mode === "apply") {
      const result = await migrateSqliteToPostgres({
        sqliteDb,
        pgClient: client,
        defaultOwner: args.defaultOwner || null,
        dryRun: false,
        schemaPath: args.schemaPath,
      });
      output = formatMigrationResult(result);
    } else if (args.mode === "verify-only") {
      const report = await verifyMigration({
        sqliteDb,
        pgClient: client,
        defaultOwner: args.defaultOwner || null,
      });
      output = formatVerificationReport(report);
      if (!report.ok) process.exitCode = 1;
    } else {
      throw new Error(`Unsupported mode: ${args.mode}`);
    }

    console.log(output);
    writeReport(args.reportPath, output);
  } finally {
    client.release();
    await pool.end();
    sqliteDb.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
