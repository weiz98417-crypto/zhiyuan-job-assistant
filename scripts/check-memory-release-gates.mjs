#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

const REQUIRED_TABLES = [
  "memory_items", "memory_evidence", "memory_chunks", "session_memory",
  "memory_episodes", "memory_facts", "memory_fact_decisions", "memory_fact_chunks",
  "memory_entities", "memory_entity_facts", "profile_blocks", "memory_profile_block_facts",
  "memory_partitions", "memory_admission_candidates", "memory_discovery_settings",
  "memory_support_grants", "memory_support_access_audit",
  "memory_erasure_requests", "memory_erasure_suppressions", "memory_runtime_gates",
  "mastra_resources", "mastra_threads", "mastra_messages", "mastra_observational_memory", "mastra_thread_state",
];
const REQUIRED_INDEXES = ["idx_memory_fact_chunks_hnsw"];
const REQUIRED_GATES = ["read", "write", "extract"];

function parseArgs(argv) {
  const args = {
    databaseUrl: process.env.DATABASE_URL || "",
    backupEvidence: process.env.POSTGRES_BACKUP_EVIDENCE || "",
    restoreEvidence: process.env.POSTGRES_RESTORE_EVIDENCE || "",
    strict: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--database-url") args.databaseUrl = value(argv, ++index, arg);
    else if (arg === "--backup-evidence") args.backupEvidence = value(argv, ++index, arg);
    else if (arg === "--restore-evidence") args.restoreEvidence = value(argv, ++index, arg);
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--no-strict") args.strict = false;
    else if (arg === "--help" || arg === "-h") {
      console.log("node scripts/check-memory-release-gates.mjs [--database-url URL] [--backup-evidence FILE] [--restore-evidence FILE] [--strict|--no-strict]");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function value(argv, index, flag) {
  const next = argv[index];
  if (!next || next.startsWith("--")) throw new Error(`${flag} requires a value`);
  return next;
}

function fail(gates, name, reason) { gates[name] = { ok: false, reason }; }
function pass(gates, name, evidence = "verified") { gates[name] = { ok: true, evidence }; }

function readJsonEvidence(filePath) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error("evidence file is missing");
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size < 2) throw new Error("evidence file is empty");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateBackupEvidence(filePath) {
  const backup = readJsonEvidence(filePath);
  if (backup.format !== "zhiyuan-postgres-json-backup-v1" || !backup.createdAt || !Array.isArray(backup.tables) || backup.tables.length === 0) throw new Error("unsupported PostgreSQL backup format");
  const createdAt = Date.parse(backup.createdAt);
  const ageDays = (Date.now() - createdAt) / 86400000;
  if (!Number.isFinite(ageDays) || ageDays < -1 || ageDays > 30) throw new Error(`backup age ${Math.round(ageDays)}d exceeds 30-day target`);
  const malformed = backup.tables.find((table) => !table || typeof table.name !== "string" || !Number.isInteger(Number(table.rowCount)) || Number(table.rowCount) < 0 || !Array.isArray(table.rows));
  if (malformed) throw new Error(`backup table ${malformed.name || "unknown"} has no row-count evidence`);
  const names = new Set(backup.tables.map((table) => table.name));
  for (const table of ["users", ...REQUIRED_TABLES]) {
    if (!names.has(table)) throw new Error(`backup is missing ${table}`);
  }
  const retention = backup.retention || {};
  const retentionDays = Number(backup.retentionDays ?? backup.maxRetentionDays ?? retention.maxDays ?? retention.maxRetentionDays);
  const retentionVerified = retention.retentionVerified === true || retention.verified === true || backup.retentionVerified === true || backup.retentionPolicyVerified === true;
  if (!Number.isFinite(retentionDays) || retentionDays > 30 || !retentionVerified) throw new Error("backup retention policy evidence must explicitly verify a maximum of 30 days");
  return { path: filePath, createdAt: backup.createdAt, ageDays: Number(ageDays.toFixed(2)), tableCount: backup.tables.length, sha256: crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") };
}

function validateRestoreEvidence(filePath, backupPath) {
  const restore = readJsonEvidence(filePath);
  if (restore.format !== "zhiyuan-postgres-restore-evidence-v1" || restore.readBack !== true || !restore.verifiedAt) throw new Error("restore evidence did not prove a read-back verification");
  if (!Number.isInteger(Number(restore.replayedErasures)) || Number(restore.replayedErasures) < 0) throw new Error("restore evidence has no erasure replay count");
  if (restore.sourceBackup && String(restore.sourceBackup) !== String(backupPath)) throw new Error("restore evidence references a different backup");
  const ageDays = (Date.now() - Date.parse(restore.verifiedAt)) / 86400000;
  if (!Number.isFinite(ageDays) || ageDays < -1 || ageDays > 30) throw new Error("restore evidence is older than the 30-day target");
  return { path: filePath, verifiedAt: restore.verifiedAt, replayedErasures: Number(restore.replayedErasures), ageDays: Number(ageDays.toFixed(2)) };
}

async function checkDatabase(client, report) {
  const tableRows = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])", [REQUIRED_TABLES]);
  const presentTables = new Set(tableRows.rows.map((row) => String(row.table_name)));
  for (const table of REQUIRED_TABLES) {
    if (presentTables.has(table)) pass(report.tables, table);
    else fail(report.tables, table, "missing table");
  }
  const extensionRows = await client.query("SELECT 1 FROM pg_extension WHERE extname='vector'");
  if (extensionRows.rowCount) pass(report.gates, "pgvector");
  else fail(report.gates, "pgvector", "vector extension missing");
  const indexRows = await client.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname=ANY($1::text[]) AND indexdef ILIKE '% USING hnsw %'", [REQUIRED_INDEXES]);
  const presentIndexes = new Set(indexRows.rows.map((row) => String(row.indexname)));
  for (const index of REQUIRED_INDEXES) {
    if (presentIndexes.has(index)) pass(report.indexes, index);
    else fail(report.indexes, index, "missing HNSW index");
  }
  if (presentTables.has("memory_runtime_gates")) {
    const gates = await client.query("SELECT gate_name, state, reason FROM memory_runtime_gates WHERE gate_name=ANY($1::text[])", [REQUIRED_GATES]);
    const gateRows = new Map(gates.rows.map((row) => [String(row.gate_name), row]));
    for (const name of REQUIRED_GATES) {
      const row = gateRows.get(name);
      if (row && String(row.state) === "open") pass(report.runtimeGates, name, { state: row.state, reason: row.reason });
      else fail(report.runtimeGates, name, row ? `state=${row.state}` : "missing gate");
    }
  }
  if (presentTables.has("memory_erasure_requests")) {
    const failed = await client.query("SELECT COUNT(*)::int AS count FROM memory_erasure_requests WHERE status='failed' OR (status='completed' AND COALESCE(completed_layers_json->>'restoreReplay','false') <> 'true')");
    if (Number(failed.rows[0]?.count || 0) === 0) pass(report.gates, "erasureReplay");
    else fail(report.gates, "erasureReplay", `${failed.rows[0].count} erasure request(s) failed or lack restore replay evidence`);
    const orphanSuppression = await client.query("SELECT COUNT(*)::int AS count FROM memory_erasure_suppressions s LEFT JOIN memory_erasure_requests r ON r.id=s.request_id WHERE r.id IS NULL");
    if (Number(orphanSuppression.rows[0]?.count || 0) === 0) pass(report.gates, "suppressionIntegrity");
    else fail(report.gates, "suppressionIntegrity", `${orphanSuppression.rows[0].count} suppression row(s) have no request`);
  }
  const fk = await client.query(`
    SELECT 1
    FROM information_schema.referential_constraints rc
    JOIN information_schema.table_constraints tc ON tc.constraint_name=rc.constraint_name AND tc.constraint_schema=rc.constraint_schema
    WHERE tc.table_schema='public' AND tc.table_name='memory_fact_chunks' AND tc.constraint_name='memory_fact_chunks_user_id_fkey'
  `);
  if (fk.rowCount) pass(report.gates, "memoryFactUserIsolation");
  else fail(report.gates, "memoryFactUserIsolation", "memory_fact_chunks.user_id has no users foreign key");
}

function finish(report, strict) {
  const all = [report.gates, report.tables, report.indexes, report.runtimeGates];
  report.ok = all.every((group) => Object.values(group).every((entry) => entry.ok));
  console.log(JSON.stringify(report, null, 2));
  if (strict && !report.ok) process.exitCode = 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = { ok: false, checkedAt: new Date().toISOString(), gates: {}, tables: {}, indexes: {}, runtimeGates: {}, evidence: {} };
  try { report.evidence.backup = validateBackupEvidence(args.backupEvidence); pass(report.gates, "backupEvidence", report.evidence.backup); }
  catch (error) { fail(report.gates, "backupEvidence", error instanceof Error ? error.message : String(error)); }
  try { report.evidence.restore = validateRestoreEvidence(args.restoreEvidence, args.backupEvidence); pass(report.gates, "restoreEvidence", report.evidence.restore); }
  catch (error) { fail(report.gates, "restoreEvidence", error instanceof Error ? error.message : String(error)); }
  if (!args.databaseUrl) {
    fail(report.gates, "database", "DATABASE_URL is required");
    finish(report, args.strict);
    return;
  }
  const pool = new pg.Pool({ connectionString: args.databaseUrl, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    const client = await pool.connect();
    try { await checkDatabase(client, report); }
    catch (error) { fail(report.gates, "database", error instanceof Error ? error.message : String(error)); }
    finally { client.release(); }
  } catch (error) { fail(report.gates, "database", error instanceof Error ? error.message : String(error)); }
  finally { await pool.end(); }
  finish(report, args.strict);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
