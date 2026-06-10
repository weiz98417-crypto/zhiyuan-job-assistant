#!/usr/bin/env node

import dotenv from "dotenv";
import { formatCutoverReport, runPostgresCutoverCheck } from "./lib/postgres-cutover-check.mjs";

dotenv.config({ path: ".env.local" });
dotenv.config();

function parseArgs(argv) {
  const args = {
    sqlitePath: undefined,
    databaseUrl: process.env.DATABASE_URL || "",
    defaultOwner: process.env.MIGRATION_DEFAULT_OWNER || "",
    strict: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--sqlite") args.sqlitePath = readValue(argv, ++index, arg);
    else if (arg === "--database-url") args.databaseUrl = readValue(argv, ++index, arg);
    else if (arg === "--default-owner") args.defaultOwner = readValue(argv, ++index, arg);
    else if (arg === "--strict") args.strict = true;
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
  node scripts/check-postgres-cutover.mjs [options]

Options:
  --sqlite <path>          SQLite archive database. Defaults to data/zhiyuan.db.
  --database-url <url>     PostgreSQL target. Defaults to DATABASE_URL.
  --default-owner <id>     Default owner for legacy private rows during verification.
  --strict                Exit non-zero when any cutover gate fails.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await runPostgresCutoverCheck({
    sqlitePath: args.sqlitePath,
    databaseUrl: args.databaseUrl,
    defaultOwner: args.defaultOwner,
  });
  console.log(formatCutoverReport(report));
  if (args.strict && !report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
