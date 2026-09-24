#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

const SENSITIVE = /(?:password|密码|api[\s_-]*key|密钥|secret|access[\s_-]*token|身份证|identity\s*card|salary\s*(?:floor|minimum)|薪资底线|work\s*(?:authorization|permit)|工作许可|medical|health\s*(?:condition|restriction)|健康限制)/i;
const MIGRATABLE_STATUSES = new Set(["active", "confirmed", "candidate"]);

function parseArgs(argv) {
  const args = { databaseUrl: process.env.DATABASE_URL || "", backup: "", apply: false, defaultOwner: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--database-url") args.databaseUrl = readValue(argv, ++index, arg);
    else if (arg === "--backup") args.backup = readValue(argv, ++index, arg);
    else if (arg === "--default-owner") args.defaultOwner = readValue(argv, ++index, arg);
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--help" || arg === "-h") { printHelp(); process.exit(0); }
    else throw new Error(`Unknown argument: ${arg}`);
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
  node scripts/migrate-memory-ledger.mjs --backup <backup.json> [options]

Options:
  --database-url <url>   PostgreSQL target. Defaults to DATABASE_URL.
  --backup <path>        Verified pre-migration backup evidence (required).
  --default-owner <id>   Owner used when a legacy row has no user id.
  --apply                Apply the migration. Without this flag, print a dry-run.
`);
}

function verifyBackup(file) {
  if (!file || !fs.existsSync(file)) throw new Error("A verified backup file is required before migration.");
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  if (backup.format !== "zhiyuan-postgres-json-backup-v1" || !backup.createdAt || !Array.isArray(backup.tables) || backup.tables.length === 0) {
    throw new Error("Backup evidence is not a supported PostgreSQL backup.");
  }
  const ageDays = (Date.now() - Date.parse(backup.createdAt)) / 86400000;
  if (!Number.isFinite(ageDays) || ageDays < -1 || ageDays > 30) throw new Error("Backup evidence is older than the 30-day migration target.");
  const retention = backup.retention || {};
  const retentionDays = Number(backup.retentionDays ?? backup.maxRetentionDays ?? retention.maxDays ?? retention.maxRetentionDays);
  const retentionVerified = backup.retentionVerified === true
    || backup.retentionPolicyVerified === true
    || retention.retentionVerified === true
    || retention.verified === true;
  if (!Number.isFinite(retentionDays) || retentionDays > 30 || !retentionVerified) {
    throw new Error("Backup evidence must explicitly verify a maximum 30-day retention policy.");
  }
  return { path: file, createdAt: backup.createdAt };
}

function stableId(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function asText(value) { return value == null ? "" : String(value).trim(); }

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return {}; }
}

function sourceKind(row) {
  const type = asText(row.source_type).toLowerCase();
  const method = asText(row.extraction_method).toLowerCase();
  const evidence = parseMetadata(row.metadata_json);
  const verified = evidence.verifiedReadBack === true || evidence.verified_read_back === true || method.includes("verified");
  const explicit = type.includes("user") || type.includes("explicit") || type.includes("preference");
  if (String(row.status).toLowerCase() === "candidate") return "candidate";
  if (verified || explicit) return "active";
  if (type && type !== "unknown" && type !== "legacy") return "candidate";
  return "skip";
}

function memoryHash(value) {
  return stableId(asText(value));
}

function legacySubject(item) { return `legacy_memory:${item.id}`; }

function isSuppressed(item, suppressions) {
  const textHash = memoryHash(item.text);
  const targetKey = memoryHash(JSON.stringify([legacySubject(item).toLowerCase(), "canonical_text"]));
  return suppressions.some((row) => String(row.user_id) === item.userId && !row.lifted_at && (String(row.target_hash) === textHash || (String(row.target_key) === targetKey && String(row.source_type) === item.sourceType && String(row.source_id) === item.sourceId)));
}

async function setMemoryGates(client, state, reason) {
  await client.query(`
    INSERT INTO memory_runtime_gates (gate_name, state, reason)
    VALUES ('read',$1,$2), ('write',$1,$2), ('extract',$1,$2)
    ON CONFLICT (gate_name) DO UPDATE SET state=EXCLUDED.state, reason=EXCLUDED.reason, updated_at=now()
  `, [state, reason]);
}

async function verifyMigration(client, plan) {
  for (const item of plan.active) {
    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM memory_facts
       WHERE user_id=$1 AND partition='private' AND subject=$2 AND predicate='canonical_text' AND canonical_text=$3 AND invalid_at IS NULL`,
      [item.userId, legacySubject(item), item.text],
    );
    if (Number(result.rows[0]?.count || 0) !== 1) throw new Error(`Migration read-back failed for active legacy item ${item.id}`);
  }
  for (const item of plan.candidates) {
    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM memory_admission_candidates
       WHERE user_id=$1 AND kind='conversation' AND partition='private' AND subject=$2 AND predicate='canonical_text' AND canonical_text=$3 AND status='pending'`,
      [item.userId, legacySubject(item), item.text],
    );
    if (Number(result.rows[0]?.count || 0) !== 1) throw new Error(`Migration read-back failed for candidate legacy item ${item.id}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.databaseUrl) throw new Error("DATABASE_URL is not configured.");
  const backup = verifyBackup(args.backup);
  const pool = new pg.Pool({ connectionString: args.databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    const rows = await client.query(`
      SELECT i.id, i.user_id, i.memory_type, i.canonical_text, i.status,
             i.confidence, i.importance, i.metadata_json,
             e.source_type, e.source_id, e.quote, e.extraction_method, e.confidence AS evidence_confidence
      FROM memory_items i
      LEFT JOIN LATERAL (
        SELECT source_type, source_id, quote, extraction_method, confidence, metadata_json
        FROM memory_evidence
        WHERE memory_item_id = i.id
        ORDER BY confidence DESC, created_at DESC
        LIMIT 1
      ) e ON TRUE
      WHERE i.status = ANY($1::text[])
      ORDER BY i.id
    `, [[...MIGRATABLE_STATUSES]]);
    const suppressionRows = (await client.query("SELECT user_id, target_hash, target_key, source_type, source_id, lifted_at FROM memory_erasure_suppressions WHERE lifted_at IS NULL")).rows;
    const plan = { active: [], candidates: [], skipped: [] };
    for (const row of rows.rows) {
      const owner = asText(row.user_id) || args.defaultOwner;
      const text = asText(row.canonical_text);
      if (!owner || !text || SENSITIVE.test(text) || SENSITIVE.test(asText(row.quote))) { plan.skipped.push({ id: Number(row.id), reason: "missing_owner_or_sensitive" }); continue; }
      const kind = sourceKind(row);
      const item = { id: Number(row.id), userId: owner, text, sourceType: asText(row.source_type) || "legacy_memory_item", sourceId: asText(row.source_id) || `legacy:${row.id}`, confidence: Number(row.confidence || row.evidence_confidence || 0.5), importance: Number(row.importance || 0.5), quote: asText(row.quote), status: String(row.status) };
      if (isSuppressed(item, suppressionRows)) { plan.skipped.push({ id: Number(row.id), reason: "active_erasure_suppression" }); continue; }
      if (kind === "skip") { plan.skipped.push({ id: Number(row.id), reason: "unknown_provenance" }); continue; }
      plan[kind].push(item);
    }
    console.log(JSON.stringify({ backup, dryRun: !args.apply, counts: { active: plan.active.length, candidates: plan.candidates.length, skipped: plan.skipped.length }, skipped: plan.skipped }, null, 2));
    if (!args.apply) return;

    await setMemoryGates(client, "closed", "memory ledger migration");
    await client.query("BEGIN");
    let transactionOpen = true;
    try {
      for (const item of plan.active) await migrateActive(client, item);
      for (const item of plan.candidates) await migrateCandidate(client, item);
      await client.query("COMMIT");
      transactionOpen = false;
      await verifyMigration(client, plan);
      await setMemoryGates(client, "open", "memory ledger migration completed");
      console.log(`Migrated ${plan.active.length} active fact(s) and ${plan.candidates.length} candidate(s).`);
    } catch (error) {
      if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
      await setMemoryGates(client, "closed", `memory ledger migration failed: ${error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)}`).catch(() => undefined);
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

async function ensureEpisode(client, item) {
  const key = stableId(`legacy:${item.id}:${item.sourceType}:${item.sourceId}`);
  const result = await client.query(`
    INSERT INTO memory_episodes (user_id, source_type, source_id, content_json, idempotency_key)
    VALUES ($1,$2,$3,$4::jsonb,$5)
    ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO UPDATE SET content_json=memory_episodes.content_json
    RETURNING id
  `, [item.userId, item.sourceType, item.sourceId, JSON.stringify({ legacyItemId: item.id, quote: item.quote, canonicalText: item.text }), key]);
  return Number(result.rows[0].id);
}

async function migrateActive(client, item) {
  const episodeId = await ensureEpisode(client, item);
  const decisionKey = stableId(`memory-migration:${item.id}:active`);
  const decision = await client.query(`
    INSERT INTO memory_fact_decisions (user_id, idempotency_key, source_episode_id, partition, agent_id, decision, decision_reason)
    VALUES ($1,$2,$3,'private','profile','ADD','legacy confirmed or verified memory')
    ON CONFLICT (user_id, idempotency_key) DO NOTHING
    RETURNING id
  `, [item.userId, decisionKey, episodeId]);
  const decisionId = Number(decision.rows[0]?.id || (await client.query("SELECT id FROM memory_fact_decisions WHERE user_id=$1 AND idempotency_key=$2", [item.userId, decisionKey])).rows[0].id);
  const fact = await client.query(`
    INSERT INTO memory_facts (user_id, partition, subject, predicate, object_json, canonical_text, confidence, importance, source_episode_id, decision, decision_reason, decision_id)
    VALUES ($1,'private',$7,'canonical_text',$2::jsonb,$3,$4,$5,$6,'ADD','legacy confirmed or verified memory',$8)
    ON CONFLICT (user_id, partition, subject, predicate) WHERE invalid_at IS NULL
    DO UPDATE SET canonical_text=EXCLUDED.canonical_text, confidence=GREATEST(memory_facts.confidence, EXCLUDED.confidence), importance=GREATEST(memory_facts.importance, EXCLUDED.importance)
    RETURNING id
  `, [item.userId, JSON.stringify({ legacyItemId: item.id }), item.text, Math.max(0, Math.min(1, item.confidence)), Math.max(0, Math.min(1, item.importance)), episodeId, legacySubject(item), decisionId]);
  await client.query(`
    INSERT INTO memory_fact_chunks (fact_id, user_id, chunk_index, content, embedding_status)
    VALUES ($1, $2, 0, $3, 'pending')
    ON CONFLICT (fact_id, chunk_index) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        content = EXCLUDED.content,
        embedding_status = CASE WHEN memory_fact_chunks.content = EXCLUDED.content
          THEN memory_fact_chunks.embedding_status ELSE 'pending' END
  `, [fact.rows[0]?.id, item.userId, item.text]);
  await client.query("UPDATE memory_fact_decisions SET result_fact_id=$1 WHERE id=$2", [fact.rows[0]?.id, decisionId]);
}

async function migrateCandidate(client, item) {
  await client.query(`
    INSERT INTO memory_admission_candidates (user_id, kind, partition, subject, predicate, object_json, canonical_text, confidence, importance, source_type, source_id, evidence_json, sensitivity, status, expires_at)
    VALUES ($1,'conversation','private',$9,'canonical_text',$2::jsonb,$3,$4,$5,$6,$7,$8::jsonb,'none','pending',now()+interval '30 days')
    ON CONFLICT (user_id, kind, source_type, source_id, canonical_text) DO NOTHING
  `, [item.userId, JSON.stringify({ legacyItemId: item.id }), item.text, Math.max(0, Math.min(1, item.confidence)), Math.max(0, Math.min(1, item.importance)), item.sourceType, item.sourceId, JSON.stringify({ quote: item.quote, migratedFrom: item.id }), legacySubject(item)]);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
