#!/usr/bin/env node
/**
 * db-write.mjs — Agent-side SQLite write bridge
 *
 * Usage:
 *   node scripts/db-write.mjs --action upsertApp --data '{"num":42,...}'
 *   node scripts/db-write.mjs --action upsertReport --data '{"report_num":42,...}'
 *   node scripts/db-write.mjs --action insertJD --data '{"company":"X","role":"Y",...}'
 *
 * Reads DB path from DATA_CONTRACT.md convention: project-root/data/zhiyuan.db
 */
import Database from 'better-sqlite3';
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DB_PATH = resolve(ROOT, 'data', 'zhiyuan.db');
const LOG_PATH = resolve(ROOT, 'data', 'db-write-errors.log');

function logError(context, error) {
  try {
    const ts = new Date().toISOString();
    const line = `${ts}\t${context}\t${error.code || 'UNKNOWN'}\t${error.message}\n`;
    appendFileSync(LOG_PATH, line);
  } catch { /* logging failure must not cascade */ }
}

const DB_TIMEOUT_MS = 5000;
const db = new Database(DB_PATH, { timeout: DB_TIMEOUT_MS });
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Ensure schema exists
const schemaPath = resolve(ROOT, 'frontend', 'src', 'lib', 'server-schema.sql');
try {
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
} catch {
  // Schema may already exist; ignore init errors
}

// ── Input sanitization ──────────────────────────────
function sanitize(v) {
  if (typeof v !== 'string') return v;
  return v.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').trim();
}

function sanitizeApp(data) {
  const score = Number(data.score);
  if (isNaN(score) || score < 1.0 || score > 5.0) {
    return { error: `invalid score: ${data.score}. Must be 1.0-5.0` };
  }
  if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    return { error: `invalid date: ${data.date}. Must be YYYY-MM-DD` };
  }
  return {
    num: Number(data.num) || 0,
    date: data.date || '',
    company: sanitize(data.company || ''),
    role: sanitize(data.role || ''),
    score,
    status: sanitize(data.status || 'Evaluated'),
    pdf_generated: data.pdf_generated ? 1 : 0,
    report_path: sanitize(data.report_path || ''),
    notes: sanitize(data.notes || ''),
  };
}

// ── Retry helper ─────────────────────────────────────
function runWithRetry(stmt, params, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return stmt.run(params);
    } catch (e) {
      if (e.code === 'SQLITE_BUSY' && attempt < maxRetries) {
        logError('SQLITE_BUSY(retrying)', e);
        const delay = Math.min(100 * Math.pow(2, attempt), 2000);
        const start = Date.now();
        while (Date.now() - start < delay) { /* spin-wait */ }
        continue;
      }
      if (attempt === maxRetries) logError('SQLITE_WRITE_FAIL', e);
      throw e;
    }
  }
}

function upsertApp(data) {
  const clean = sanitizeApp(data);
  if (clean.error) {
    console.error(JSON.stringify({ ok: false, error: clean.error }));
    process.exit(1);
  }
  if (!clean.company || !clean.role) {
    console.error(JSON.stringify({ ok: false, error: 'company and role are required' }));
    process.exit(1);
  }
  const stmt = db.prepare(`
    INSERT INTO applications (num, date, company, role, score, status, pdf_generated, report_path, notes, updated_at)
    VALUES (@num, @date, @company, @role, @score, @status, @pdf_generated, @report_path, @notes, datetime('now'))
    ON CONFLICT(company, role) DO UPDATE SET
      num=excluded.num, date=excluded.date, score=excluded.score,
      status=excluded.status, pdf_generated=excluded.pdf_generated,
      report_path=excluded.report_path, notes=excluded.notes, updated_at=datetime('now')
  `);
  runWithRetry(stmt, clean);
  return { ok: true, action: 'upsertApp', company: clean.company, role: clean.role };
}

function sanitizeReport(data) {
  const overall_score = Number(data.overall_score);
  if (isNaN(overall_score) || overall_score < 1.0 || overall_score > 5.0) {
    return { error: `invalid overall_score: ${data.overall_score}. Must be 1.0-5.0` };
  }
  return {
    report_num: Number(data.report_num) || 0,
    date: data.date || '',
    company: sanitize(data.company || ''),
    role: sanitize(data.role || ''),
    archetype: sanitize(data.archetype || ''),
    overall_score,
    legitimacy: sanitize(data.legitimacy || ''),
    blocks_json: typeof data.blocks_json === 'string' ? data.blocks_json : JSON.stringify(data.blocks_json || {}),
    keywords_json: typeof data.keywords_json === 'string' ? data.keywords_json : JSON.stringify(data.keywords_json || []),
  };
}

function upsertReport(data) {
  const clean = sanitizeReport(data);
  if (clean.error) {
    console.error(JSON.stringify({ ok: false, error: clean.error }));
    process.exit(1);
  }
  if (!clean.report_num) {
    console.error(JSON.stringify({ ok: false, error: 'report_num is required' }));
    process.exit(1);
  }
  const stmt = db.prepare(`
    INSERT INTO reports (report_num, date, company, role, archetype, overall_score, legitimacy, blocks_json, keywords_json)
    VALUES (@report_num, @date, @company, @role, @archetype, @overall_score, @legitimacy, @blocks_json, @keywords_json)
    ON CONFLICT(report_num) DO UPDATE SET
      date=excluded.date, company=excluded.company, role=excluded.role,
      overall_score=excluded.overall_score, legitimacy=excluded.legitimacy,
      blocks_json=excluded.blocks_json, keywords_json=excluded.keywords_json
  `);
  runWithRetry(stmt, clean);
  return { ok: true, action: 'upsertReport', report_num: clean.report_num, company: clean.company, role: clean.role };
}

function insertJD(data) {
  const company = sanitize(data.company || '');
  const role = sanitize(data.role || '');
  const source_type = sanitize(data.source_type || '');
  if (!company || !role || !source_type) {
    console.error(JSON.stringify({ ok: false, error: 'company, role, and source_type are required' }));
    process.exit(1);
  }
  const stmt = db.prepare(`
    INSERT INTO jds (company, role, source_type, source_url, body, keywords_json, report_id)
    VALUES (@company, @role, @source_type, @source_url, @body, @keywords_json, @report_id)
  `);
  const params = {
    company, role, source_type,
    source_url: data.source_url || null,
    body: sanitize(data.body || ''),
    keywords_json: typeof data.keywords_json === 'string' ? data.keywords_json : JSON.stringify(data.keywords_json || []),
    report_id: data.report_id || null
  };
  const result = runWithRetry(stmt, params);
  return { ok: true, action: 'insertJD', id: result.lastInsertRowid, company, role };
}

// ── CLI ──────────────────────────────────────────────
const args = process.argv.slice(2);
const actionIdx = args.indexOf('--action');
const dataIdx = args.indexOf('--data');

if (actionIdx === -1 || dataIdx === -1) {
  console.error(JSON.stringify({ ok: false, error: 'Usage: node db-write.mjs --action <upsertApp|upsertReport|insertJD> --data \'<json>\'' }));
  process.exit(1);
}

const action = args[actionIdx + 1];
let data;
try {
  data = JSON.parse(args[dataIdx + 1]);
} catch {
  console.error(JSON.stringify({ ok: false, error: '--data must be valid JSON' }));
  process.exit(1);
}

try {
  let result;
  switch (action) {
    case 'upsertApp': result = upsertApp(data); break;
    case 'upsertReport': result = upsertReport(data); break;
    case 'insertJD': result = insertJD(data); break;
    default:
      console.error(JSON.stringify({ ok: false, error: `Unknown action: ${action}. Valid: upsertApp, upsertReport, insertJD` }));
      process.exit(1);
  }
  console.log(JSON.stringify(result));
} catch (e) {
  logError(`db-write:${action}`, e);
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
}
