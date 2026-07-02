import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { Pool } from "pg";

export const DEFAULT_SQLITE_PATH = path.join(process.cwd(), "data", "zhiyuan.db");
export const DEFAULT_POSTGRES_SCHEMA_PATH = path.join(process.cwd(), "src", "lib", "postgres-schema.sql");

export const EXCLUDED_SQLITE_TABLES = [
  "sqlite_sequence",
  "reference_resumes_fts",
  "reference_resumes_fts_config",
  "reference_resumes_fts_data",
  "reference_resumes_fts_docsize",
  "reference_resumes_fts_idx",
];

const table = (name, options = {}) => ({
  name,
  conflictColumns: ["id"],
  userOwned: false,
  jsonColumns: [],
  booleanColumns: [],
  uniqueChecks: [],
  volatile: false,
  ...options,
});

export const MIGRATION_TABLES = [
  table("users", { conflictColumns: ["id"], uniqueChecks: [["username"]] }),
  table("profiles", { userOwned: true, jsonColumns: ["data_json", "goals_json", "history_json"] }),
  table("cv_data", { userOwned: true, jsonColumns: ["data_json"] }),
  table("applications", { userOwned: true, uniqueChecks: [["user_id", "company", "role"]] }),
  table("reports", { userOwned: true, jsonColumns: ["blocks_json", "keywords_json"], uniqueChecks: [["user_id", "report_num"]] }),
  table("jds", { userOwned: true, jsonColumns: ["keywords_json"] }),
  table("offers", { userOwned: true, jsonColumns: ["benefits_json"], uniqueChecks: [["user_id", "company", "role"]] }),
  table("offer_reports", {
    userOwned: true,
    jsonColumns: [
      "offer_snapshot_json",
      "modules_json",
      "red_flags_json",
      "missing_info_json",
      "negotiation_levers_json",
      "hr_questions_json",
      "assumptions_json",
      "take_home_json",
      "offers_json",
    ],
  }),
  table("sessions", {
    userOwned: true,
    jsonColumns: ["messages_json", "interview_state_json", "agent_state_json"],
    booleanColumns: ["pinned"],
  }),
  table("stories", { userOwned: true, jsonColumns: ["tags_json"] }),
  table("profile_signals", { userOwned: true, jsonColumns: ["content_json"] }),
  table("reference_resumes", { userOwned: true, jsonColumns: ["sections_json", "tags"] }),
  table("optimization_preferences", { userOwned: true }),
  table("agent_preferences", { userOwned: true, uniqueChecks: [["user_id", "entity_type", "entity_key"]] }),
  table("session_memory", { userOwned: true }),
  table("scan_queue", { userOwned: true, jsonColumns: ["title_positive_json", "title_negative_json", "error_log"] }),
  table("scan_jobs", { userOwned: true, uniqueChecks: [["dedup_key"]] }),
  table("news_cache", { conflictColumns: ["id"], volatile: true }),
];

export function openSqlite(sqlitePath = DEFAULT_SQLITE_PATH, options = {}) {
  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite database not found: ${sqlitePath}`);
  }
  return new Database(sqlitePath, { readonly: options.readonly !== false, fileMustExist: true });
}

export function createPostgresPool(databaseUrl, options = {}) {
  const connectionString = (databaseUrl || process.env.DATABASE_URL || "").trim();
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");
  return new Pool({
    connectionString,
    max: Number(process.env.POSTGRES_MAX_CONNECTIONS || options.maxConnections || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export function listSqliteTables(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
}

export function getSqliteColumns(db, tableName) {
  return db.prepare(`PRAGMA table_info(${quoteSqliteIdent(tableName)})`).all().map((row) => row.name);
}

export async function getPostgresColumns(client, tableName) {
  const result = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [tableName],
  );
  return result.rows.map((row) => row.column_name);
}

export function buildMigrationInventory(db) {
  const sqliteTables = listSqliteTables(db);
  const sqliteTableSet = new Set(sqliteTables);
  const excluded = sqliteTables.filter((name) => EXCLUDED_SQLITE_TABLES.includes(name));
  const unknown = sqliteTables.filter(
    (name) => !EXCLUDED_SQLITE_TABLES.includes(name) && !MIGRATION_TABLES.some((tableConfig) => tableConfig.name === name),
  );

  const tables = MIGRATION_TABLES.map((tableConfig) => {
    const exists = sqliteTableSet.has(tableConfig.name);
    const columns = exists ? getSqliteColumns(db, tableConfig.name) : [];
    const rowCount = exists ? getTableCount(db, tableConfig.name) : 0;
    return {
      name: tableConfig.name,
      exists,
      rowCount,
      columns,
      target: tableConfig.name,
      jsonColumns: tableConfig.jsonColumns,
      userOwned: tableConfig.userOwned,
    };
  });

  return { tables, excluded, unknown };
}

export function getTableCount(db, tableName) {
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${quoteSqliteIdent(tableName)}`).get().count || 0);
}

export function resolveDefaultOwner(db, ownerInput) {
  if (!ownerInput) return null;
  const row = db
    .prepare("SELECT id, username, display_name FROM users WHERE id = ? OR username = ? ORDER BY id = ? DESC LIMIT 1")
    .get(ownerInput, ownerInput, ownerInput);
  if (!row) throw new Error(`Default owner was not found in SQLite users by id/username: ${ownerInput}`);
  return { id: row.id, username: row.username, displayName: row.display_name };
}

export function analyzeOwnership(db, defaultOwnerId = null) {
  const missing = [];
  const assignments = [];
  const sourceTables = new Set(listSqliteTables(db));

  for (const tableConfig of MIGRATION_TABLES.filter((item) => item.userOwned)) {
    if (!sourceTables.has(tableConfig.name)) continue;
    const columns = getSqliteColumns(db, tableConfig.name);
    const rowCount = getTableCount(db, tableConfig.name);
    if (rowCount === 0) continue;

    if (!columns.includes("user_id")) {
      const entry = { table: tableConfig.name, count: rowCount, reason: "missing user_id column" };
      if (defaultOwnerId) assignments.push({ ...entry, assignedUserId: defaultOwnerId });
      else missing.push(entry);
      continue;
    }

    const nullCount = Number(
      db.prepare(`SELECT COUNT(*) AS count FROM ${quoteSqliteIdent(tableConfig.name)} WHERE user_id IS NULL OR user_id = ''`).get().count || 0,
    );
    if (nullCount > 0) {
      const entry = { table: tableConfig.name, count: nullCount, reason: "null or empty user_id" };
      if (defaultOwnerId) assignments.push({ ...entry, assignedUserId: defaultOwnerId });
      else missing.push(entry);
    }
  }

  return { missing, assignments };
}

export function validateSqliteJson(db) {
  const errors = [];
  const sourceTables = new Set(listSqliteTables(db));

  for (const tableConfig of MIGRATION_TABLES) {
    if (!sourceTables.has(tableConfig.name) || tableConfig.jsonColumns.length === 0) continue;
    const columns = getSqliteColumns(db, tableConfig.name);
    const selectedJsonColumns = tableConfig.jsonColumns.filter((column) => columns.includes(column));
    if (selectedJsonColumns.length === 0) continue;

    const rows = db.prepare(`SELECT * FROM ${quoteSqliteIdent(tableConfig.name)}`).all();
    for (const row of rows) {
      for (const column of selectedJsonColumns) {
        try {
          parseJsonValue(row[column], defaultJsonForColumn(column));
        } catch (error) {
          errors.push({
            table: tableConfig.name,
            id: row.id ?? row.report_num ?? row.dedup_key ?? "",
            column,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  return errors;
}

export async function bootstrapPostgresSchema(client, schemaPath = DEFAULT_POSTGRES_SCHEMA_PATH) {
  const schema = fs.readFileSync(schemaPath, "utf-8");
  await client.query(schema);
}

export async function buildMigrationPlan({ sqliteDb, pgClient = null, defaultOwner = null }) {
  const defaultOwnerRecord = resolveDefaultOwner(sqliteDb, defaultOwner);
  const inventory = buildMigrationInventory(sqliteDb);
  const ownership = analyzeOwnership(sqliteDb, defaultOwnerRecord?.id || null);
  const jsonErrors = validateSqliteJson(sqliteDb);
  const conflicts = pgClient
    ? await findPostgresConflicts({ sqliteDb, pgClient, defaultOwnerId: defaultOwnerRecord?.id || null })
    : [];

  return {
    inventory,
    defaultOwner: defaultOwnerRecord,
    ownership,
    jsonErrors,
    conflicts,
    canApply: ownership.missing.length === 0 && jsonErrors.length === 0 && conflicts.length === 0,
  };
}

export async function migrateSqliteToPostgres({ sqliteDb, pgClient, defaultOwner = null, dryRun = false, schemaPath = DEFAULT_POSTGRES_SCHEMA_PATH }) {
  const plan = await buildMigrationPlan({ sqliteDb, pgClient, defaultOwner });
  if (dryRun) return { plan, applied: false, migratedRows: [] };
  if (!plan.canApply) {
    throw new Error("Migration preflight failed. Run dry-run and resolve missing owners, JSON errors, or target conflicts.");
  }

  const sourceTables = new Set(listSqliteTables(sqliteDb));
  const migratedRows = [];

  await pgClient.query("BEGIN");
  try {
    await bootstrapPostgresSchema(pgClient, schemaPath);

    for (const tableConfig of MIGRATION_TABLES) {
      if (!sourceTables.has(tableConfig.name)) {
        migratedRows.push({ table: tableConfig.name, sourceCount: 0, insertedOrUpdated: 0, skipped: "source table missing" });
        continue;
      }

      const targetColumns = await getPostgresColumns(pgClient, tableConfig.name);
      const rows = sqliteDb.prepare(`SELECT * FROM ${quoteSqliteIdent(tableConfig.name)}`).all();
      let count = 0;
      for (const row of rows) {
        const transformed = transformRow(row, tableConfig, targetColumns, plan.defaultOwner?.id || null);
        if (Object.keys(transformed).length === 0) continue;
        const sql = buildUpsertSql(tableConfig.name, Object.keys(transformed), tableConfig.conflictColumns);
        await pgClient.query(sql, Object.values(transformed));
        count++;
      }
      await resetPostgresIdentity(pgClient, tableConfig.name, targetColumns);
      migratedRows.push({ table: tableConfig.name, sourceCount: rows.length, insertedOrUpdated: count });
    }

    await pgClient.query("COMMIT");
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  }

  return { plan, applied: true, migratedRows };
}

export async function verifyMigration({ sqliteDb, pgClient, defaultOwner = null, sampleSize = 3, mode = "strict" }) {
  const verificationMode = mode === "cutover" || mode === "archive" ? "cutover" : "strict";
  const allowTargetDrift = verificationMode === "cutover";
  const plan = await buildMigrationPlan({ sqliteDb, pgClient, defaultOwner });
  const sourceTables = new Set(listSqliteTables(sqliteDb));
  const tableChecks = [];
  const jsonSamples = [];
  const isolationChecks = [];
  const errors = [];
  const warnings = [];

  for (const tableConfig of MIGRATION_TABLES) {
    if (!sourceTables.has(tableConfig.name)) {
      tableChecks.push({ table: tableConfig.name, sourceCount: 0, migratedCount: 0, targetTotal: 0, ok: true, skipped: "source table missing" });
      continue;
    }

    const sourceRows = sqliteDb.prepare(`SELECT * FROM ${quoteSqliteIdent(tableConfig.name)}`).all();
    const targetColumns = await getPostgresColumns(pgClient, tableConfig.name);
    const targetTotal = Number((await pgClient.query(`SELECT COUNT(*) AS count FROM ${quotePgIdent(tableConfig.name)}`)).rows[0].count);
    if (tableConfig.volatile) {
      tableChecks.push({
        table: tableConfig.name,
        sourceCount: sourceRows.length,
        migratedCount: Math.min(sourceRows.length, targetTotal),
        targetTotal,
        ok: true,
        skipped: "volatile cache table",
      });
      continue;
    }

    const keyColumn = tableConfig.conflictColumns[0];
    let migratedCount = 0;
    if (sourceRows.length > 0 && targetColumns.includes(keyColumn)) {
      for (const row of sourceRows) {
        const value = row[keyColumn];
        const result = await pgClient.query(`SELECT 1 FROM ${quotePgIdent(tableConfig.name)} WHERE ${quotePgIdent(keyColumn)} = $1 LIMIT 1`, [value]);
        if (result.rowCount === 1) migratedCount++;
      }
    }
    const ok = migratedCount === sourceRows.length;
    if (!ok) errors.push(`${tableConfig.name}: expected ${sourceRows.length} source rows to be present, found ${migratedCount}`);
    tableChecks.push({ table: tableConfig.name, sourceCount: sourceRows.length, migratedCount, targetTotal, ok });

    jsonSamples.push(...(await compareJsonSamples({ sqliteDb, pgClient, tableConfig, targetColumns, defaultOwnerId: plan.defaultOwner?.id || null, sampleSize })));
    if (tableConfig.userOwned && targetColumns.includes("user_id")) {
      isolationChecks.push(await compareUserCounts({
        sqliteDb,
        pgClient,
        tableConfig,
        defaultOwnerId: plan.defaultOwner?.id || null,
        allowTargetSuperset: allowTargetDrift,
      }));
    }
  }

  for (const sample of jsonSamples) {
    if (!sample.ok) {
      const message = `${sample.table}.${sample.column} sample ${sample.key}: JSON mismatch`;
      if (allowTargetDrift) warnings.push(`${message} (accepted as post-cutover target drift)`);
      else errors.push(message);
    }
  }
  for (const check of isolationChecks) {
    if (!check.ok) errors.push(`${check.table}: per-user counts mismatch`);
  }
  if (allowTargetDrift && plan.ownership.missing.length > 0) {
    warnings.push(`${plan.ownership.missing.length} legacy SQLite ownership issue(s) skipped in cutover archive mode`);
  }

  return {
    mode: verificationMode,
    ok: errors.length === 0 && plan.jsonErrors.length === 0 && (allowTargetDrift || plan.ownership.missing.length === 0),
    errors,
    warnings,
    plan,
    tableChecks,
    jsonSamples,
    isolationChecks,
  };
}

export function formatMigrationPlan(plan) {
  const lines = [];
  lines.push("# SQLite -> PostgreSQL migration dry-run");
  lines.push("");
  lines.push(`Default owner: ${plan.defaultOwner ? `${plan.defaultOwner.username} (${plan.defaultOwner.id})` : "not configured"}`);
  lines.push(`Can apply: ${plan.canApply ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Table inventory");
  for (const item of plan.inventory.tables) {
    lines.push(`- ${item.name} -> ${item.target}: ${item.exists ? `${item.rowCount} rows` : "source table missing"}, columns: ${item.columns.join(", ") || "-"}`);
  }
  if (plan.inventory.excluded.length) {
    lines.push("");
    lines.push(`Excluded SQLite tables: ${plan.inventory.excluded.join(", ")}`);
  }
  if (plan.inventory.unknown.length) {
    lines.push(`Unknown SQLite tables: ${plan.inventory.unknown.join(", ")}`);
  }
  appendIssueList(lines, "Missing owner rows", plan.ownership.missing);
  appendIssueList(lines, "Default owner assignments", plan.ownership.assignments);
  appendIssueList(lines, "JSON validation errors", plan.jsonErrors);
  appendIssueList(lines, "Target conflicts", plan.conflicts);
  return `${lines.join("\n")}\n`;
}

export function formatMigrationResult(result) {
  const lines = [];
  lines.push("# SQLite -> PostgreSQL migration apply");
  lines.push("");
  for (const row of result.migratedRows) {
    lines.push(`- ${row.table}: ${row.insertedOrUpdated}/${row.sourceCount} rows${row.skipped ? ` (${row.skipped})` : ""}`);
  }
  appendIssueList(lines, "Default owner assignments", result.plan.ownership.assignments);
  return `${lines.join("\n")}\n`;
}

export function formatVerificationReport(report) {
  const lines = [];
  lines.push("# SQLite -> PostgreSQL migration verification");
  lines.push("");
  lines.push(`Mode: ${report.mode || "strict"}`);
  lines.push(`Status: ${report.ok ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push("## Row checks");
  for (const check of report.tableChecks) {
    const status = check.skipped ? `ok (${check.skipped})` : (check.ok ? "ok" : "mismatch");
    lines.push(`- ${check.table}: source=${check.sourceCount}, migrated=${check.migratedCount}, target_total=${check.targetTotal}, ${status}`);
  }
  lines.push("");
  lines.push("## JSON samples");
  const samples = report.jsonSamples.slice(0, 30);
  if (samples.length === 0) lines.push("- No JSON samples found.");
  for (const sample of samples) {
    const sampleStatus = sample.ok ? "ok" : (report.mode === "cutover" ? "drift" : "mismatch");
    lines.push(`- ${sample.table}.${sample.column} ${sample.key}: ${sampleStatus}`);
  }
  lines.push("");
  lines.push("## Per-user isolation");
  if (report.isolationChecks.length === 0) lines.push("- No user-owned tables found.");
  for (const check of report.isolationChecks) {
    const comparison = check.mode === "target_superset" ? "target>=source" : "exact";
    lines.push(`- ${check.table}: ${check.ok ? "ok" : "mismatch"} [${comparison}] (${JSON.stringify(check.sourceCounts)} -> ${JSON.stringify(check.targetCounts)})`);
  }
  appendIssueList(lines, "Errors", report.errors.map((message) => ({ message })));
  appendIssueList(lines, "Warnings", (report.warnings || []).map((message) => ({ message })));
  appendIssueList(lines, "Default owner assignments", report.plan.ownership.assignments);
  appendIssueList(lines, "Legacy owner gaps", report.plan.ownership.missing);
  return `${lines.join("\n")}\n`;
}

async function findPostgresConflicts({ sqliteDb, pgClient, defaultOwnerId }) {
  const conflicts = [];
  const sourceTables = new Set(listSqliteTables(sqliteDb));
  for (const tableConfig of MIGRATION_TABLES) {
    if (!sourceTables.has(tableConfig.name) || tableConfig.uniqueChecks.length === 0) continue;
    const targetColumns = await getPostgresColumns(pgClient, tableConfig.name);
    const rows = sqliteDb.prepare(`SELECT * FROM ${quoteSqliteIdent(tableConfig.name)}`).all();
    for (const uniqueColumns of tableConfig.uniqueChecks) {
      if (!uniqueColumns.every((column) => targetColumns.includes(column))) continue;
      for (const row of rows) {
        const transformed = transformRow(row, tableConfig, targetColumns, defaultOwnerId);
        if (!uniqueColumns.every((column) => transformed[column] !== undefined && transformed[column] !== null)) continue;
        const where = uniqueColumns.map((column, index) => `${quotePgIdent(column)} = $${index + 1}`).join(" AND ");
        const result = await pgClient.query(
          `SELECT id FROM ${quotePgIdent(tableConfig.name)} WHERE ${where} LIMIT 1`,
          uniqueColumns.map((column) => transformed[column]),
        );
        if (result.rowCount && String(result.rows[0].id) !== String(transformed.id ?? "")) {
          conflicts.push({
            table: tableConfig.name,
            uniqueKey: uniqueColumns.join(","),
            sourceId: transformed.id ?? "",
            targetId: result.rows[0].id,
          });
        }
      }
    }
  }
  return conflicts;
}

function transformRow(row, tableConfig, targetColumns, defaultOwnerId) {
  const result = {};
  const targetColumnSet = new Set(targetColumns);

  for (const [key, value] of Object.entries(row)) {
    if (!targetColumnSet.has(key)) continue;
    result[key] = value;
  }

  if (tableConfig.userOwned && targetColumnSet.has("user_id") && (result.user_id === undefined || result.user_id === null || result.user_id === "")) {
    result.user_id = defaultOwnerId;
  }

  for (const column of tableConfig.jsonColumns) {
    if (!targetColumnSet.has(column) || result[column] === undefined) continue;
    result[column] = JSON.stringify(parseJsonValue(result[column], defaultJsonForColumn(column)));
  }

  for (const column of tableConfig.booleanColumns) {
    if (!targetColumnSet.has(column) || result[column] === undefined || result[column] === null) continue;
    result[column] = Boolean(result[column]);
  }

  return result;
}

function parseJsonValue(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  return JSON.parse(String(value));
}

function defaultJsonForColumn(column) {
  if (column === "tags") return [];
  return /_json$/.test(column) && !/(data_json|goals_json|content_json|benefits_json|offer_snapshot_json|take_home_json)/.test(column)
    ? []
    : {};
}

function buildUpsertSql(tableName, columns, conflictColumns) {
  const quotedColumns = columns.map(quotePgIdent).join(", ");
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const conflict = conflictColumns.map(quotePgIdent).join(", ");
  const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
  const updateClause = updateColumns.length
    ? `DO UPDATE SET ${updateColumns.map((column) => `${quotePgIdent(column)} = EXCLUDED.${quotePgIdent(column)}`).join(", ")}`
    : "DO NOTHING";
  return `INSERT INTO ${quotePgIdent(tableName)} (${quotedColumns}) VALUES (${placeholders}) ON CONFLICT (${conflict}) ${updateClause}`;
}

async function resetPostgresIdentity(client, tableName, targetColumns) {
  if (!targetColumns.includes("id")) return;
  const maxResult = await client.query(`SELECT MAX(id) AS max_id FROM ${quotePgIdent(tableName)}`);
  const maxId = Number(maxResult.rows[0].max_id || 0);
  if (maxId <= 0) return;
  const sequenceResult = await client.query("SELECT pg_get_serial_sequence($1, 'id') AS sequence_name", [tableName]);
  const sequenceName = sequenceResult.rows[0]?.sequence_name;
  if (!sequenceName) return;
  await client.query("SELECT setval($1::regclass, $2, true)", [sequenceName, maxId]);
}

async function compareJsonSamples({ sqliteDb, pgClient, tableConfig, targetColumns, defaultOwnerId, sampleSize }) {
  if (tableConfig.jsonColumns.length === 0) return [];
  const sourceColumns = getSqliteColumns(sqliteDb, tableConfig.name);
  const jsonColumns = tableConfig.jsonColumns.filter((column) => sourceColumns.includes(column) && targetColumns.includes(column));
  if (jsonColumns.length === 0) return [];

  const keyColumn = tableConfig.conflictColumns[0];
  const rows = sqliteDb
    .prepare(`SELECT * FROM ${quoteSqliteIdent(tableConfig.name)} ORDER BY ${quoteSqliteIdent(keyColumn)} LIMIT ?`)
    .all(sampleSize);
  const samples = [];
  for (const row of rows) {
    const transformed = transformRow(row, tableConfig, targetColumns, defaultOwnerId);
    const result = await pgClient.query(
      `SELECT ${jsonColumns.map(quotePgIdent).join(", ")} FROM ${quotePgIdent(tableConfig.name)} WHERE ${quotePgIdent(keyColumn)} = $1 LIMIT 1`,
      [row[keyColumn]],
    );
    for (const column of jsonColumns) {
      const source = normalizeJson(JSON.parse(transformed[column]));
      const target = result.rowCount ? normalizeJson(result.rows[0][column]) : "__missing__";
      samples.push({ table: tableConfig.name, column, key: row[keyColumn], ok: source === target });
    }
  }
  return samples;
}

async function compareUserCounts({ sqliteDb, pgClient, tableConfig, defaultOwnerId, allowTargetSuperset = false }) {
  const sourceColumns = getSqliteColumns(sqliteDb, tableConfig.name);
  const rows = sqliteDb.prepare(`SELECT * FROM ${quoteSqliteIdent(tableConfig.name)}`).all();
  const sourceCounts = {};
  for (const row of rows) {
    const userId = sourceColumns.includes("user_id") && row.user_id ? row.user_id : defaultOwnerId;
    if (!userId) continue;
    sourceCounts[userId] = (sourceCounts[userId] || 0) + 1;
  }

  const targetRows = await pgClient.query(
    `SELECT user_id, COUNT(*) AS count FROM ${quotePgIdent(tableConfig.name)} WHERE user_id IS NOT NULL GROUP BY user_id ORDER BY user_id`,
  );
  const targetCounts = Object.fromEntries(targetRows.rows.map((row) => [row.user_id, Number(row.count)]));
  const ok = allowTargetSuperset
    ? Object.entries(sourceCounts).every(([userId, count]) => Number(targetCounts[userId] || 0) >= Number(count))
    : stableStringify(sourceCounts) === stableStringify(targetCounts);
  return {
    table: tableConfig.name,
    sourceCounts,
    targetCounts,
    ok,
    mode: allowTargetSuperset ? "target_superset" : "exact",
  };
}

function normalizeJson(value) {
  return stableStringify(value);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function appendIssueList(lines, title, items) {
  if (!items?.length) return;
  lines.push("");
  lines.push(`## ${title}`);
  for (const item of items) {
    lines.push(`- ${Object.entries(item).map(([key, value]) => `${key}=${value}`).join(", ")}`);
  }
}

function quoteSqliteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function quotePgIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}
