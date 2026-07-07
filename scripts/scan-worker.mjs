#!/usr/bin/env node
// @ts-check

/**
 * Background job scanner.
 *
 * Polls scan_queue for pending tasks, executes adapters, and writes results to
 * scan_jobs. Supports both SQLite fallback and Postgres production runtime.
 *
 * Usage:
 *   node scripts/scan-worker.mjs
 *   node scripts/scan-worker.mjs --once
 *   node scripts/scan-worker.mjs --once --company "Company Name"
 *   node scripts/scan-worker.mjs --once --save-html
 */

import Database from 'better-sqlite3';
import pg from 'pg';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

import { getAdapter } from '../lib/scan/adapters/router.mjs';
import { loadPortals, loadTitleFilter, applyTitleFilter, applyLocationFilter, applyDomesticLocationGuard, makeDedupKey } from '../lib/scan/orchestrator.mjs';
import { scanJobBoards } from '../lib/scan/job-board-fallback.mjs';
import { classifyJobMatch } from '../lib/scan/query-expansion.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(PROJECT_ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'zhiyuan.db');
const DB_DRIVER = (process.env.DB_DRIVER || 'sqlite').trim().toLowerCase() === 'postgres' ? 'postgres' : 'sqlite';

const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const SAVE_HTML = args.includes('--save-html');
const COMPANY_FILTER = (() => {
  const idx = args.indexOf('--company');
  return idx >= 0 ? args[idx + 1] : null;
})();
const COMPANY_TIMEOUT_MS = Number(process.env.SCAN_COMPANY_TIMEOUT_MS || 20_000);
const SCAN_MIN_RESULTS_BEFORE_FALLBACK = Math.min(Math.max(Number(process.env.SCAN_MIN_RESULTS_BEFORE_FALLBACK || 3), 0), 50);
const SCAN_BROWSER_STORAGE_STATE = (process.env.SCAN_BROWSER_STORAGE_STATE || '').trim();
const SCAN_BROWSER_COOKIES_JSON = (process.env.SCAN_BROWSER_COOKIES_JSON || '').trim();

const HANGZHOU_SEED_COMPANIES = [
  { name: '同花顺', careers_url: 'https://job.10jqka.com.cn/', ats_type: 'custom', limits: { max_jobs: 80 } },
  { name: '恒生电子', careers_url: 'https://www.hundsun.com/about/join', ats_type: 'custom', limits: { max_jobs: 80 } },
  { name: '海康威视', careers_url: 'https://campus.hikvision.com/society', ats_type: 'custom', limits: { max_jobs: 80 } },
  { name: '大华股份', careers_url: 'https://job.dahuatech.com/', ats_type: 'custom', limits: { max_jobs: 80 } },
  { name: '涂鸦智能', careers_url: 'https://www.tuya.com/cn/careers', ats_type: 'custom', limits: { max_jobs: 80 } },
  { name: '群核科技', careers_url: 'https://www.kujiale.com/about/job', ats_type: 'custom', limits: { max_jobs: 80 } },
  { name: '宇树科技', careers_url: 'https://www.unitree.com/cn/careers', ats_type: 'custom', limits: { max_jobs: 80 } },
  { name: 'Rokid', careers_url: 'https://www.rokid.com/career', ats_type: 'custom', limits: { max_jobs: 80 } },
  { name: 'PingPong', careers_url: 'https://www.pingpongx.com/careers', ats_type: 'custom', limits: { max_jobs: 80 } },
  { name: '连连数字', careers_url: 'https://www.lianlian.com/cn/careers', ats_type: 'custom', limits: { max_jobs: 80 } },
];

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[worker ${ts}] ${msg}`);
}

function rssMB() {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

function saveDebugHTML(companyName, html) {
  if (!SAVE_HTML) return;
  const dir = path.join(DATA_DIR, 'debug');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${companyName}-${Date.now()}.html`);
  writeFileSync(file, html, 'utf-8');
  log(`debug: saved HTML -> ${file}`);
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function resolveBrowserStorageState() {
  if (!SCAN_BROWSER_STORAGE_STATE) return undefined;
  const storagePath = path.isAbsolute(SCAN_BROWSER_STORAGE_STATE)
    ? SCAN_BROWSER_STORAGE_STATE
    : path.join(PROJECT_ROOT, SCAN_BROWSER_STORAGE_STATE);
  if (!existsSync(storagePath)) {
    log(`WARNING: SCAN_BROWSER_STORAGE_STATE not found: ${storagePath}`);
    return undefined;
  }
  return storagePath;
}

function parseBrowserCookies() {
  if (!SCAN_BROWSER_COOKIES_JSON) return [];
  try {
    const parsed = JSON.parse(SCAN_BROWSER_COOKIES_JSON);
    if (!Array.isArray(parsed)) {
      log('WARNING: SCAN_BROWSER_COOKIES_JSON must be a Playwright cookie array');
      return [];
    }
    return parsed.filter((cookie) => cookie && typeof cookie === 'object' && cookie.name && cookie.value && (cookie.domain || cookie.url));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`WARNING: failed to parse SCAN_BROWSER_COOKIES_JSON: ${message}`);
    return [];
  }
}

function isHangzhouScope(scanScope) {
  return String(scanScope?.location || '').includes('杭州');
}

function withHangzhouSeeds(companies, scanScope) {
  if (!isHangzhouScope(scanScope)) return companies;
  const existing = new Set(companies.map((company) => company.name));
  const seeds = HANGZHOU_SEED_COMPANIES.filter((company) => !existing.has(company.name));
  return [...companies, ...seeds];
}

function sourceNameForJob(job, fallback) {
  return job.source_name || fallback || job.company || 'unknown';
}

function sourceTypeForCompany(company) {
  return company.ats_type && company.ats_type !== 'custom' ? `ats_${company.ats_type}` : 'company_portal';
}

function isBlockedMessage(message) {
  return /验证码|安全验证|访问异常|访问过于频繁|行为异常|blocked_by_captcha|captcha|verify|robot|CF_APP_WAF/i.test(String(message || ''));
}

function verificationStatusForJob(job) {
  return job.verification_status || (isBlockedMessage(job.jd_snippet) ? 'blocked_detail' : 'verified_jd');
}

function cleanSnippet(job) {
  return isBlockedMessage(job.jd_snippet) ? '' : (job.jd_snippet || '');
}

function metadataJson(value) {
  try { return JSON.stringify(value || {}); } catch { return '{}'; }
}

function ensureSqliteColumns(db, table, migrations) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((col) => col.name);
  for (const [name, sql] of migrations) {
    if (!cols.includes(name)) db.exec(sql);
  }
}

function ensureSqliteScanObservability(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scan_source_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT NOT NULL REFERENCES scan_queue(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      source_name TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'company_portal',
      status TEXT NOT NULL DEFAULT 'pending',
      attempted INTEGER NOT NULL DEFAULT 0,
      parsed INTEGER NOT NULL DEFAULT 0,
      matched INTEGER NOT NULL DEFAULT 0,
      inserted INTEGER NOT NULL DEFAULT 0,
      deduped INTEGER NOT NULL DEFAULT 0,
      blocked_reason TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      metrics_json TEXT NOT NULL DEFAULT '{}',
      started_at TEXT DEFAULT (datetime('now')),
      finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_scan_source_runs_scan ON scan_source_runs(scan_id, source_name);
    CREATE INDEX IF NOT EXISTS idx_scan_source_runs_user ON scan_source_runs(user_id, status);
  `);
  ensureSqliteColumns(db, 'scan_jobs', [
    ['source_name', "ALTER TABLE scan_jobs ADD COLUMN source_name TEXT NOT NULL DEFAULT ''"],
    ['source_type', "ALTER TABLE scan_jobs ADD COLUMN source_type TEXT NOT NULL DEFAULT ''"],
    ['source_url', "ALTER TABLE scan_jobs ADD COLUMN source_url TEXT NOT NULL DEFAULT ''"],
    ['verification_status', "ALTER TABLE scan_jobs ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'verified_jd'"],
    ['match_confidence', "ALTER TABLE scan_jobs ADD COLUMN match_confidence TEXT NOT NULL DEFAULT 'medium'"],
    ['source_metadata_json', "ALTER TABLE scan_jobs ADD COLUMN source_metadata_json TEXT NOT NULL DEFAULT '{}'"],
  ]);
}

async function ensurePostgresScanObservability(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scan_source_runs (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      scan_id TEXT NOT NULL REFERENCES scan_queue(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      source_name TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'company_portal',
      status TEXT NOT NULL DEFAULT 'pending',
      attempted INTEGER NOT NULL DEFAULT 0,
      parsed INTEGER NOT NULL DEFAULT 0,
      matched INTEGER NOT NULL DEFAULT 0,
      inserted INTEGER NOT NULL DEFAULT 0,
      deduped INTEGER NOT NULL DEFAULT 0,
      blocked_reason TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      started_at TIMESTAMPTZ DEFAULT now(),
      finished_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_scan_source_runs_scan ON scan_source_runs(scan_id, source_name);
    CREATE INDEX IF NOT EXISTS idx_scan_source_runs_user ON scan_source_runs(user_id, status);
    ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS source_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT '';
    ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS source_url TEXT NOT NULL DEFAULT '';
    ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'verified_jd';
    ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS match_confidence TEXT NOT NULL DEFAULT 'medium';
    ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS source_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);
}

function buildZeroResultStrategyIssue(titleFilter, scanScope) {
  const keywords = (titleFilter.positive || []).join('、') || '岗位关键词';
  const location = scanScope.location || '不限城市';
  return {
    company: 'zero_result_strategy',
    level: 'INFO',
    error: [
      `zero_result_strategy: 本次已尝试公司官网、BOSS直聘、智联招聘、猎聘、前程无忧和国内搜索索引，但没有拿到可展示岗位。`,
      `当前条件：${keywords} / ${location}。`,
      `建议下一步：放宽地点到杭州周边或全国远程；把关键词扩展为大模型产品经理、AIGC产品经理、智能体产品经理、AI应用产品经理；或降低数量上限后重试。`,
    ].join(' '),
  };
}

function createScanStore() {
  if (DB_DRIVER === 'postgres') return createPostgresScanStore();
  return createSqliteScanStore();
}

function createSqliteScanStore() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  ensureSqliteScanObservability(db);

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO scan_jobs
      (scan_id, user_id, company, title, url, location, department, jd_snippet, status, dedup_key,
       source_name, source_type, source_url, verification_status, match_confidence, source_metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?)
  `);

  return {
    async recoverStaleScans() {
      const result = db.prepare(`
        UPDATE scan_queue
        SET status = 'failed',
            error_log = '[{"error":"worker restarted - stale scan recovered"}]',
            updated_at = datetime('now')
        WHERE status = 'running' AND updated_at < datetime('now', '-10 minutes')
      `).run();
      return result.changes || 0;
    },
    async getScanRow(scanId) {
      return db.prepare('SELECT * FROM scan_queue WHERE id = ?').get(scanId) || null;
    },
    async claimScan(scanId) {
      const result = db.prepare(`
        UPDATE scan_queue SET status = 'running', updated_at = datetime('now')
        WHERE id = ? AND status = 'pending'
      `).run(scanId);
      return (result.changes || 0) > 0;
    },
    async getScanConfig(scanId) {
      return db.prepare('SELECT title_positive_json, title_negative_json, location_filter, max_results FROM scan_queue WHERE id = ?').get(scanId) || {};
    },
    async getScanUserId(scanId) {
      const row = db.prepare('SELECT user_id FROM scan_queue WHERE id = ?').get(scanId);
      return row?.user_id || null;
    },
    async insertScanJob(scanId, userId, job, dedupKey) {
      const result = insertStmt.run(
        scanId,
        userId,
        job.company || 'Job board',
        job.title,
        job.url,
        job.location || '',
        job.department || '',
        cleanSnippet(job),
        dedupKey,
        sourceNameForJob(job, job.company || 'Job board'),
        job.source_type || '',
        job.source_url || job.url || '',
        verificationStatusForJob(job),
        job.match_confidence || classifyJobMatch(job).confidence || 'medium',
        metadataJson(job.source_metadata),
      );
      return (result.changes || 0) > 0;
    },
    async recordSourceRun(scanId, userId, run) {
      db.prepare(`
        INSERT INTO scan_source_runs
          (scan_id, user_id, source_name, source_type, status, attempted, parsed, matched, inserted, deduped, blocked_reason, error, metrics_json, finished_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        scanId,
        userId,
        run.sourceName,
        run.sourceType || 'company_portal',
        run.status || 'done',
        run.attempted || 0,
        run.parsed || 0,
        run.matched || 0,
        run.inserted || 0,
        run.deduped || 0,
        run.blockedReason || '',
        run.error || '',
        metadataJson(run.metrics),
      );
    },
    async updateProgress(scanId, progress) {
      db.prepare(`
        UPDATE scan_queue
        SET companies_done = ?, jobs_found = ?, jobs_new = ?, error_log = ?, updated_at = datetime('now')
        WHERE id = ? AND status != 'canceled'
      `).run(progress.companiesDone, progress.jobsFound, progress.jobsNew, JSON.stringify(progress.errorLog), scanId);
    },
    async updateTotals(scanId, progress) {
      db.prepare(`
        UPDATE scan_queue
        SET jobs_found = ?, jobs_new = ?, error_log = ?, updated_at = datetime('now')
        WHERE id = ? AND status != 'canceled'
      `).run(progress.jobsFound, progress.jobsNew, JSON.stringify(progress.errorLog), scanId);
    },
    async updateCompaniesTotal(scanId, companiesTotal) {
      db.prepare(`
        UPDATE scan_queue
        SET companies_total = ?, updated_at = datetime('now')
        WHERE id = ? AND status != 'canceled'
      `).run(companiesTotal, scanId);
    },
    async markDone(scanId, progress) {
      db.prepare(`
        UPDATE scan_queue
        SET status = 'done', companies_done = ?, jobs_found = ?, jobs_new = ?, error_log = ?, updated_at = datetime('now')
        WHERE id = ? AND status != 'canceled'
      `).run(progress.companiesDone, progress.jobsFound, progress.jobsNew, JSON.stringify(progress.errorLog), scanId);
    },
    async getNextPendingScan() {
      return db.prepare("SELECT id FROM scan_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1").get() || null;
    },
    async getAnyUser() {
      return db.prepare('SELECT id FROM users LIMIT 1').get() || null;
    },
    async createScan(scanId, userId, companiesTotal) {
      db.prepare(`
        INSERT INTO scan_queue (id, user_id, status, title_positive_json, title_negative_json, location_filter, max_results, companies_total)
        VALUES (?, ?, 'pending', '[]', '[]', '', 50, ?)
      `).run(scanId, userId, companiesTotal);
    },
    async failRunningScans(error) {
      db.prepare(`
        UPDATE scan_queue
        SET status = 'failed',
            error_log = json_insert(COALESCE(NULLIF(error_log, ''), '[]'), '$[#]', json_object('company','worker','error',?,'level','ERROR')),
            updated_at = datetime('now')
        WHERE status = 'running'
      `).run(error);
    },
    async close() {
      db.close();
    },
  };
}

function createPostgresScanStore() {
  const connectionString = (process.env.DATABASE_URL || '').trim();
  if (!connectionString) throw new Error('DATABASE_URL is required when DB_DRIVER=postgres');

  const pool = new pg.Pool({
    connectionString,
    max: Number(process.env.POSTGRES_MAX_CONNECTIONS || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  const ready = ensurePostgresScanObservability(pool);

  return {
    async recoverStaleScans() {
      await ready;
      const result = await pool.query(`
        UPDATE scan_queue
        SET status = 'failed',
            error_log = $1::jsonb,
            updated_at = now()
        WHERE status = 'running' AND updated_at < now() - interval '10 minutes'
      `, [JSON.stringify([{ error: 'worker restarted - stale scan recovered' }])]);
      return result.rowCount || 0;
    },
    async getScanRow(scanId) {
      await ready;
      const result = await pool.query('SELECT * FROM scan_queue WHERE id = $1 LIMIT 1', [scanId]);
      return result.rows[0] || null;
    },
    async claimScan(scanId) {
      await ready;
      const result = await pool.query(`
        UPDATE scan_queue SET status = 'running', updated_at = now()
        WHERE id = $1 AND status = 'pending'
      `, [scanId]);
      return Boolean(result.rowCount);
    },
    async getScanConfig(scanId) {
      await ready;
      const result = await pool.query('SELECT title_positive_json, title_negative_json, location_filter, max_results FROM scan_queue WHERE id = $1 LIMIT 1', [scanId]);
      return result.rows[0] || {};
    },
    async getScanUserId(scanId) {
      await ready;
      const result = await pool.query('SELECT user_id FROM scan_queue WHERE id = $1 LIMIT 1', [scanId]);
      return result.rows[0]?.user_id || null;
    },
    async insertScanJob(scanId, userId, job, dedupKey) {
      await ready;
      const result = await pool.query(`
        INSERT INTO scan_jobs
          (scan_id, user_id, company, title, url, location, department, jd_snippet, status, dedup_key,
           source_name, source_type, source_url, verification_status, match_confidence, source_metadata_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new', $9, $10, $11, $12, $13, $14, $15::jsonb)
        ON CONFLICT (dedup_key) DO NOTHING
      `, [
        scanId,
        userId,
        job.company || 'Job board',
        job.title,
        job.url,
        job.location || '',
        job.department || '',
        cleanSnippet(job),
        dedupKey,
        sourceNameForJob(job, job.company || 'Job board'),
        job.source_type || '',
        job.source_url || job.url || '',
        verificationStatusForJob(job),
        job.match_confidence || classifyJobMatch(job).confidence || 'medium',
        metadataJson(job.source_metadata),
      ]);
      return Boolean(result.rowCount);
    },
    async recordSourceRun(scanId, userId, run) {
      await ready;
      await pool.query(`
        INSERT INTO scan_source_runs
          (scan_id, user_id, source_name, source_type, status, attempted, parsed, matched, inserted, deduped, blocked_reason, error, metrics_json, finished_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, now())
      `, [
        scanId,
        userId,
        run.sourceName,
        run.sourceType || 'company_portal',
        run.status || 'done',
        run.attempted || 0,
        run.parsed || 0,
        run.matched || 0,
        run.inserted || 0,
        run.deduped || 0,
        run.blockedReason || '',
        run.error || '',
        metadataJson(run.metrics),
      ]);
    },
    async updateProgress(scanId, progress) {
      await ready;
      await pool.query(`
        UPDATE scan_queue
        SET companies_done = $1, jobs_found = $2, jobs_new = $3, error_log = $4::jsonb, updated_at = now()
        WHERE id = $5 AND status != 'canceled'
      `, [progress.companiesDone, progress.jobsFound, progress.jobsNew, JSON.stringify(progress.errorLog), scanId]);
    },
    async updateTotals(scanId, progress) {
      await ready;
      await pool.query(`
        UPDATE scan_queue
        SET jobs_found = $1, jobs_new = $2, error_log = $3::jsonb, updated_at = now()
        WHERE id = $4 AND status != 'canceled'
      `, [progress.jobsFound, progress.jobsNew, JSON.stringify(progress.errorLog), scanId]);
    },
    async updateCompaniesTotal(scanId, companiesTotal) {
      await ready;
      await pool.query(`
        UPDATE scan_queue
        SET companies_total = $1, updated_at = now()
        WHERE id = $2 AND status != 'canceled'
      `, [companiesTotal, scanId]);
    },
    async markDone(scanId, progress) {
      await ready;
      await pool.query(`
        UPDATE scan_queue
        SET status = 'done', companies_done = $1, jobs_found = $2, jobs_new = $3, error_log = $4::jsonb, updated_at = now()
        WHERE id = $5 AND status != 'canceled'
      `, [progress.companiesDone, progress.jobsFound, progress.jobsNew, JSON.stringify(progress.errorLog), scanId]);
    },
    async getNextPendingScan() {
      await ready;
      const result = await pool.query("SELECT id FROM scan_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1");
      return result.rows[0] || null;
    },
    async getAnyUser() {
      await ready;
      const result = await pool.query('SELECT id FROM users LIMIT 1');
      return result.rows[0] || null;
    },
    async createScan(scanId, userId, companiesTotal) {
      await ready;
      await pool.query(`
        INSERT INTO scan_queue
          (id, user_id, status, title_positive_json, title_negative_json, location_filter, max_results, companies_total)
        VALUES ($1, $2, 'pending', '[]'::jsonb, '[]'::jsonb, '', 50, $3)
      `, [scanId, userId, companiesTotal]);
    },
    async failRunningScans(error) {
      await ready;
      await pool.query(`
        UPDATE scan_queue
        SET status = 'failed',
            error_log = COALESCE(error_log, '[]'::jsonb) || $1::jsonb,
            updated_at = now()
        WHERE status = 'running'
      `, [JSON.stringify([{ company: 'worker', error, level: 'ERROR' }])]);
    },
    async close() {
      await pool.end();
    },
  };
}

const store = createScanStore();

async function recoverStaleScans() {
  const changes = await store.recoverStaleScans();
  if (changes > 0) log(`recovered ${changes} stale scan(s)`);
}

async function isCanceled(scanId) {
  return (await store.getScanRow(scanId))?.status === 'canceled';
}

async function scanCompany(company, page) {
  const adapter = getAdapter(company.ats_type);
  log(`[${company.name}] scanning (${adapter.name}, ${adapter.supportsAPI ? 'API' : 'Playwright'})...`);

  try {
    let jobs;
    if (adapter.supportsAPI && adapter.fetchJobsAPI) {
      jobs = await adapter.fetchJobsAPI(company);
    } else {
      jobs = await adapter.fetchJobsPlaywright(company, page);
      try {
        const html = await page.content();
        saveDebugHTML(company.name, html);
      } catch {
        // best-effort debug artifact only
      }
    }
    log(`[${company.name}] found ${jobs.length} jobs (RSS: ${rssMB()}MB)`);
    return { jobs, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[${company.name}] ERROR: ${message}`);
    try {
      const html = await page.content().catch(() => '');
      if (html) saveDebugHTML(company.name, html);
    } catch {
      // best-effort debug artifact only
    }
    return { jobs: [], error: message };
  }
}

async function executeScan(scanId) {
  log(`=== Starting scan ${scanId} ===`);

  const claimed = await store.claimScan(scanId);
  if (!claimed) {
    log(`scan ${scanId} already claimed by another worker`);
    return;
  }

  const scanConfig = await store.getScanConfig(scanId);
  const fallbackTitleFilter = await loadTitleFilter(PROJECT_ROOT);
  const titleFilter = {
    positive: parseJsonArray(scanConfig.title_positive_json),
    negative: parseJsonArray(scanConfig.title_negative_json),
  };
  if (titleFilter.positive.length === 0) titleFilter.positive = fallbackTitleFilter.positive;
  if (titleFilter.negative.length === 0) titleFilter.negative = fallbackTitleFilter.negative;

  const scanScope = {
    location: scanConfig.location_filter || '',
    maxResults: Math.min(Math.max(Number(scanConfig.max_results || 50), 1), 200),
  };
  const companies = withHangzhouSeeds(await loadPortals(PROJECT_ROOT), scanScope);
  const filtered = COMPANY_FILTER ? companies.filter((c) => c.name === COMPANY_FILTER) : companies;
  await store.updateCompaniesTotal(scanId, filtered.length);

  log(`total: ${filtered.length} companies (filter: +${titleFilter.positive.join(',') || 'none'} / -${titleFilter.negative.join(',') || 'none'}; location: ${scanScope.location || 'any'}; max: ${scanScope.maxResults})`);

  let browser = null;
  let companiesDone = 0;
  let jobsFound = 0;
  let jobsNew = 0;
  const errorLog = [];

  const progress = () => ({ companiesDone, jobsFound, jobsNew, errorLog });
  const insertJobs = async (scanUserId, jobsToInsert) => {
    const stats = { inserted: 0, deduped: 0 };
    for (const job of jobsToInsert) {
      if (jobsNew >= scanScope.maxResults) break;
      if (!job.url || !job.title) continue;
      const inserted = await store.insertScanJob(scanId, scanUserId, job, makeDedupKey(job.url));
      if (inserted) {
        jobsFound++;
        jobsNew++;
        stats.inserted++;
      } else {
        stats.deduped++;
      }
    }
    return stats;
  };

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--no-sandbox'],
    });

    const storageState = resolveBrowserStorageState();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      ...(storageState ? { storageState } : {}),
    });
    const injectedCookies = parseBrowserCookies();
    if (injectedCookies.length > 0) {
      await context.addCookies(injectedCookies);
      log(`browser auth: injected ${injectedCookies.length} cookie(s) from SCAN_BROWSER_COOKIES_JSON`);
    } else if (storageState) {
      log(`browser auth: using storage state ${storageState}`);
    }

    const userId = await store.getScanUserId(scanId);
    if (!userId) throw new Error(`scan ${scanId} has no user_id`);

    for (const company of filtered) {
      if (await isCanceled(scanId)) {
        log(`scan ${scanId} canceled before ${company.name}`);
        return;
      }

      const page = await context.newPage();
      try {
        const { jobs, error } = await Promise.race([
          scanCompany(company, page),
          new Promise((resolve) => setTimeout(() => resolve({ jobs: [], error: `timeout after ${Math.round(COMPANY_TIMEOUT_MS / 1000)}s` }), COMPANY_TIMEOUT_MS)),
        ]);

        if (error) {
          errorLog.push({ company: company.name, error, level: 'ERROR' });
          await store.recordSourceRun(scanId, userId, {
            sourceName: company.name,
            sourceType: sourceTypeForCompany(company),
            status: isBlockedMessage(error) ? 'blocked' : 'failed',
            attempted: 1,
            parsed: 0,
            matched: 0,
            inserted: 0,
            deduped: 0,
            blockedReason: isBlockedMessage(error) ? error : '',
            error,
          });
          companiesDone++;
          await store.updateProgress(scanId, progress());
          continue;
        }

        const filteredJobs = applyTitleFilter(jobs, titleFilter);
        const domesticJobs = applyDomesticLocationGuard(filteredJobs);
        const locationFilteredJobs = applyLocationFilter(domesticJobs, scanScope.location);
        if (jobs.length > 0 && filteredJobs.length === 0) {
          log(`[${company.name}] all ${jobs.length} jobs filtered out by title_filter`);
          errorLog.push({ company: company.name, error: `all ${jobs.length} jobs filtered out`, level: 'INFO' });
        } else if (filteredJobs.length > 0 && domesticJobs.length === 0) {
          errorLog.push({ company: company.name, error: 'all matching jobs filtered out by domestic location guard', level: 'INFO' });
        } else if (filteredJobs.length === 0) {
          errorLog.push({ company: company.name, error: 'zero results', level: 'INFO' });
        }

        const stats = await insertJobs(userId, locationFilteredJobs.map((job) => ({
          ...job,
          source_name: job.source_name || company.name,
          source_type: job.source_type || sourceTypeForCompany(company),
          source_url: job.source_url || company.careers_url || job.url,
          verification_status: job.verification_status || 'verified_jd',
          source_metadata: { ...(job.source_metadata || {}), source_company: company.name, ats_type: company.ats_type || 'custom' },
        })));
        await store.recordSourceRun(scanId, userId, {
          sourceName: company.name,
          sourceType: sourceTypeForCompany(company),
          status: locationFilteredJobs.length > 0 ? 'done' : 'empty',
          attempted: 1,
          parsed: jobs.length,
          matched: locationFilteredJobs.length,
          inserted: stats.inserted,
          deduped: stats.deduped,
          metrics: {
            titleMatched: filteredJobs.length,
            domesticMatched: domesticJobs.length,
            locationMatched: locationFilteredJobs.length,
            atsType: company.ats_type || 'custom',
          },
        });
        companiesDone++;
        await store.updateProgress(scanId, progress());

        if (jobsNew >= scanScope.maxResults) {
          log(`scan ${scanId} reached max result limit (${scanScope.maxResults})`);
          break;
        }
      } finally {
        await page.close().catch(() => {});
      }
    }

    if (!(await isCanceled(scanId)) && jobsNew < SCAN_MIN_RESULTS_BEFORE_FALLBACK && jobsNew < scanScope.maxResults) {
      log(`company portals produced ${jobsNew} new jobs; falling back to BOSS/Zhaopin/Liepin/51job/search-index leads`);
      const { jobs: boardJobs, errors } = await scanJobBoards(context, titleFilter, scanScope);
      errorLog.push(...errors);
      const filteredBoardJobs = applyLocationFilter(applyDomesticLocationGuard(applyTitleFilter(boardJobs, titleFilter)), scanScope.location);
      if (filteredBoardJobs.length === 0) {
        errorLog.push({ company: 'Job board', error: 'fallback job boards and search-index leads returned zero matching results', level: 'INFO' });
      }
      const bySource = new Map();
      for (const job of filteredBoardJobs) {
        const key = sourceNameForJob(job, 'Job board');
        const bucket = bySource.get(key) || [];
        bucket.push(job);
        bySource.set(key, bucket);
      }
      for (const [sourceName, sourceJobs] of bySource.entries()) {
        const stats = await insertJobs(userId, sourceJobs);
        await store.recordSourceRun(scanId, userId, {
          sourceName,
          sourceType: sourceJobs[0]?.source_type || 'job_board',
          status: sourceJobs.some((job) => verificationStatusForJob(job) === 'blocked_detail') ? 'blocked' : 'done',
          attempted: 1,
          parsed: sourceJobs.length,
          matched: sourceJobs.length,
          inserted: stats.inserted,
          deduped: stats.deduped,
          blockedReason: sourceJobs.some((job) => verificationStatusForJob(job) === 'blocked_detail') ? 'detail blocked by WAF text' : '',
          metrics: { fallback: true },
        });
      }
      for (const err of errors) {
        if (bySource.has(err.company)) continue;
        await store.recordSourceRun(scanId, userId, {
          sourceName: err.company || 'Job board',
          sourceType: err.company === '搜索索引线索' ? 'search_index' : 'job_board',
          status: err.level === 'WARN' ? 'blocked' : (err.level === 'INFO' ? 'empty' : 'failed'),
          attempted: 1,
          parsed: 0,
          matched: 0,
          inserted: 0,
          deduped: 0,
          blockedReason: err.level === 'WARN' ? err.error : '',
          error: err.level === 'ERROR' ? err.error : '',
          metrics: { fallback: true },
        });
      }
      if (jobsNew === 0 && !errorLog.some((entry) => entry.company === 'zero_result_strategy')) {
        errorLog.push(buildZeroResultStrategyIssue(titleFilter, scanScope));
      }
      await store.updateTotals(scanId, progress());
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  if (!(await isCanceled(scanId)) && jobsNew === 0 && !errorLog.some((entry) => entry.company === 'zero_result_strategy')) {
    errorLog.push(buildZeroResultStrategyIssue(titleFilter, scanScope));
  }

  await store.markDone(scanId, progress());
  log(`=== Scan ${scanId} complete: ${jobsFound} jobs (${jobsNew} new), ${errorLog.length} errors ===`);
}

async function poll() {
  const scan = await store.getNextPendingScan();
  if (scan) await executeScan(scan.id);
}

async function dryRunCompanies(filtered) {
  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--no-sandbox'],
    });
    for (const company of filtered) {
      const page = await browser.newPage();
      try {
        const result = await scanCompany(company, page);
        console.log(`[${company.name}] ${result.jobs.length} jobs`);
        if (result.error) console.error(`  ERROR: ${result.error}`);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function main() {
  log(`starting (${DB_DRIVER})...`);
  await recoverStaleScans();

  const user = await store.getAnyUser();
  if (!user) log('WARNING: no users found in DB. Scan will fail until a user is registered.');

  if (ONCE) {
    log('--once mode');
    const companies = await loadPortals(PROJECT_ROOT);
    const filtered = COMPANY_FILTER ? companies.filter((c) => c.name === COMPANY_FILTER) : companies;

    if (user) {
      const existingPending = await store.getNextPendingScan();
      const scanId = existingPending?.id || randomUUID();
      if (!existingPending) await store.createScan(scanId, user.id, filtered.length);
      await executeScan(scanId);
    } else {
      log('no users - scanning companies directly (no DB write)');
      await dryRunCompanies(filtered);
    }

    log('done.');
    await store.close();
    return;
  }

  log('daemon mode - polling every 5s');
  setInterval(() => {
    poll().catch((err) => console.error('Worker poll error:', err));
  }, 5000);
  await poll();
}

main().catch(async (err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Worker fatal:', err);
  try {
    await store.failRunningScans(message);
  } catch {
    // best effort
  }
  try {
    await store.close();
  } catch {
    // best effort
  }
  process.exit(1);
});
