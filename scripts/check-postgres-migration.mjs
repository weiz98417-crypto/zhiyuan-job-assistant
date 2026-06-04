#!/usr/bin/env node

import fs from "fs";
import path from "path";
import {
  DEFAULT_SQLITE_PATH,
  createPostgresPool,
  formatVerificationReport,
  openSqlite,
  verifyMigration,
} from "./lib/sqlite-postgres-migration.mjs";

function parseArgs(argv) {
  const args = {
    sqlitePath: DEFAULT_SQLITE_PATH,
    databaseUrl: process.env.DATABASE_URL || "",
    defaultOwner: "",
    reportPath: "",
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--sqlite") args.sqlitePath = readValue(argv, ++index, arg);
    else if (arg === "--database-url") args.databaseUrl = readValue(argv, ++index, arg);
    else if (arg === "--default-owner") args.defaultOwner = readValue(argv, ++index, arg);
    else if (arg === "--report") args.reportPath = readValue(argv, ++index, arg);
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
  node scripts/check-postgres-migration.mjs --default-owner <user-id-or-username> [options]

Options:
  --sqlite <path>          SQLite source database. Defaults to data/zhiyuan.db.
  --database-url <url>     PostgreSQL target. Defaults to DATABASE_URL.
  --default-owner <id>     Required when legacy private rows have null/missing user_id.
  --report <path>          Also write the human-readable report to a file.
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
    const report = await verifyMigration({
      sqliteDb,
      pgClient: client,
      defaultOwner: args.defaultOwner || null,
    });
    const output = formatVerificationReport(report);
    console.log(output);
    writeReport(args.reportPath, output);
    if (!report.ok) process.exitCode = 1;
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
