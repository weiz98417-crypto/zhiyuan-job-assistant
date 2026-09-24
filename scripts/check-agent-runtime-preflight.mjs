import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

const WORKER_ARTIFACT = "build/agent-worker.mjs";
const REQUIRED_TABLES = [
  "agent_runs",
  "agent_run_events",
  "agent_run_checkpoints",
  "agent_run_inputs",
  "agent_run_gates",
  "agent_tool_attempts",
  "agent_run_outbox",
  "agent_feature_flags",
  "agent_eval_layer_results",
  "jd_resume_matching_preferences",
  "memory_episodes",
  "memory_facts",
  "memory_fact_chunks",
  "profile_blocks",
  "memory_partitions",
];
const REQUIRED_EXTENSIONS = ["vector"];
const REQUIRED_INDEXES = ["idx_memory_fact_chunks_hnsw"];
const REQUIRED_RUN_COLUMNS = [
  "request_id",
  "runtime_mode",
  "owner_id",
  "lease_expires_at",
  "fencing_token",
  "snapshot_version",
  "event_sequence",
  "budgets_json",
];

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
};

if (!report.workerArtifact) fail(`Missing ${WORKER_ARTIFACT}`);
if (!report.artifactDirectory) fail("AGENT_ARTIFACT_DIR is required");
if (!fs.existsSync(report.artifactDirectory)) {
  fail(`AGENT_ARTIFACT_DIR does not exist: ${report.artifactDirectory}`);
}
try {
  fs.accessSync(report.artifactDirectory, fs.constants.W_OK);
  report.artifactDirectoryWritable = true;
} catch {
  fail(`AGENT_ARTIFACT_DIR is not writable: ${report.artifactDirectory}`);
}
if (report.databaseDriver !== "postgres") fail("DB_DRIVER must be postgres");
if (report.runtimeMode !== "worker_all") fail("AGENT_RUNTIME_MODE must be worker_all");
const connectionString = String(process.env.DATABASE_URL || "").trim();
if (!connectionString) fail("DATABASE_URL is required");

const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
try {
  for (const table of REQUIRED_TABLES) {
    const result = await pool.query("SELECT to_regclass($1) AS relation", [`public.${table}`]);
    report.tables[table] = Boolean(result.rows[0]?.relation);
  }
  const columns = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_runs'
  `);
  const present = new Set(columns.rows.map((row) => String(row.column_name)));
  report.missingColumns = REQUIRED_RUN_COLUMNS.filter((column) => !present.has(column));
  const extensions = await pool.query(`
    SELECT extname
    FROM pg_extension
    WHERE extname = ANY($1::text[])
  `, [REQUIRED_EXTENSIONS]);
  const presentExtensions = new Set(extensions.rows.map((row) => String(row.extname)));
  for (const extension of REQUIRED_EXTENSIONS) {
    report.extensions[extension] = presentExtensions.has(extension);
  }
  const indexes = await pool.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = ANY($1::text[])
      AND indexdef ILIKE '% USING hnsw %'
  `, [REQUIRED_INDEXES]);
  const presentIndexes = new Set(indexes.rows.map((row) => String(row.indexname)));
  for (const index of REQUIRED_INDEXES) {
    report.indexes[index] = presentIndexes.has(index);
  }
  const missingTables = Object.entries(report.tables)
    .filter(([, exists]) => !exists)
    .map(([table]) => table);
  report.missingExtensions = REQUIRED_EXTENSIONS.filter((extension) => !report.extensions[extension]);
  report.missingIndexes = REQUIRED_INDEXES.filter((index) => !report.indexes[index]);
  if (missingTables.length > 0) fail(`Missing tables: ${missingTables.join(", ")}`);
  if (report.missingColumns.length > 0) fail(`Missing agent_runs columns: ${report.missingColumns.join(", ")}`);
  if (report.missingExtensions.length > 0) {
    fail(`Missing PostgreSQL extensions: ${report.missingExtensions.join(", ")}`);
  }
  if (report.missingIndexes.length > 0) {
    fail(`Missing HNSW indexes: ${report.missingIndexes.join(", ")}`);
  }
  report.ok = true;
  process.stdout.write(`${JSON.stringify(report)}\n`);
} finally {
  await pool.end();
}

function fail(message) {
  process.stderr.write(`[agent-runtime-preflight] ${message}\n`);
  process.exit(1);
}
