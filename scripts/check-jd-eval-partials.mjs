#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

function parseArgs(argv) {
  const args = {
    driver: (process.env.DB_DRIVER || "sqlite").trim().toLowerCase() === "postgres" ? "postgres" : "sqlite",
    sqlitePath: process.env.SQLITE_PATH || path.join(process.cwd(), "data", "zhiyuan.db"),
    databaseUrl: process.env.DATABASE_URL || "",
    repair: false,
    createCandidates: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--driver") args.driver = readValue(argv, ++index, arg);
    else if (arg === "--sqlite") args.sqlitePath = readValue(argv, ++index, arg);
    else if (arg === "--database-url") args.databaseUrl = readValue(argv, ++index, arg);
    else if (arg === "--repair") args.repair = true;
    else if (arg === "--create-candidates") args.createCandidates = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!["sqlite", "postgres"].includes(args.driver)) throw new Error("--driver must be sqlite or postgres");
  return args;
}

function readValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage:
  node scripts/check-jd-eval-partials.mjs [options]

Options:
  --driver sqlite|postgres  Defaults to DB_DRIVER or sqlite.
  --sqlite <path>           SQLite database path. Defaults to data/zhiyuan.db.
  --database-url <url>      PostgreSQL connection. Defaults to DATABASE_URL.
  --repair                  Link only safe existing JD candidates to orphan reports.
  --create-candidates       Add orphan reports to agent_eval_candidates for review.
`);
}

function formatRow(row) {
  const user = row.user_id || "(no user)";
  const jdId = row.candidate_jd_id ? ` candidateJD=${row.candidate_jd_id}` : "";
  return `#${row.report_num} user=${user} ${row.company} - ${row.role}${jdId}`;
}

function printReport(result) {
  console.log(`JD evaluation partial-write check (${result.driver})`);
  console.log(`orphanReports=${result.orphans.length}`);
  console.log(`repairable=${result.orphans.filter((row) => row.candidate_jd_id).length}`);
  console.log(`repaired=${result.repaired}`);
  console.log(`evalCandidatesCreated=${result.evalCandidatesCreated || 0}`);
  if (result.orphans.length) {
    console.log("");
    for (const row of result.orphans) console.log(`- ${formatRow(row)}`);
  }
}

function redact(value, maxLength = 240) {
  const raw = String(value ?? "");
  const redacted = raw
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[api-key]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(?:\+?86[-\s]?)?1[3-9]\d{9}/g, "[phone]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[uuid]")
    .replace(/\s+/g, " ")
    .trim();
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength)}...` : redacted;
}

function dedupeKeyForPartial(row, driver) {
  const normalized = [
    driver,
    row.report_num,
    redact(row.company, 80).toLowerCase(),
    redact(row.role, 80).toLowerCase(),
  ].join(":");
  return `jd_evaluation:partial_write:${createHash("sha256").update(normalized).digest("hex").slice(0, 16)}`;
}

export function buildPartialWriteEvalCandidate(row, driver = "postgres") {
  const reportNum = Number(row.report_num || 0);
  const company = redact(row.company || "未知公司", 120);
  const role = redact(row.role || "未知岗位", 120);
  const hasCandidateJd = Boolean(row.candidate_jd_id);
  const repairHint = hasCandidateJd
    ? "A same-user JD candidate exists; link it only after manual/admin review confirms it is the source JD."
    : "No safe same-user JD candidate was found; inspect report source and rerun evaluation if needed.";

  return {
    reviewId: null,
    runId: null,
    name: "jd_evaluation_partial_write_orphan_report",
    taskType: "jd_evaluation",
    failureType: "partial_write",
    inputSummary: `Report #${reportNum}: ${company} - ${role} has no linked JD read-back record.`,
    expectedContract: {
      source: "jd_eval_partial_write_scan",
      driver,
      mustNotRepeatFailure: "partial_write",
      expected: "Every persisted JD evaluation report must have a same-user JD row linked by report_id after transactional read-back verification.",
      repairPlan: {
        action: hasCandidateJd ? "rollback_partial_write" : "needs_engineering",
        status: hasCandidateJd ? "rolled_back" : "needs_engineering",
        requiresReadBack: true,
        createEvalCandidate: true,
        reason: repairHint,
      },
    },
    fixture: {
      code: "jd_eval_partial_write.orphan_report",
      driver,
      reportNum,
      company,
      role,
      hasCandidateJd,
      candidateJdId: row.candidate_jd_id ? Number(row.candidate_jd_id) : null,
      actual: "Report exists without a linked JD row.",
    },
    dedupeKey: dedupeKeyForPartial(row, driver),
  };
}

export async function upsertPartialWriteEvalCandidates(client, candidates) {
  let saved = 0;
  for (const candidate of candidates) {
    const result = await client.query(`
      INSERT INTO agent_eval_candidates
        (review_id, run_id, name, task_type, failure_type, input_summary, expected_contract_json, fixture_json, status, dedupe_key, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, 'candidate', $9, now())
      ON CONFLICT (dedupe_key) WHERE dedupe_key <> ''
      DO UPDATE SET
        updated_at = now()
      RETURNING id
    `, [
      candidate.reviewId,
      candidate.runId,
      candidate.name,
      candidate.taskType,
      candidate.failureType,
      redact(candidate.inputSummary),
      JSON.stringify(candidate.expectedContract),
      JSON.stringify(candidate.fixture),
      candidate.dedupeKey,
    ]);
    if (result.rows[0]) saved += 1;
  }
  return saved;
}

function runSqlite(args) {
  if (!fs.existsSync(args.sqlitePath)) throw new Error(`SQLite database not found: ${args.sqlitePath}`);
  const db = new Database(args.sqlitePath);
  try {
    const orphans = db.prepare(`
      SELECT
        r.report_num,
        r.user_id,
        r.company,
        r.role,
        (
          SELECT j.id
          FROM jds j
          WHERE COALESCE(j.user_id, '') = COALESCE(r.user_id, '')
            AND j.company = r.company
            AND j.role = r.role
            AND LENGTH(j.body) >= 50
            AND (j.report_id IS NULL OR j.report_id = 0)
          ORDER BY j.id DESC
          LIMIT 1
        ) AS candidate_jd_id
      FROM reports r
      LEFT JOIN jds linked
        ON linked.report_id = r.report_num
        AND COALESCE(linked.user_id, '') = COALESCE(r.user_id, '')
      WHERE linked.id IS NULL
      ORDER BY r.report_num DESC
    `).all();
    let repaired = 0;
    if (args.repair) {
      const tx = db.transaction(() => {
        for (const row of orphans) {
          if (!row.candidate_jd_id) continue;
          const result = db.prepare("UPDATE jds SET report_id = ? WHERE id = ? AND (report_id IS NULL OR report_id = 0)")
            .run(row.report_num, row.candidate_jd_id);
          repaired += result.changes;
        }
      });
      tx();
    }
    if (args.createCandidates) {
      throw new Error("--create-candidates requires --driver postgres because agent_eval_candidates is a durable Postgres review queue.");
    }
    return { driver: "sqlite", orphans, repaired, evalCandidatesCreated: 0 };
  } finally {
    db.close();
  }
}

async function runPostgres(args) {
  if (!args.databaseUrl) throw new Error("DATABASE_URL is not configured.");
  const pool = new Pool({
    connectionString: args.databaseUrl,
    max: Number(process.env.POSTGRES_MAX_CONNECTIONS || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT
        r.report_num,
        r.user_id,
        r.company,
        r.role,
        (
          SELECT j.id
          FROM jds j
          WHERE COALESCE(j.user_id, '') = COALESCE(r.user_id, '')
            AND j.company = r.company
            AND j.role = r.role
            AND LENGTH(j.body) >= 50
            AND (j.report_id IS NULL OR j.report_id = 0)
          ORDER BY j.id DESC
          LIMIT 1
        ) AS candidate_jd_id
      FROM reports r
      LEFT JOIN jds linked
        ON linked.report_id = r.report_num
        AND COALESCE(linked.user_id, '') = COALESCE(r.user_id, '')
      WHERE linked.id IS NULL
      ORDER BY r.report_num DESC
    `);
    const orphans = result.rows;
    let repaired = 0;
    if (args.repair) {
      await client.query("BEGIN");
      try {
        for (const row of orphans) {
          if (!row.candidate_jd_id) continue;
          const update = await client.query(
            "UPDATE jds SET report_id = $1 WHERE id = $2 AND (report_id IS NULL OR report_id = 0)",
            [row.report_num, row.candidate_jd_id],
          );
          repaired += Number(update.rowCount || 0);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    let evalCandidatesCreated = 0;
    if (args.createCandidates && orphans.length) {
      const candidates = orphans.map((row) => buildPartialWriteEvalCandidate(row, "postgres"));
      evalCandidatesCreated = await upsertPartialWriteEvalCandidates(client, candidates);
    }
    return { driver: "postgres", orphans, repaired, evalCandidatesCreated };
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = args.driver === "postgres" ? await runPostgres(args) : runSqlite(args);
  printReport(result);
  if (result.orphans.length && !args.repair) {
    console.log("");
    console.log("Run with --repair to link only safe existing JD candidates. Reports without a candidate JD need manual review.");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
