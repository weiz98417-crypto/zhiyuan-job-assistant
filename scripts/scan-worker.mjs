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
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

import { getAdapter } from '../lib/scan/adapters/router.mjs';
import { loadPortals, loadTitleFilter, applyTitleFilter, applyLocationFilter, applyDomesticLocationGuard, makeDedupKey } from '../lib/scan/orchestrator.mjs';
import { scanJobBoards } from '../lib/scan/job-board-fallback.mjs';

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

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO scan_jobs
      (scan_id, user_id, company, title, url, location, department, jd_snippet, status, dedup_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)
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
        job.jd_snippet || '',
        dedupKey,
      );
      return (result.changes || 0) > 0;
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

  return {
    async recoverStaleScans() {
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
      const result = await pool.query('SELECT * FROM scan_queue WHERE id = $1 LIMIT 1', [scanId]);
      return result.rows[0] || null;
    },
    async claimScan(scanId) {
      const result = await pool.query(`
        UPDATE scan_queue SET status = 'running', updated_at = now()
        WHERE id = $1 AND status = 'pending'
      `, [scanId]);
      return Boolean(result.rowCount);
    },
    async getScanConfig(scanId) {
      const result = await pool.query('SELECT title_positive_json, title_negative_json, location_filter, max_results FROM scan_queue WHERE id = $1 LIMIT 1', [scanId]);
      return result.rows[0] || {};
    },
    async getScanUserId(scanId) {
      const result = await pool.query('SELECT user_id FROM scan_queue WHERE id = $1 LIMIT 1', [scanId]);
      return result.rows[0]?.user_id || null;
    },
    async insertScanJob(scanId, userId, job, dedupKey) {
      const result = await pool.query(`
        INSERT INTO scan_jobs
          (scan_id, user_id, company, title, url, location, department, jd_snippet, status, dedup_key)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new', $9)
        ON CONFLICT (dedup_key) DO NOTHING
      `, [
        scanId,
        userId,
        job.company || 'Job board',
        job.title,
        job.url,
        job.location || '',
        job.department || '',
        job.jd_snippet || '',
        dedupKey,
      ]);
      return Boolean(result.rowCount);
    },
    async updateProgress(scanId, progress) {
      await pool.query(`
        UPDATE scan_queue
        SET companies_done = $1, jobs_found = $2, jobs_new = $3, error_log = $4::jsonb, updated_at = now()
        WHERE id = $5 AND status != 'canceled'
      `, [progress.companiesDone, progress.jobsFound, progress.jobsNew, JSON.stringify(progress.errorLog), scanId]);
    },
    async updateTotals(scanId, progress) {
      await pool.query(`
        UPDATE scan_queue
        SET jobs_found = $1, jobs_new = $2, error_log = $3::jsonb, updated_at = now()
        WHERE id = $4 AND status != 'canceled'
      `, [progress.jobsFound, progress.jobsNew, JSON.stringify(progress.errorLog), scanId]);
    },
    async markDone(scanId, progress) {
      await pool.query(`
        UPDATE scan_queue
        SET status = 'done', companies_done = $1, jobs_found = $2, jobs_new = $3, error_log = $4::jsonb, updated_at = now()
        WHERE id = $5 AND status != 'canceled'
      `, [progress.companiesDone, progress.jobsFound, progress.jobsNew, JSON.stringify(progress.errorLog), scanId]);
    },
    async getNextPendingScan() {
      const result = await pool.query("SELECT id FROM scan_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1");
      return result.rows[0] || null;
    },
    async getAnyUser() {
      const result = await pool.query('SELECT id FROM users LIMIT 1');
      return result.rows[0] || null;
    },
    async createScan(scanId, userId, companiesTotal) {
      await pool.query(`
        INSERT INTO scan_queue
          (id, user_id, status, title_positive_json, title_negative_json, location_filter, max_results, companies_total)
        VALUES ($1, $2, 'pending', '[]'::jsonb, '[]'::jsonb, '', 50, $3)
      `, [scanId, userId, companiesTotal]);
    },
    async failRunningScans(error) {
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
  const companies = await loadPortals(PROJECT_ROOT);
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
  const filtered = COMPANY_FILTER ? companies.filter((c) => c.name === COMPANY_FILTER) : companies;

  log(`total: ${filtered.length} companies (filter: +${titleFilter.positive.join(',') || 'none'} / -${titleFilter.negative.join(',') || 'none'}; location: ${scanScope.location || 'any'}; max: ${scanScope.maxResults})`);

  let browser = null;
  let companiesDone = 0;
  let jobsFound = 0;
  let jobsNew = 0;
  const errorLog = [];

  const progress = () => ({ companiesDone, jobsFound, jobsNew, errorLog });
  const insertJobs = async (scanUserId, jobsToInsert) => {
    for (const job of jobsToInsert) {
      if (jobsNew >= scanScope.maxResults) break;
      if (!job.url || !job.title) continue;
      const inserted = await store.insertScanJob(scanId, scanUserId, job, makeDedupKey(job.url));
      if (inserted) {
        jobsFound++;
        jobsNew++;
      }
    }
  };

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--no-sandbox'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    });

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

        await insertJobs(userId, locationFilteredJobs);
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
      await insertJobs(userId, filteredBoardJobs);
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
