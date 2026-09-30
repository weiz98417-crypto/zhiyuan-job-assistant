#!/usr/bin/env node

/**
 * Read-only production evidence collector for the browser journey gate.
 *
 * This command never inserts, updates, deletes, or calls an application API.
 * It opens a PostgreSQL transaction in READ ONLY mode and writes a redacted
 * JSON snapshot that can be attached to a production E2E report. Run it once
 * before the browser journey and once after QA cleanup; compare the two
 * snapshots to document both the evidence and cleanup result.
 *
 * Required environment:
 *   DATABASE_URL (or --database-url)
 * Scope:
 *   --username <app username> OR --user-id <user id>
 * Optional filters:
 *   --session-id <id> --run-id <id> --scan-id <id> --jd-id <id>
 *   --report-num <number> --document-id <id> --artifact-id <id>
 *   --marker <text> (limits the cleanup candidate search to QA markers)
 *   --phase baseline|after-cleanup (labels the snapshot for the report)
 *   --compare-to <baseline.json> (read a prior snapshot and report count deltas)
 * Output:
 *   --output <path> (defaults to stdout)
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import { loadConversationProjector, replayItemEvidence } from "./production-item-replay.mjs";

const { Pool } = pg;

const argv = process.argv.slice(2);
const args = parseArgs(argv);
const databaseUrl = String(args.databaseUrl || process.env.DATABASE_URL || "").trim();
if (!databaseUrl) fail("DATABASE_URL is required (do not print it in a report)");

const marker = String(args.marker || "").trim();
const phase = String(args.phase || "baseline").trim().toLowerCase();
if (!new Set(["baseline", "after-cleanup"]).has(phase)) fail("--phase must be baseline or after-cleanup");
if (args.replayItems && !args.runId && !args.sessionId) fail("--replay-items requires --run-id or --session-id");
const projector = args.replayItems
  ? await loadConversationProjector(args.projectionRoot || process.cwd())
  : null;
const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 15_000 });
const client = await pool.connect();

function iso(value) {
  return value instanceof Date ? value.toISOString() : value == null ? null : String(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? "")).digest("hex");
}

function privateText(value) {
  const text = String(value ?? "");
  return { length: text.length, sha256: sha256(text) };
}

function privateUrl(value) {
  const text = String(value ?? "").trim();
  return text ? { present: true, ...privateText(text) } : { present: false };
}

function systemToken(value, max = 80) {
  return safeText(value, max).replace(/[^a-zA-Z0-9_.:-]/g, "");
}

function asInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function json(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, max = 100) {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function messageCount(value) {
  return list(json(value, [])).length;
}

function extractArtifacts(value, output = [], seen = new Set()) {
  if (value == null || output.length >= 200) return output;
  if (Array.isArray(value)) {
    for (const item of value) extractArtifacts(item, output, seen);
    return output;
  }
  if (typeof value !== "object") return output;
  const object = value;
  const artifactId = object.artifactId ?? object.artifact_id
    ?? ((typeof object.kind === "string" && object.kind !== "task") ? object.id : undefined);
  const kind = object.kind ?? object.artifact_kind;
  const version = object.version ?? object.artifact_version;
  const hash = object.hash ?? object.contentHash ?? object.content_hash;
  // Only classify an id as an artifact when it carries artifact-shaped
  // metadata. Ordinary run/event IDs must not appear as artifacts.
  if (artifactId && kind && (version || hash) && typeof artifactId !== "object") {
    const record = {
      id: safeText(artifactId, 160),
      ...(kind ? { kind: safeText(kind, 80) } : {}),
      ...(version ? { version: safeText(version, 80) } : {}),
      ...(hash ? { hash: safeText(hash, 160) } : {}),
    };
    const key = JSON.stringify(record);
    if (!seen.has(key)) { seen.add(key); output.push(record); }
  }
  for (const child of Object.values(object)) extractArtifacts(child, output, seen);
  return output;
}

async function tableExists(client, table) {
  const result = await client.query("SELECT to_regclass($1) IS NOT NULL AS present", [`public.${table}`]);
  return result.rows[0]?.present === true;
}

async function selectRows(client, table, sql, params = []) {
  if (!(await tableExists(client, table))) return { present: false, rows: [] };
  // A failed query aborts the PostgreSQL transaction. Propagate it so the
  // snapshot is marked failed instead of silently presenting empty evidence.
  return { present: true, rows: (await client.query(sql, params)).rows };
}

const report = {
  ok: true,
  format: "zhiyuan-production-evidence-v1",
  readOnly: true,
  generatedAt: new Date().toISOString(),
  database: { driver: "postgres", configured: Boolean(databaseUrl) },
  scope: {},
  filters: {
    sessionId: args.sessionId || null,
    runId: args.runId || null,
    scanId: args.scanId || null,
    jdId: args.jdId || null,
    reportNum: args.reportNum || null,
    documentId: args.documentId || null,
    artifactId: args.artifactId || null,
    // Marker text can contain a person's name or another QA secret. Keep only
    // a stable fingerprint so evidence can be compared without exporting it.
    marker: marker ? { present: true, sha256: sha256(marker) } : null,
    replayItems: args.replayItems === true,
  },
  snapshots: {},
  checks: {},
  cleanup: {
    performed: false,
    mutationCount: 0,
    note: "This collector is read-only. Perform QA cleanup through the approved application/admin flow, then rerun this command.",
    phase,
  },
  warnings: [],
};

try {
  await client.query("BEGIN");
  await client.query("SET TRANSACTION READ ONLY");

  let userId = String(args.userId || "").trim();
  let username = String(args.username || "").trim();
  if (!userId && username) {
    const userResult = await client.query(
      "SELECT id, username, status, role, created_at, last_login_at FROM users WHERE username = $1",
      [username],
    );
    const user = userResult.rows[0];
    if (!user) fail("application user not found");
    userId = String(user.id);
  }
  if (!userId) fail("scope is required: pass --user-id or --username");

  const userResult = await client.query(
    "SELECT id, username, status, role, created_at, last_login_at FROM users WHERE id = $1",
    [userId],
  );
  const user = userResult.rows[0];
  if (!user) fail("application user not found");
  username = String(user.username || username);
  report.scope = {
    // Keep ownership comparisons possible without exporting the database
    // user identifier into an evidence artifact.
    ownerIdSha256: sha256(userId),
    username: privateText(username),
    status: systemToken(user.status, 40),
    role: systemToken(user.role, 40),
    createdAt: iso(user.created_at),
    lastLoginAt: iso(user.last_login_at),
  };

  const sessionParams = [userId];
  let sessionWhere = "user_id = $1";
  if (args.sessionId) { sessionParams.push(args.sessionId); sessionWhere += ` AND id = $${sessionParams.length}`; }
  const sessions = await selectRows(client, "sessions", `
    SELECT id, title, messages_json, memory_digest, agent_state_json, pinned, deleted_at, created_at, updated_at
    FROM sessions WHERE ${sessionWhere} ORDER BY updated_at DESC LIMIT 100
  `, sessionParams);
  report.snapshots.sessions = sessions.rows.map((row) => ({
    id: String(row.id), title: privateText(row.title), pinned: row.pinned === true,
    deletedAt: iso(row.deleted_at), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    messageCount: messageCount(row.messages_json),
    messageDigest: sha256(JSON.stringify(row.messages_json || [])),
    agentStateKeys: Object.keys(json(row.agent_state_json)).slice(0, 50),
  }));

  const sessionIds = report.snapshots.sessions.map((row) => row.id);
  const sessionMemory = await selectRows(client, "session_memory", `
    SELECT id, session_id, summary_type, content, created_at
    FROM session_memory WHERE user_id = $1 ${args.sessionId ? "AND session_id = $2" : ""}
    ORDER BY created_at DESC LIMIT 200
  `, args.sessionId ? [userId, args.sessionId] : [userId]);
  report.snapshots.sessionMemory = sessionMemory.rows.map((row) => {
    const messages = list(json(row.content, []));
    return {
      id: String(row.id), sessionId: String(row.session_id), summaryType: systemToken(row.summary_type, 80),
      messageCount: messages.length,
      roles: messages.map((message) => safeText(message?.role, 24)),
      contentLength: String(row.content || "").length,
      digest: sha256(row.content || ""),
      createdAt: iso(row.created_at),
    };
  });

  const runParams = [userId];
  let runWhere = "user_id = $1";
  if (args.runId) { runParams.push(args.runId); runWhere += ` AND id = $${runParams.length}`; }
  if (args.sessionId) { runParams.push(args.sessionId); runWhere += ` AND session_id = $${runParams.length}`; }
  const runs = await selectRows(client, "agent_runs", `
    SELECT id, session_id, task_type, agent_id, status, runtime_mode, execution_owner, request_id,
           parent_run_id, depth, legacy, created_at, updated_at, completed_at, result_json, contract_json, error_json
    FROM agent_runs WHERE ${runWhere} ORDER BY created_at ASC LIMIT 300
  `, runParams);
  report.snapshots.runs = runs.rows.map((row) => ({
    id: String(row.id), sessionId: row.session_id == null ? null : String(row.session_id),
    taskType: systemToken(row.task_type, 80), agentId: systemToken(row.agent_id, 80), status: systemToken(row.status, 40),
    runtimeMode: systemToken(row.runtime_mode, 40), executionOwner: systemToken(row.execution_owner, 80),
    requestId: privateText(row.request_id), parentRunId: row.parent_run_id ? String(row.parent_run_id) : null,
    depth: asInt(row.depth), legacy: row.legacy === true, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), completedAt: iso(row.completed_at),
    artifacts: extractArtifacts([row.result_json, json(row.contract_json)?.journey?.artifacts]),
    resultDigest: sha256(JSON.stringify(row.result_json || {})),
    errorKeys: Object.keys(json(row.error_json)).slice(0, 30),
  }));

  const runIds = runs.rows.map((row) => String(row.id));
  if (projector) {
    if (runs.rows.length > 30) throw new Error("item replay is limited to 30 scoped Runs; specify --run-id or a narrower --session-id");
    const projections = [];
    for (const row of runs.rows) {
      const eventRows = await client.query(`
        SELECT sequence, event_type, schema_version, payload_json, created_at
        FROM agent_run_events WHERE user_id = $1 AND run_id = $2 ORDER BY sequence ASC
      `, [userId, row.id]);
      const checkpointRows = await client.query(`
        SELECT context_json FROM agent_run_checkpoints
        WHERE user_id = $1 AND run_id = $2 ORDER BY snapshot_version DESC, id DESC LIMIT 1
      `, [userId, row.id]);
      const eventsForReplay = eventRows.rows.map((event) => ({
        runId: String(row.id),
        userId,
        sequence: Number(event.sequence),
        type: String(event.event_type),
        schemaVersion: Number(event.schema_version),
        payload: json(event.payload_json),
        createdAt: iso(event.created_at),
      }));
      projections.push(replayItemEvidence({
        projectConversationItems: projector.projectConversationItems,
        runId: String(row.id),
        conversationId: row.session_id == null ? null : Number(row.session_id),
        ownerId: userId,
        events: eventsForReplay,
        checkpointContext: checkpointRows.rows[0] ? json(checkpointRows.rows[0].context_json) : undefined,
      }));
    }
    report.snapshots.conversationItemReplay = {
      source: "db_events_checkpoint_local_source_replay",
      projectionSourceSha256: projector.sourceSha256,
      apiVerified: false,
      runs: projections,
    };
    if (projections.some((entry) => !entry.replayStable)) throw new Error("conversation item replay is not deterministic");
  }
  const eventParams = [userId];
  let eventWhere = "user_id = $1";
  if (args.runId) { eventParams.push(args.runId); eventWhere += ` AND run_id = $${eventParams.length}`; }
  else if (args.sessionId) { eventParams.push(args.sessionId); eventWhere += ` AND run_id IN (SELECT id FROM agent_runs WHERE user_id = $1 AND session_id = $${eventParams.length})`; }
  const events = await selectRows(client, "agent_run_events", `
    SELECT run_id, COUNT(*)::int AS count, MAX(sequence)::bigint AS max_sequence,
           ARRAY_AGG(DISTINCT event_type ORDER BY event_type) AS event_types,
           md5(string_agg(md5(payload_json::text), ',' ORDER BY sequence)) AS payload_digest,
           MAX(created_at) AS latest_at
    FROM agent_run_events WHERE ${eventWhere} GROUP BY run_id ORDER BY latest_at DESC LIMIT 300
  `, eventParams);
  report.snapshots.events = events.rows.map((row) => ({ runId: String(row.run_id), count: asInt(row.count), maxSequence: String(row.max_sequence ?? "0"), eventTypes: list(row.event_types).map((item) => safeText(item, 100)), payloadDigest: safeText(row.payload_digest, 80), latestAt: iso(row.latest_at) }));
  const eventArtifacts = await selectRows(client, "agent_run_events", `
    SELECT run_id, payload_json FROM agent_run_events
    WHERE ${eventWhere} AND payload_json::text ILIKE '%artifact%'
    ORDER BY created_at DESC LIMIT 1000
  `, eventParams);
  report.snapshots.eventArtifacts = eventArtifacts.rows.flatMap((row) =>
    extractArtifacts(json(row.payload_json)).map((artifact) => ({ runId: String(row.run_id), ...artifact })),
  );

  const gateParams = [userId];
  let gateWhere = "user_id = $1";
  if (args.runId) { gateParams.push(args.runId); gateWhere += ` AND run_id = $${gateParams.length}`; }
  else if (args.sessionId) { gateParams.push(args.sessionId); gateWhere += ` AND run_id IN (SELECT id FROM agent_runs WHERE user_id = $1 AND session_id = $${gateParams.length})`; }
  const gates = await selectRows(client, "agent_run_gates", `
    SELECT run_id, id, tool_name, gate_type, risk, status, scope_hash, created_at, resolved_at
    FROM agent_run_gates WHERE ${gateWhere} ORDER BY created_at ASC LIMIT 300
  `, gateParams);
  report.snapshots.gates = gates.rows.map((row) => ({ runId: String(row.run_id), id: String(row.id), toolName: systemToken(row.tool_name, 100), gateType: systemToken(row.gate_type, 60), risk: systemToken(row.risk, 40), status: systemToken(row.status, 40), scopeHash: safeText(row.scope_hash, 160), createdAt: iso(row.created_at), resolvedAt: iso(row.resolved_at) }));

  const checkpointParams = [userId];
  let checkpointWhere = "user_id = $1";
  if (args.runId) { checkpointParams.push(args.runId); checkpointWhere += ` AND run_id = $${checkpointParams.length}`; }
  else if (args.sessionId) { checkpointParams.push(args.sessionId); checkpointWhere += ` AND run_id IN (SELECT id FROM agent_runs WHERE user_id = $1 AND session_id = $${checkpointParams.length})`; }
  const checkpoints = await selectRows(client, "agent_run_checkpoints", `
    SELECT run_id, COUNT(*)::int AS count, MAX(snapshot_version)::bigint AS max_snapshot_version,
           ARRAY_AGG(DISTINCT boundary ORDER BY boundary) AS boundaries, MAX(created_at) AS latest_at
    FROM agent_run_checkpoints WHERE ${checkpointWhere}
    GROUP BY run_id ORDER BY latest_at DESC LIMIT 300
  `, checkpointParams);
  report.snapshots.checkpoints = checkpoints.rows.map((row) => ({ runId: String(row.run_id), count: asInt(row.count), maxSnapshotVersion: String(row.max_snapshot_version ?? "0"), boundaries: list(row.boundaries).map((item) => safeText(item, 80)), latestAt: iso(row.latest_at) }));

  const reviewParams = [userId];
  let reviewWhere = "user_id = $1";
  if (args.runId) { reviewParams.push(args.runId); reviewWhere += ` AND run_id = $${reviewParams.length}`; }
  if (args.sessionId) { reviewParams.push(args.sessionId); reviewWhere += ` AND run_id IN (SELECT id FROM agent_runs WHERE user_id = $1 AND session_id = $${reviewParams.length})`; }
  const reviews = await selectRows(client, "agent_run_reviews", `
    SELECT run_id, task_type, verdict, score, primary_failure_type, reviewer_version, reviewed_at
    FROM agent_run_reviews WHERE ${reviewWhere}
    ORDER BY reviewed_at DESC LIMIT 300
  `, reviewParams);
  report.snapshots.reviews = reviews.rows.map((row) => ({ runId: String(row.run_id), taskType: systemToken(row.task_type, 80), verdict: systemToken(row.verdict, 40), score: row.score == null ? null : Number(row.score), failureType: systemToken(row.primary_failure_type, 100), reviewerVersion: systemToken(row.reviewer_version, 80), reviewedAt: iso(row.reviewed_at) }));

  const candidateParams = [userId];
  let candidateRunWhere = "user_id = $1";
  if (args.runId) { candidateParams.push(args.runId); candidateRunWhere += ` AND id = $${candidateParams.length}`; }
  if (args.sessionId) { candidateParams.push(args.sessionId); candidateRunWhere += ` AND session_id = $${candidateParams.length}`; }
  const candidates = await selectRows(client, "agent_eval_candidates", `
    SELECT run_id, task_type, failure_type, status, dedupe_key, created_at, updated_at
    FROM agent_eval_candidates WHERE run_id IN (SELECT id FROM agent_runs WHERE ${candidateRunWhere})
    ORDER BY updated_at DESC LIMIT 300
  `, candidateParams);
  report.snapshots.evalCandidates = candidates.rows.map((row) => ({ runId: row.run_id ? String(row.run_id) : null, taskType: systemToken(row.task_type, 80), failureType: systemToken(row.failure_type, 100), status: systemToken(row.status, 40), dedupeKey: privateText(row.dedupe_key), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }));

  const attemptParams = [userId];
  let attemptWhere = "user_id = $1";
  if (args.runId) { attemptParams.push(args.runId); attemptWhere += ` AND run_id = $${attemptParams.length}`; }
  else if (args.sessionId) { attemptParams.push(args.sessionId); attemptWhere += ` AND run_id IN (SELECT id FROM agent_runs WHERE user_id = $1 AND session_id = $${attemptParams.length})`; }
  const attempts = await selectRows(client, "agent_tool_attempts", `
    SELECT run_id, id, attempt_sequence, tool_name, status, effect_state, args_hash, created_at, completed_at
    FROM agent_tool_attempts WHERE ${attemptWhere} ORDER BY created_at ASC LIMIT 500
  `, attemptParams);
  report.snapshots.toolAttempts = attempts.rows.map((row) => ({ runId: String(row.run_id), id: String(row.id), sequence: asInt(row.attempt_sequence), toolName: safeText(row.tool_name, 100), status: safeText(row.status, 40), effectState: safeText(row.effect_state, 40), argsHash: safeText(row.args_hash, 160), createdAt: iso(row.created_at), completedAt: iso(row.completed_at) }));

  const scanParams = [userId];
  let scanWhere = "user_id = $1";
  if (args.scanId) { scanParams.push(args.scanId); scanWhere += ` AND id = $${scanParams.length}`; }
  const scans = await selectRows(client, "scan_queue", `
    SELECT id, status, title_positive_json, title_negative_json, location_filter, max_results, error_log,
           companies_total, companies_done, jobs_found, jobs_new, created_at, updated_at
    FROM scan_queue WHERE ${scanWhere} ORDER BY created_at DESC LIMIT 100
  `, scanParams);
  report.snapshots.scans = scans.rows.map((row) => ({ id: String(row.id), status: systemToken(row.status, 40), positiveTitles: list(json(row.title_positive_json, [])).length, negativeTitles: list(json(row.title_negative_json, [])).length, locationFilter: privateText(row.location_filter), maxResults: asInt(row.max_results), companiesTotal: asInt(row.companies_total), companiesDone: asInt(row.companies_done), jobsFound: asInt(row.jobs_found), jobsNew: asInt(row.jobs_new), errorCount: list(json(row.error_log, [])).length, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }));
  const jobs = await selectRows(client, "scan_jobs", `
    SELECT scan_id, COUNT(*)::int AS count, COUNT(*) FILTER (WHERE status = 'new')::int AS new_count,
           COUNT(*) FILTER (WHERE jd_id IS NOT NULL)::int AS with_jd_count,
           ARRAY_AGG(DISTINCT status ORDER BY status) AS statuses
    FROM scan_jobs WHERE user_id = $1 ${args.scanId ? "AND scan_id = $2" : ""}
    GROUP BY scan_id ORDER BY scan_id LIMIT 100
  `, args.scanId ? [userId, args.scanId] : [userId]);
  report.snapshots.scanJobs = jobs.rows.map((row) => ({ scanId: String(row.scan_id), count: asInt(row.count), newCount: asInt(row.new_count), withJdCount: asInt(row.with_jd_count), statuses: list(row.statuses).map((item) => safeText(item, 40)) }));
  const sourceRuns = await selectRows(client, "scan_source_runs", `
    SELECT scan_id, source_name, status, attempted, parsed, matched, inserted, deduped, blocked_reason, error, started_at, finished_at
    FROM scan_source_runs WHERE user_id = $1 ${args.scanId ? "AND scan_id = $2" : ""} ORDER BY started_at ASC LIMIT 300
  `, args.scanId ? [userId, args.scanId] : [userId]);
  report.snapshots.scanSourceRuns = sourceRuns.rows.map((row) => ({ scanId: String(row.scan_id), sourceName: systemToken(row.source_name, 100), status: systemToken(row.status, 40), attempted: asInt(row.attempted), parsed: asInt(row.parsed), matched: asInt(row.matched), inserted: asInt(row.inserted), deduped: asInt(row.deduped), blockedReason: privateText(row.blocked_reason), error: privateText(row.error), startedAt: iso(row.started_at), finishedAt: iso(row.finished_at) }));

  const jdParams = [userId];
  let jdWhere = "user_id = $1";
  if (args.jdId) { jdParams.push(args.jdId); jdWhere += ` AND id = $${jdParams.length}`; }
  const jds = await selectRows(client, "jds", `SELECT id, company, role, source_type, source_url, body, keywords_json, report_id, created_at FROM jds WHERE ${jdWhere} ORDER BY created_at DESC LIMIT 100`, jdParams);
  report.snapshots.jds = jds.rows.map((row) => ({ id: String(row.id), company: privateText(row.company), role: privateText(row.role), sourceType: systemToken(row.source_type, 60), sourceUrl: privateUrl(row.source_url), bodyLength: String(row.body || "").length, bodyHash: sha256(row.body || ""), keywordCount: list(json(row.keywords_json, [])).length, reportId: row.report_id == null ? null : String(row.report_id), createdAt: iso(row.created_at) }));

  const reportParams = [userId];
  let reportWhere = "user_id = $1";
  if (args.reportNum) { reportParams.push(args.reportNum); reportWhere += ` AND report_num = $${reportParams.length}`; }
  const reports = await selectRows(client, "reports", `SELECT report_num, date, company, role, archetype, overall_score, legitimacy, blocks_json, keywords_json, source_hash, created_at FROM reports WHERE ${reportWhere} ORDER BY report_num DESC LIMIT 100`, reportParams);
  report.snapshots.reports = reports.rows.map((row) => ({ reportNum: asInt(row.report_num), date: privateText(row.date), company: privateText(row.company), role: privateText(row.role), archetype: systemToken(row.archetype, 120), overallScore: Number(row.overall_score || 0), legitimacy: systemToken(row.legitimacy, 80), blockCount: Object.keys(json(row.blocks_json)).length, keywordCount: list(json(row.keywords_json, [])).length, sourceHash: safeText(row.source_hash, 160), createdAt: iso(row.created_at) }));

  const documentParams = [userId];
  let documentWhere = "user_id = $1";
  if (args.documentId) { documentParams.push(args.documentId); documentWhere += ` AND id = $${documentParams.length}`; }
  const documents = await selectRows(client, "resume_documents", `SELECT id, version_id, label, status, source_type, source_artifact_id, content_hash, sections_json, integrity_json, created_at, activated_at, updated_at FROM resume_documents WHERE ${documentWhere} ORDER BY created_at DESC LIMIT 100`, documentParams);
  report.snapshots.resumeDocuments = documents.rows.map((row) => ({ id: String(row.id), versionId: systemToken(row.version_id, 100), label: privateText(row.label), status: systemToken(row.status, 40), sourceType: systemToken(row.source_type, 60), sourceArtifactId: privateText(row.source_artifact_id), contentHash: safeText(row.content_hash, 160), sectionTypes: list(json(row.sections_json, [])).map((section) => typeof section === "object" ? systemToken(section?.type ?? section?.sectionType ?? "", 80) : "").filter(Boolean), integrityKeys: Object.keys(json(row.integrity_json)).slice(0, 50), createdAt: iso(row.created_at), activatedAt: iso(row.activated_at), updatedAt: iso(row.updated_at) }));
  const drafts = await selectRows(client, "resume_drafts", `SELECT id, document_id, artifact_id, variant_id, title, status, base_version, base_hash, patches_json, content_json, integrity_json, created_at, updated_at FROM resume_drafts WHERE user_id = $1 ${args.artifactId ? "AND artifact_id = $2" : ""} ORDER BY created_at DESC LIMIT 200`, args.artifactId ? [userId, args.artifactId] : [userId]);
  report.snapshots.resumeDrafts = drafts.rows.map((row) => ({ id: String(row.id), documentId: row.document_id ? String(row.document_id) : null, artifactId: privateText(row.artifact_id), variantId: privateText(row.variant_id), title: privateText(row.title), status: systemToken(row.status, 40), baseVersion: systemToken(row.base_version, 100), baseHash: safeText(row.base_hash, 160), patchCount: list(json(row.patches_json, [])).length, integrityKeys: Object.keys(json(row.integrity_json)).slice(0, 50), contentDigest: sha256(JSON.stringify(row.content_json || {})), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }));

  const legacyCv = await selectRows(client, "cv_data", "SELECT data_json, updated_at FROM cv_data WHERE user_id = $1 LIMIT 1", [userId]);
  report.snapshots.legacyCv = legacyCv.rows.map((row) => {
    const data = json(row.data_json);
    const versions = data.versions && typeof data.versions === "object" && !Array.isArray(data.versions) ? data.versions : {};
    return {
      present: true,
      updatedAt: iso(row.updated_at),
      activeVersion: safeText(data.activeVersion, 100),
      versionIds: Object.keys(versions).slice(0, 100),
      versionCount: Object.keys(versions).length,
      dataKeys: Object.keys(data).slice(0, 80),
      dataDigest: sha256(JSON.stringify(data)),
    };
  });
  const proposals = await selectRows(client, "resume_edit_proposals", `
    SELECT id, section_id, base_version, base_hash, proposed_hash, status, created_at, updated_at
    FROM resume_edit_proposals WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 300
  `, [userId]);
  report.snapshots.resumeProposals = proposals.rows.map((row) => ({ id: String(row.id), sectionId: privateText(row.section_id), baseVersion: systemToken(row.base_version, 100), baseHash: safeText(row.base_hash, 160), proposedHash: safeText(row.proposed_hash, 160), status: systemToken(row.status, 40), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }));

  const artifactRecords = [
    ...report.snapshots.runs.flatMap((row) => row.artifacts || []),
    ...report.snapshots.eventArtifacts,
    ...report.snapshots.resumeDrafts.map((row) => ({ id: row.artifactId, kind: "resume_draft", version: row.variantId, hash: row.baseHash })),
    ...report.snapshots.resumeDocuments.map((row) => ({ id: row.sourceArtifactId, kind: "resume_source", version: row.versionId, hash: row.contentHash })),
  ].filter((row) => row.id);
  const artifactMap = new Map();
  for (const item of artifactRecords) artifactMap.set(JSON.stringify(item), item);
  report.snapshots.artifacts = [...artifactMap.values()];

  if (marker) {
    const markerHash = sha256(marker);
    report.cleanup.markerSha256 = markerHash;
    // Search the server-side JSON/text fields by parameterized ILIKE. The
    // values themselves are never returned, only owner-scoped record IDs.
    // `position()` avoids wildcard semantics and keeps the marker fully
    // parameterized (a marker containing `%` or `_` is still literal text).
    const candidates = {};
    const sessionCandidates = await client.query(`
      SELECT id::text AS id FROM sessions
      WHERE user_id = $1 AND (
        position(lower($2) in lower(title)) > 0
        OR position(lower($2) in lower(messages_json::text)) > 0
        OR position(lower($2) in lower(agent_state_json::text)) > 0
      ) ORDER BY id LIMIT 200
    `, [userId, marker]);
    candidates.sessions = sessionCandidates.rows.map((row) => String(row.id));
    const jdCandidates = await client.query(`SELECT id::text AS id FROM jds WHERE user_id = $1 AND (position(lower($2) in lower(company)) > 0 OR position(lower($2) in lower(role)) > 0 OR position(lower($2) in lower(body)) > 0) ORDER BY id LIMIT 200`, [userId, marker]);
    candidates.jds = jdCandidates.rows.map((row) => String(row.id));
    const reportCandidates = await client.query(`SELECT report_num::text AS id FROM reports WHERE user_id = $1 AND (position(lower($2) in lower(company)) > 0 OR position(lower($2) in lower(role)) > 0 OR position(lower($2) in lower(blocks_json::text)) > 0) ORDER BY report_num LIMIT 200`, [userId, marker]);
    candidates.reports = reportCandidates.rows.map((row) => String(row.id));
    const scanCandidates = await client.query(`SELECT id::text AS id FROM scan_queue WHERE user_id = $1 AND (position(lower($2) in lower(id)) > 0 OR position(lower($2) in lower(title_positive_json::text)) > 0 OR position(lower($2) in lower(title_negative_json::text)) > 0 OR position(lower($2) in lower(location_filter)) > 0) ORDER BY created_at LIMIT 200`, [userId, marker]);
    candidates.scans = scanCandidates.rows.map((row) => String(row.id));
    const draftCandidates = await client.query(`SELECT id::text AS id FROM resume_drafts WHERE user_id = $1 AND (position(lower($2) in lower(id)) > 0 OR position(lower($2) in lower(title)) > 0 OR position(lower($2) in lower(content_json::text)) > 0 OR position(lower($2) in lower(patches_json::text)) > 0) ORDER BY created_at LIMIT 200`, [userId, marker]);
    candidates.resumeDrafts = draftCandidates.rows.map((row) => String(row.id));
    report.cleanup.candidates = candidates;
  }

  report.checks = {
    userScoped: true,
    runCount: report.snapshots.runs.length,
    eventRunCount: report.snapshots.events.length,
    gateCount: report.snapshots.gates.length,
    checkpointRunCount: report.snapshots.checkpoints.length,
    reviewCount: report.snapshots.reviews.length,
    evalCandidateCount: report.snapshots.evalCandidates.length,
    artifactCount: report.snapshots.artifacts.length,
    conversationItemReplayRunCount: report.snapshots.conversationItemReplay?.runs.length ?? 0,
    conversationItemReplayApiVerified: false,
    scanCount: report.snapshots.scans.length,
    jdCount: report.snapshots.jds.length,
    reportCount: report.snapshots.reports.length,
    resumeDocumentCount: report.snapshots.resumeDocuments.length,
    resumeDraftCount: report.snapshots.resumeDrafts.length,
    legacyCvPresent: report.snapshots.legacyCv.length > 0,
    resumeProposalCount: report.snapshots.resumeProposals.length,
    selectedRunIds: runIds,
    selectedSessionIds: sessionIds,
    note: "Counts are scoped to the requested QA user; empty arrays mean no row was found, not that a browser step passed.",
  };

  if (args.compareTo) {
    const comparePath = path.resolve(String(args.compareTo));
    const baseline = JSON.parse(fs.readFileSync(comparePath, "utf8"));
    const countKeys = ["sessions", "sessionMemory", "runs", "events", "gates", "checkpoints", "toolAttempts", "reviews", "evalCandidates", "scans", "scanJobs", "scanSourceRuns", "jds", "reports", "resumeDocuments", "resumeDrafts", "legacyCv", "resumeProposals", "artifacts"];
    report.cleanup.comparison = {
      baselineFile: path.basename(comparePath),
      baselineGeneratedAt: baseline.generatedAt || null,
      // Do not copy the baseline scope (even its private hashes and
      // timestamps) into a comparison artifact. The current report already
      // carries the scope needed to verify same-owner cleanup.
      sameUser: baseline.scope?.ownerIdSha256 && report.scope.ownerIdSha256
        ? baseline.scope.ownerIdSha256 === report.scope.ownerIdSha256
        : null,
      countDeltas: Object.fromEntries(countKeys.map((key) => {
        const before = Array.isArray(baseline.snapshots?.[key]) ? baseline.snapshots[key].length : null;
        const after = Array.isArray(report.snapshots?.[key]) ? report.snapshots[key].length : null;
        return [key, { before, after, delta: before == null || after == null ? null : after - before }];
      })),
    };
    if (report.cleanup.comparison.sameUser === false) {
      report.warnings.push("comparison scope user differs from baseline; cleanup comparison is not valid");
    } else if (report.cleanup.comparison.sameUser === null) {
      report.warnings.push("comparison scope cannot be verified without an owner fingerprint");
    }
    const beforeProjection = baseline.snapshots?.conversationItemReplay;
    const afterProjection = report.snapshots.conversationItemReplay;
    if (beforeProjection && afterProjection) {
      const beforeByRun = new Map((beforeProjection.runs || []).map((run) => [run.runId, run]));
      report.cleanup.comparison.conversationItemReplay = {
        sameProjectionSource: beforeProjection.projectionSourceSha256 === afterProjection.projectionSourceSha256,
        runs: afterProjection.runs.map((run) => ({
          runId: run.runId,
          beforeHash: beforeByRun.get(run.runId)?.projectionSha256 || null,
          afterHash: run.projectionSha256,
          sameHash: beforeByRun.get(run.runId)?.projectionSha256 === run.projectionSha256,
          beforeItemIds: beforeByRun.get(run.runId)?.itemIds || [],
          afterItemIds: run.itemIds,
        })),
      };
    }
  }

  await client.query("ROLLBACK");
} catch {
  try { await client.query("ROLLBACK"); } catch { /* ignore rollback failure */ }
  report.warnings.push("collector failed; inspect the local command stderr for the diagnostic");
  report.ok = false;
} finally {
  client.release();
  await pool.end();
}

const output = `${JSON.stringify(report, null, 2)}\n`;
if (args.output) {
  const target = path.resolve(String(args.output));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output, { encoding: "utf8", mode: 0o600 });
  console.log(`wrote read-only production evidence: ${target}`);
} else {
  process.stdout.write(output);
}

if (report.ok === false) process.exitCode = 1;

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const raw = values[index];
    if (!raw.startsWith("--")) continue;
    const key = raw.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (key === "help") {
      console.log("node scripts/read-production-evidence.mjs --username <name> --output <file> [--session-id ID --run-id ID --replay-items --projection-root DIR --scan-id ID --jd-id ID --report-num N --document-id ID --artifact-id ID --marker TEXT]");
      process.exit(0);
    }
    result[key] = values[index + 1] && !values[index + 1].startsWith("--") ? values[++index] : true;
  }
  return result;
}

function fail(message) {
  console.error(`read-production-evidence: ${message}`);
  process.exit(2);
}
