import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

const WORKER_ARTIFACT = "build/agent-worker.mjs";
const REQUIRED_TABLES = [
  "agent_runs", "agent_run_events", "agent_run_checkpoints", "agent_run_inputs", "agent_run_gates",
  "agent_tool_attempts", "agent_run_outbox", "agent_conversation_items", "agent_feature_flags",
  "agent_eval_layer_results", "jd_resume_matching_preferences", "session_memory", "memory_items",
  "memory_evidence", "memory_chunks", "memory_episodes", "memory_facts", "memory_fact_decisions",
  "memory_fact_chunks", "profile_blocks", "memory_profile_block_facts", "memory_partitions",
  "memory_entities", "memory_entity_facts", "memory_admission_candidates", "memory_discovery_settings",
  "memory_support_grants", "memory_support_access_audit",
  "memory_erasure_requests", "memory_erasure_suppressions", "memory_runtime_gates",
  "mastra_resources", "mastra_threads", "mastra_messages", "mastra_observational_memory", "mastra_thread_state",
];
const REQUIRED_EXTENSIONS = ["vector"];
const REQUIRED_INDEXES = ["idx_memory_fact_chunks_hnsw"];
const REQUIRED_RUN_COLUMNS = ["request_id", "runtime_mode", "owner_id", "lease_expires_at", "fencing_token", "snapshot_version", "event_sequence", "budgets_json"];
const failures = [];

const report = {
  ok: false,
  workerArtifact: fs.existsSync(path.join(process.cwd(), WORKER_ARTIFACT)),
  artifactDirectory: String(process.env.AGENT_ARTIFACT_DIR || "").trim(),
  artifactDirectoryWritable: false,
  databaseDriver: String(process.env.DB_DRIVER || "").trim().toLowerCase(),
  runtimeMode: String(process.env.AGENT_RUNTIME_MODE || "").trim(),
  tables: {},
  extensions: {},
  indexes: {},
  missingColumns: [],
  missingExtensions: [],
  missingIndexes: [],
  failures,
};

function fail(message) { failures.push(message); }

if (!report.workerArtifact) fail(`Missing ${WORKER_ARTIFACT}`);
if (!report.artifactDirectory) fail("AGENT_ARTIFACT_DIR is required");
else if (!fs.existsSync(report.artifactDirectory)) fail(`AGENT_ARTIFACT_DIR does not exist: ${report.artifactDirectory}`);
else {
  try {
    fs.accessSync(report.artifactDirectory, fs.constants.W_OK);
    report.artifactDirectoryWritable = true;
  } catch { fail(`AGENT_ARTIFACT_DIR is not writable: ${report.artifactDirectory}`); }
}
if (report.databaseDriver !== "postgres") fail("DB_DRIVER must be postgres");
if (report.runtimeMode !== "worker_all") fail("AGENT_RUNTIME_MODE must be worker_all");
const connectionString = String(process.env.DATABASE_URL || "").trim();
if (!connectionString) fail("DATABASE_URL is required");

if (connectionString) {
  const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    for (const table of REQUIRED_TABLES) {
      const result = await pool.query("SELECT to_regclass($1) AS relation", [`public.${table}`]);
      report.tables[table] = Boolean(result.rows[0]?.relation);
    }
    const columns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='agent_runs'");
    const present = new Set(columns.rows.map((row) => String(row.column_name)));
    report.missingColumns = REQUIRED_RUN_COLUMNS.filter((column) => !present.has(column));
    const extensions = await pool.query("SELECT extname FROM pg_extension WHERE extname=ANY($1::text[])", [REQUIRED_EXTENSIONS]);
    const presentExtensions = new Set(extensions.rows.map((row) => String(row.extname)));
    for (const extension of REQUIRED_EXTENSIONS) report.extensions[extension] = presentExtensions.has(extension);
    const indexes = await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname=ANY($1::text[]) AND indexdef ILIKE '% USING hnsw %'", [REQUIRED_INDEXES]);
    const presentIndexes = new Set(indexes.rows.map((row) => String(row.indexname)));
    for (const index of REQUIRED_INDEXES) report.indexes[index] = presentIndexes.has(index);
    const missingTables = Object.entries(report.tables).filter(([, exists]) => !exists).map(([table]) => table);
    report.missingExtensions = REQUIRED_EXTENSIONS.filter((extension) => !report.extensions[extension]);
    report.missingIndexes = REQUIRED_INDEXES.filter((index) => !report.indexes[index]);
    if (missingTables.length) fail(`Missing tables: ${missingTables.join(", ")}`);
    if (report.missingColumns.length) fail(`Missing agent_runs columns: ${report.missingColumns.join(", ")}`);
    if (report.missingExtensions.length) fail(`Missing PostgreSQL extensions: ${report.missingExtensions.join(", ")}`);
    if (report.missingIndexes.length) fail(`Missing HNSW indexes: ${report.missingIndexes.join(", ")}`);
    if (report.tables.memory_runtime_gates) {
      const gates = await pool.query("SELECT gate_name, state FROM memory_runtime_gates WHERE gate_name=ANY($1::text[])", [["read", "write", "extract"]]);
      const gateStates = new Map(gates.rows.map((row) => [String(row.gate_name), String(row.state)]));
      for (const gate of ["read", "write", "extract"]) if (gateStates.get(gate) !== "open") fail(`Memory runtime gate ${gate} is not open`);
    }
    const userFk = await pool.query(`
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_schema='public' AND table_name='memory_fact_chunks'
        AND constraint_name='memory_fact_chunks_user_id_fkey' AND constraint_type='FOREIGN KEY'
    `);
    if (!userFk.rowCount) fail("memory_fact_chunks.user_id must reference users(id)");
    if (report.tables.memory_erasure_requests) {
      const failedErasures = await pool.query("SELECT COUNT(*)::int AS count FROM memory_erasure_requests WHERE status='failed' OR (status='completed' AND COALESCE(completed_layers_json->>'restoreReplay','false') <> 'true')");
      if (Number(failedErasures.rows[0]?.count || 0) > 0) fail(`${failedErasures.rows[0].count} erasure request(s) are failed or lack restore replay evidence`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    await pool.end();
  }
}

report.ok = failures.length === 0;
process.stdout.write(`${JSON.stringify(report)}\n`);
if (!report.ok) process.exitCode = 1;
