#!/usr/bin/env node

import fs from "fs";
import path from "node:path";
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
  "memory_episodes",
  "memory_facts",
  "memory_fact_decisions",
  "memory_entities",
  "profile_blocks",
  "memory_partitions",
  "memory_admission_candidates",
  "memory_fact_chunks",
  "memory_entity_facts",
  "memory_profile_block_facts",
  "memory_discovery_settings",
  "memory_support_grants",
  "memory_support_access_audit",
  "memory_erasure_requests",
  "memory_erasure_suppressions",
  "mastra_resources",
  "mastra_threads",
  "mastra_messages",
  "mastra_observational_memory",
  "mastra_thread_state",
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
    evidence: process.env.POSTGRES_RESTORE_EVIDENCE || "",
    schemaPath: "src/lib/postgres-schema.sql",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--database-url") args.databaseUrl = readValue(argv, ++index, arg);
    else if (arg === "--input") args.input = readValue(argv, ++index, arg);
    else if (arg === "--schema") args.schemaPath = readValue(argv, ++index, arg);
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--allow-overwrite") args.allowOverwrite = true;
    else if (arg === "--evidence") args.evidence = readValue(argv, ++index, arg);
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
  --evidence <path>      Write a read-back recovery evidence JSON after a successful restore.
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

async function orderTablesByForeignKeys(client, tables) {
  const names = new Set(tables.map((table) => table.name));
  const dependencies = new Map(tables.map((table) => [table.name, new Set()]));
  try {
    const result = await client.query(`
      SELECT tc.table_name, ccu.table_name AS referenced_table
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name=tc.constraint_name
       AND ccu.constraint_schema=tc.constraint_schema
      WHERE tc.constraint_schema='public' AND tc.table_schema='public' AND tc.constraint_type='FOREIGN KEY'
    `);
    for (const row of result.rows) {
      const child = String(row.table_name);
      const parent = String(row.referenced_table);
      if (child !== parent && names.has(child) && names.has(parent)) dependencies.get(child)?.add(parent);
    }
  } catch {
    return tables;
  }
  const priority = new Map(PREFERRED_RESTORE_ORDER.map((name, index) => [name, index]));
  const orderedNames = [];
  const remaining = new Set(names);
  while (remaining.size) {
    const ready = Array.from(remaining).filter((name) => Array.from(dependencies.get(name) || []).every((parent) => !remaining.has(parent)));
    const candidates = ready.length ? ready : Array.from(remaining);
    candidates.sort((left, right) => (priority.get(left) ?? Number.MAX_SAFE_INTEGER) - (priority.get(right) ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right));
    const next = candidates[0];
    remaining.delete(next);
    orderedNames.push(next);
  }
  const byName = new Map(tables.map((table) => [table.name, table]));
  return orderedNames.map((name) => byName.get(name)).filter(Boolean);
}

async function tableRowCount(client, tableName) {
  const result = await client.query(`SELECT COUNT(*) AS count FROM "${tableName.replace(/"/g, '""')}"`);
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
    await client.query(`SELECT setval($1, COALESCE((SELECT MAX(id) FROM "${table.name.replace(/"/g, '""')}"), 0) + 1, false)`, [seqName]);
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
      `INSERT INTO "${table.name.replace(/"/g, '""')}" (${columnSql}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
      columns.map((column) => row[column]),
    );
    inserted += 1;
  }
  return inserted;
}

async function insertRow(client, tableName, row, omitColumns = []) {
  const columns = Object.keys(row).filter((column) => !omitColumns.includes(column));
  if (columns.length === 0) return false;
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const columnSql = columns.map((column) => `"${column.replace(/"/g, '""')}"`).join(", ");
  await client.query(
    `INSERT INTO "${tableName.replace(/"/g, '""')}" (${columnSql}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
    columns.map((column) => row[column]),
  );
  return true;
}

async function insertMemoryFacts(client, table) {
  let inserted = 0;
  for (const row of table.rows || []) {
    if (await insertRow(client, table.name, row, ["decision_id", "superseded_by"])) inserted += 1;
  }
  return inserted;
}

async function restoreMemoryFactReferences(client, table) {
  for (const row of table.rows || []) {
    if (row.decision_id == null && row.superseded_by == null) continue;
    await client.query(
      `UPDATE memory_facts
       SET decision_id=$1, superseded_by=$2
       WHERE id=$3`,
      [row.decision_id == null ? null : Number(row.decision_id), row.superseded_by == null ? null : Number(row.superseded_by), Number(row.id)],
    );
  }
}

async function restoreTable(client, table) {
  if (table.name === "memory_runtime_gates") return 0;
  if (table.name === "memory_facts") return insertMemoryFacts(client, table);
  return insertRows(client, table);
}

async function tableExists(client, tableName) {
  const result = await client.query("SELECT to_regclass($1) AS relation", [`public.${tableName}`]);
  return Boolean(result.rows[0]?.relation);
}

async function setMemoryGates(client, state, reason) {
  await client.query(`
    INSERT INTO memory_runtime_gates (gate_name, state, reason)
    VALUES ('read',$1,$2), ('write',$1,$2), ('extract',$1,$2)
    ON CONFLICT (gate_name) DO UPDATE
      SET state=EXCLUDED.state, reason=EXCLUDED.reason, updated_at=now()
  `, [state, reason]);
}

function redactJsonValue(value, target) {
  if (typeof value === "string") return value.split(target).join("[已清除]");
  if (Array.isArray(value)) return value.map((item) => redactJsonValue(item, target));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactJsonValue(item, target)]));
  return value;
}

async function redactExecutionSessionMemory(client, userId, targetText) {
  const rows = await client.query(
    `SELECT id, content FROM session_memory
     WHERE user_id=$1 AND summary_type='execution_conversation'
     FOR UPDATE`,
    [userId],
  );
  for (const row of rows.rows) {
    let parsed;
    try { parsed = typeof row.content === "string" ? JSON.parse(row.content) : row.content; } catch { parsed = null; }
    if (!parsed || typeof parsed !== "object") continue;
    const next = redactJsonValue(parsed, targetText);
    if (JSON.stringify(next) !== JSON.stringify(parsed)) {
      await client.query("UPDATE session_memory SET content=$1 WHERE id=$2 AND user_id=$3", [JSON.stringify(next), row.id, userId]);
    }
  }
}

function parseScope(value) {
  let scope = value;
  try { scope = typeof value === "string" ? JSON.parse(value) : value; } catch { scope = {}; }
  return {
    factIds: Array.isArray(scope?.factIds) ? scope.factIds.map(Number).filter(Number.isInteger) : [],
    itemIds: Array.isArray(scope?.itemIds) ? scope.itemIds.map(Number).filter(Number.isInteger) : [],
    episodeIds: Array.isArray(scope?.episodeIds) ? scope.episodeIds.map(Number).filter(Number.isInteger) : [],
    sourceRefs: Array.isArray(scope?.sourceRefs) ? scope.sourceRefs : [],
    targetKey: typeof scope?.targetKey === "string" ? scope.targetKey : null,
  };
}

async function replayCompletedErasures(client) {
  const requests = await client.query(`
    SELECT id, user_id, target_hash, scope_json
    FROM memory_erasure_requests
    WHERE status='completed'
    ORDER BY id
  `);
  let replayed = 0;
  const evidence = [];
  const optionalTables = new Map();
  for (const tableName of ["mastra_messages", "mastra_observational_memory", "mastra_resources", "mastra_threads", "mastra_thread_state", "memory_items", "memory_evidence", "memory_chunks", "session_memory"]) {
    optionalTables.set(tableName, await tableExists(client, tableName));
  }
  for (const request of requests.rows) {
    const scope = parseScope(request.scope_json);
    const userId = String(request.user_id);
    const factRows = scope.factIds.length
      ? (await client.query("SELECT id, canonical_text, source_episode_id FROM memory_facts WHERE user_id=$1 AND id=ANY($2::bigint[])", [userId, scope.factIds])).rows
      : [];
    const itemRows = scope.itemIds.length && optionalTables.get("memory_items")
      ? (await client.query("SELECT id, canonical_text FROM memory_items WHERE user_id=$1 AND id=ANY($2::bigint[])", [userId, scope.itemIds])).rows
      : [];
    const targetTexts = Array.from(new Set([...factRows, ...itemRows].map((row) => String(row.canonical_text || "")).filter(Boolean)));
    const episodeIds = Array.from(new Set([...scope.episodeIds, ...factRows.map((row) => Number(row.source_episode_id))].filter((id) => Number.isInteger(id) && id > 0)));
    if (scope.factIds.length) {
      await client.query("UPDATE memory_admission_candidates SET fact_id=NULL WHERE user_id=$1 AND fact_id=ANY($2::bigint[])", [userId, scope.factIds]);
      await client.query("UPDATE memory_facts SET superseded_by=NULL WHERE user_id=$1 AND superseded_by=ANY($2::bigint[])", [userId, scope.factIds]);
      const decisionIds = (await client.query("SELECT id FROM memory_fact_decisions WHERE user_id=$1 AND (target_fact_id=ANY($2::bigint[]) OR result_fact_id=ANY($2::bigint[]))", [userId, scope.factIds])).rows.map((row) => Number(row.id));
      await client.query("UPDATE memory_fact_decisions SET target_fact_id=NULL WHERE user_id=$1 AND target_fact_id=ANY($2::bigint[])", [userId, scope.factIds]);
      await client.query("UPDATE memory_fact_decisions SET result_fact_id=NULL WHERE user_id=$1 AND result_fact_id=ANY($2::bigint[])", [userId, scope.factIds]);
      await client.query("UPDATE memory_facts SET decision_id=NULL WHERE user_id=$1 AND id=ANY($2::bigint[])", [userId, scope.factIds]);
      if (decisionIds.length) await client.query("DELETE FROM memory_fact_decisions WHERE user_id=$1 AND id=ANY($2::bigint[])", [userId, decisionIds]);
      await client.query("DELETE FROM memory_fact_chunks WHERE fact_id=ANY($1::bigint[])", [scope.factIds]);
      await client.query("DELETE FROM memory_profile_block_facts WHERE fact_id=ANY($1::bigint[])", [scope.factIds]);
      await client.query("DELETE FROM memory_entity_facts WHERE fact_id=ANY($1::bigint[])", [scope.factIds]);
      await client.query("DELETE FROM memory_facts WHERE user_id=$1 AND id=ANY($2::bigint[])", [userId, scope.factIds]);
    }
    if (scope.itemIds.length) {
      if (optionalTables.get("memory_evidence")) await client.query("DELETE FROM memory_evidence WHERE user_id=$1 AND memory_item_id=ANY($2::bigint[])", [userId, scope.itemIds]);
      if (optionalTables.get("memory_items")) await client.query("DELETE FROM memory_items WHERE user_id=$1 AND id=ANY($2::bigint[])", [userId, scope.itemIds]);
    }
    for (const textValue of targetTexts) {
      if (await tableExists(client, "memory_episodes")) await client.query("UPDATE memory_episodes SET content_json=replace(content_json::text,$1,'[已清除]')::jsonb WHERE user_id=$2 AND (id=ANY($3::bigint[]) OR content_json::text LIKE '%' || $1 || '%')", [textValue, userId, episodeIds]);
      if (await tableExists(client, "memory_entities")) await client.query("UPDATE memory_entities SET summary=replace(summary,$1,'[已清除]'), updated_at=now() WHERE user_id=$2 AND summary LIKE '%' || $1 || '%'", [textValue, userId]);
      if (await tableExists(client, "profile_blocks")) await client.query("UPDATE profile_blocks SET value_json=replace(value_json::text,$1,'[已清除]')::jsonb, updated_at=now() WHERE user_id=$2 AND value_json::text LIKE '%' || $1 || '%'", [textValue, userId]);
      if (optionalTables.get("session_memory")) {
        await redactExecutionSessionMemory(client, userId, textValue);
        await client.query("UPDATE session_memory SET content=replace(content,$1,'[已清除]') WHERE user_id=$2 AND summary_type <> 'execution_conversation' AND content LIKE '%' || $1 || '%'", [textValue, userId]);
      }
      if (optionalTables.get("memory_chunks")) await client.query("DELETE FROM memory_chunks WHERE user_id=$1 AND chunk_text LIKE '%' || $2 || '%'", [userId, textValue]);
      await client.query("DELETE FROM memory_admission_candidates WHERE user_id=$1 AND canonical_text=$2", [userId, textValue]);
      if (optionalTables.get("memory_evidence")) await client.query("DELETE FROM memory_evidence WHERE user_id=$1 AND memory_item_id IN (SELECT id FROM memory_items WHERE user_id=$1 AND canonical_text=$2)", [userId, textValue]);
      if (optionalTables.get("memory_items")) await client.query("DELETE FROM memory_items WHERE user_id=$1 AND canonical_text=$2", [userId, textValue]);
      if (optionalTables.get("mastra_resources")) await client.query("UPDATE mastra_resources SET \"workingMemory\"=replace(COALESCE(\"workingMemory\",''),$1,'[已清除]') WHERE id=$2 AND \"workingMemory\" LIKE '%' || $1 || '%'", [textValue, userId]);
      if (optionalTables.get("mastra_thread_state")) await client.query("UPDATE mastra_thread_state SET value=replace(value::text,$1,'[已清除]')::jsonb, \"updatedAtZ\"=NOW() WHERE \"threadId\" IN (SELECT id FROM mastra_threads WHERE \"resourceId\"=$2) AND value::text LIKE '%' || $1 || '%'", [textValue, userId]);
      if (optionalTables.get("mastra_observational_memory")) await client.query("UPDATE mastra_observational_memory SET \"activeObservations\"=replace(\"activeObservations\",$1,'[已清除]'), \"activeObservationsPendingUpdate\"=replace(COALESCE(\"activeObservationsPendingUpdate\",''),$1,'[已清除]'), \"bufferedObservations\"=replace(COALESCE(\"bufferedObservations\",''),$1,'[已清除]'), \"bufferedReflection\"=replace(COALESCE(\"bufferedReflection\",''),$1,'[已清除]'), \"bufferedObservationChunks\"=CASE WHEN \"bufferedObservationChunks\" IS NULL THEN NULL ELSE replace(\"bufferedObservationChunks\"::text,$1,'[已清除]')::jsonb END WHERE \"resourceId\"=$2 OR \"threadId\" IN (SELECT id FROM mastra_threads WHERE \"resourceId\"=$2)", [textValue, userId]);
    }
    for (const source of scope.sourceRefs) {
      if (!source || typeof source !== "object") continue;
      const sourceType = String(source.sourceType || "");
      const sourceId = String(source.sourceId || "");
      if (!sourceId) continue;
      if (optionalTables.get("memory_chunks")) await client.query("DELETE FROM memory_chunks WHERE user_id=$1 AND source_type=$2 AND source_id=$3", [userId, sourceType, sourceId]);
      if (sourceType === "session" && optionalTables.get("session_memory")) await client.query("DELETE FROM session_memory WHERE user_id=$1 AND session_id=$2 AND summary_type <> 'execution_conversation'", [userId, Number(sourceId)]);
    }
    if (episodeIds.length && optionalTables.get("session_memory")) await client.query("DELETE FROM session_memory WHERE user_id=$1 AND session_id=ANY($2::bigint[]) AND summary_type <> 'execution_conversation'", [userId, episodeIds]);
    const suppressionRefs = scope.sourceRefs.length ? scope.sourceRefs : [{ sourceType: "", sourceId: "" }];
    for (const source of suppressionRefs) {
      if (!source || typeof source !== "object") continue;
      const sourceType = String(source.sourceType || "");
      const sourceId = String(source.sourceId || "");
      await client.query("INSERT INTO memory_erasure_suppressions (user_id,target_hash,target_key,source_type,source_id,request_id) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id,target_hash,source_type,source_id) DO UPDATE SET lifted_at=NULL,request_id=EXCLUDED.request_id", [userId, String(request.target_hash || ""), scope.targetKey || null, sourceType, sourceId, request.id]);
    }
    await client.query("UPDATE memory_erasure_requests SET completed_layers_json=jsonb_set(COALESCE(completed_layers_json,'{}'::jsonb), '{restoreReplay}', 'true'::jsonb, true), last_error=NULL WHERE id=$1 AND user_id=$2", [request.id, userId]);
    evidence.push({ id: Number(request.id), userId, targetHash: String(request.target_hash || ""), factIds: scope.factIds, itemIds: scope.itemIds, episodeIds, sourceRefs: scope.sourceRefs, targetTexts });
    replayed += 1;
  }
  return { count: replayed, evidence };
}

async function verifyReplay(client, replay) {
  const optionalTables = new Map();
  for (const tableName of ["memory_items", "memory_chunks", "session_memory", "mastra_messages", "mastra_resources", "mastra_observational_memory", "mastra_thread_state"]) optionalTables.set(tableName, await tableExists(client, tableName));
  for (const item of replay.evidence) {
    if (item.factIds) {
      const facts = await client.query("SELECT COUNT(*)::int AS count FROM memory_facts WHERE user_id=$1 AND id=ANY($2::bigint[])", [item.userId, item.factIds]);
      if (Number(facts.rows[0]?.count || 0) > 0) throw new Error(`restore erasure read-back found ${facts.rows[0].count} fact(s) for request ${item.id}`);
    }
    if (item.itemIds) {
      if (optionalTables.get("memory_items")) {
        const items = await client.query("SELECT COUNT(*)::int AS count FROM memory_items WHERE user_id=$1 AND id=ANY($2::bigint[])", [item.userId, item.itemIds]);
        if (Number(items.rows[0]?.count || 0) > 0) throw new Error(`restore erasure read-back found ${items.rows[0].count} legacy item(s) for request ${item.id}`);
      }
    }
    const suppression = await client.query("SELECT COUNT(*)::int AS count FROM memory_erasure_suppressions WHERE user_id=$1 AND request_id=$2 AND lifted_at IS NULL", [item.userId, item.id]);
    if (Number(suppression.rows[0]?.count || 0) === 0) throw new Error(`restore erasure read-back found no active suppression for request ${item.id}`);
    for (const textValue of item.targetTexts) {
      const checks = [
        await client.query("SELECT COUNT(*)::int AS count FROM memory_entities WHERE user_id=$1 AND summary LIKE '%' || $2 || '%'", [item.userId, textValue]),
        await client.query("SELECT COUNT(*)::int AS count FROM profile_blocks WHERE user_id=$1 AND value_json::text LIKE '%' || $2 || '%'", [item.userId, textValue]),
        await client.query("SELECT COUNT(*)::int AS count FROM memory_admission_candidates WHERE user_id=$1 AND canonical_text=$2", [item.userId, textValue]),
      ];
      if (await tableExists(client, "memory_episodes")) checks.push(await client.query("SELECT COUNT(*)::int AS count FROM memory_episodes WHERE user_id=$1 AND content_json::text LIKE '%' || $2 || '%'", [item.userId, textValue]));
      if (optionalTables.get("session_memory")) checks.push(await client.query("SELECT COUNT(*)::int AS count FROM session_memory WHERE user_id=$1 AND content LIKE '%' || $2 || '%'", [item.userId, textValue]));
      if (optionalTables.get("memory_chunks")) checks.push(await client.query("SELECT COUNT(*)::int AS count FROM memory_chunks WHERE user_id=$1 AND chunk_text LIKE '%' || $2 || '%'", [item.userId, textValue]));
      if (optionalTables.get("mastra_resources")) checks.push(await client.query("SELECT COUNT(*)::int AS count FROM mastra_resources WHERE id=$1 AND \"workingMemory\" LIKE '%' || $2 || '%'", [item.userId, textValue]));
      if (optionalTables.get("mastra_thread_state")) checks.push(await client.query("SELECT COUNT(*)::int AS count FROM mastra_thread_state WHERE \"threadId\" IN (SELECT id FROM mastra_threads WHERE \"resourceId\"=$1) AND value::text LIKE '%' || $2 || '%'", [item.userId, textValue]));
      if (optionalTables.get("mastra_observational_memory")) checks.push(await client.query("SELECT COUNT(*)::int AS count FROM mastra_observational_memory WHERE (\"resourceId\"=$1 OR \"threadId\" IN (SELECT id FROM mastra_threads WHERE \"resourceId\"=$1)) AND (\"activeObservations\" LIKE '%' || $2 || '%' OR COALESCE(\"activeObservationsPendingUpdate\",'') LIKE '%' || $2 || '%' OR COALESCE(\"bufferedObservations\",'') LIKE '%' || $2 || '%' OR COALESCE(\"bufferedReflection\",'') LIKE '%' || $2 || '%' OR COALESCE(\"bufferedObservationChunks\"::text,'') LIKE '%' || $2 || '%')", [item.userId, textValue]));
      if (checks.some((result) => Number(result.rows[0]?.count || 0) > 0)) throw new Error(`restore erasure read-back found derived memory for request ${item.id}`);
    }
  }
}

function writeRecoveryEvidence(filePath, backupPath, replay) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({
    format: "zhiyuan-postgres-restore-evidence-v1",
    verifiedAt: new Date().toISOString(),
    sourceBackup: backupPath,
    replayedErasures: replay.count,
    readBack: true,
  }, null, 2), "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.databaseUrl) throw new Error("DATABASE_URL is not configured.");
  const backup = readBackup(args.input);
  let tables = sortTablesForRestore(backup.tables);

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
    tables = await orderTablesByForeignKeys(client, tables);

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

    await setMemoryGates(client, "closed", "restore requires erasure replay");
    await client.query("BEGIN");
    let transactionOpen = true;
    try {
      if (args.allowOverwrite && tables.length > 0) {
        const tableSql = tables.filter((table) => table.name !== "memory_runtime_gates").map((table) => `"${table.name.replace(/"/g, '""')}"`).join(", ");
        if (tableSql) await client.query(`TRUNCATE ${tableSql} RESTART IDENTITY CASCADE`);
      }
      for (const table of tables) {
        const inserted = await restoreTable(client, table);
        console.log(`- ${table.name}: restored ${inserted}/${table.rows?.length || 0}`);
      }
      const factTable = tables.find((table) => table.name === "memory_facts");
      if (factTable) await restoreMemoryFactReferences(client, factTable);
      await resetSequences(client, tables);
      await client.query("COMMIT");
      transactionOpen = false;
      const replayed = await replayCompletedErasures(client);
      await verifyReplay(client, replayed);
      await setMemoryGates(client, "open", `restore complete; replayed ${replayed.count} completed erasure request(s)`);
      if (args.evidence) writeRecoveryEvidence(args.evidence, args.input, replayed);
      console.log("PostgreSQL restore complete.");
    } catch (error) {
      if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
      await setMemoryGates(client, "closed", `restore failed before erasure replay: ${error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)}`).catch(() => undefined);
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
