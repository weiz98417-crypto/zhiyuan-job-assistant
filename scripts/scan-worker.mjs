#!/usr/bin/env node
// @ts-check

/**
 * scan-worker.mjs — Background job scanner
 *
 * Polls scan_queue for pending tasks, executes adapters,
 * writes results to scan_jobs. Can run as daemon or --once.
 *
 * Usage:
 *   node scripts/scan-worker.mjs                # daemon mode (poll every 5s)
 *   node scripts/scan-worker.mjs --once         # single run, then exit
 *   node scripts/scan-worker.mjs --once --company 字节跳动  # single company
 *   node scripts/scan-worker.mjs --once --save-html          # save page HTMLs for debug
 */

import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

// ── Resolve paths ──────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(PROJECT_ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'zhiyuan.db');

// ── Load adapters ──────────────────────────────────────────────────

import { getAdapter } from '../lib/scan/adapters/router.mjs';
import { loadPortals, loadTitleFilter, applyTitleFilter, makeDedupKey } from '../lib/scan/orchestrator.mjs';

// ── DB ─────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── CLI args ───────────────────────────────────────────────────────

const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const SAVE_HTML = args.includes('--save-html');
const COMPANY_FILTER = (() => {
  const idx = args.indexOf('--company');
  return idx >= 0 ? args[idx + 1] : null;
})();

// ── Helpers ────────────────────────────────────────────────────────

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
  log(`debug: saved HTML → ${file}`);
}

// ── Crash recovery ─────────────────────────────────────────────────

function recoverStaleScans() {
  // Only recover scans that have been running >10 min (genuinely stale)
  const result = db.prepare(`
    UPDATE scan_queue SET status = 'failed', error_log = '[{"error":"worker restarted - stale scan recovered"}]'
    WHERE status = 'running' AND updated_at < datetime('now', '-10 minutes')
  `).run();
  if (result.changes > 0) {
    log(`recovered ${result.changes} stale scan(s)`);
  }
}

// ── Company scan ───────────────────────────────────────────────────

/**
 * @param {import('../lib/scan/adapters/types.mjs').PortalCompany} company
 * @param {import('playwright').Page} page
 * @returns {Promise<{jobs: Array<import('../lib/scan/adapters/types.mjs').RawJob>, error: string|null}>}
 */
async function scanCompany(company, page) {
  const adapter = getAdapter(company.ats_type);
  log(`[${company.name}] scanning (${adapter.name}, ${adapter.supportsAPI ? 'API' : 'Playwright'})...`);

  try {
    /** @type {Array<import('../lib/scan/adapters/types.mjs').RawJob>} */
    let jobs;
    if (adapter.supportsAPI && adapter.fetchJobsAPI) {
      jobs = await adapter.fetchJobsAPI(company);
    } else {
      jobs = await adapter.fetchJobsPlaywright(company, page);
      // Save HTML for debugging
      try {
        const html = await page.content();
        saveDebugHTML(company.name, html);
      } catch { /* ignore */ }
    }
    log(`[${company.name}] found ${jobs.length} jobs (RSS: ${rssMB()}MB)`);
    return { jobs, error: null };
  } catch (/** @type {any} */ err) {
    log(`[${company.name}] ERROR: ${err.message}`);
    // Try to save HTML even on failure
    try {
      const html = await page.content().catch(() => '');
      if (html) saveDebugHTML(company.name, html);
    } catch { /* ignore */ }
    return { jobs: [], error: err.message };
  }
}

// ── Scan execution ─────────────────────────────────────────────────

async function executeScan(scanId) {
  log(`=== Starting scan ${scanId} ===`);

  // Claim the task (CAS)
  const claimResult = db.prepare(`
    UPDATE scan_queue SET status = 'running', updated_at = datetime('now')
    WHERE id = ? AND status = 'pending'
  `).run(scanId);

  if (claimResult.changes === 0) {
    log(`scan ${scanId} already claimed by another worker`);
    return;
  }

  const companies = await loadPortals(PROJECT_ROOT);
  const titleFilter = await loadTitleFilter(PROJECT_ROOT);
  const filtered = COMPANY_FILTER
    ? companies.filter(c => c.name === COMPANY_FILTER)
    : companies;

  log(`total: ${filtered.length} companies (filter: +${titleFilter.positive.join(',') || 'none'} / -${titleFilter.negative.join(',') || 'none'})`);

  let browser = null;
  let companiesDone = 0;
  let jobsFound = 0;
  let jobsNew = 0;
  /** @type {Array<{company: string, error: string, level: string}>} */
  const errorLog = [];

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--no-sandbox'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    });

    // Fetch userId once (not per-company N+1)
    const { user_id: userId } = db.prepare("SELECT user_id FROM scan_queue WHERE id = ?").get(scanId);

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO scan_jobs
        (scan_id, user_id, company, title, url, location, department, jd_snippet, status, dedup_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)
    `);

    for (const company of filtered) {
      const page = await context.newPage();
      try {
        // Per-company timeout: 60s max
        const { jobs, error } = await Promise.race([
          scanCompany(company, page),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after 60s`)), 60000))
        ]);

        if (error) {
          errorLog.push({ company: company.name, error, level: 'ERROR' });
          continue;
        }

        // Apply title filter
        const filteredJobs = applyTitleFilter(jobs, titleFilter);
        if (jobs.length > 0 && filteredJobs.length === 0) {
          log(`[${company.name}] all ${jobs.length} jobs filtered out by title_filter`);
          errorLog.push({ company: company.name, error: `all ${jobs.length} jobs filtered out`, level: 'WARN' });
        } else if (filteredJobs.length === 0) {
          errorLog.push({ company: company.name, error: 'zero results', level: 'WARN' });
        }

        for (const job of filteredJobs) {
          const dedupKey = makeDedupKey(job.url);
          const result = insertStmt.run(
            scanId, userId, company.name, job.title, job.url,
            job.location || '', job.department || '', job.jd_snippet || '', dedupKey
          );
          jobsFound++;
          if (result.changes > 0) jobsNew++;
        }

        companiesDone++;
        // Update progress live
        db.prepare(`
          UPDATE scan_queue SET companies_done = ?, jobs_found = ?, jobs_new = ?, error_log = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(companiesDone, jobsFound, jobsNew, JSON.stringify(errorLog), scanId);

      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  // Mark done
  db.prepare(`
    UPDATE scan_queue SET status = 'done', companies_done = ?, jobs_found = ?, jobs_new = ?, error_log = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(companiesDone, jobsFound, jobsNew, JSON.stringify(errorLog), scanId);

  log(`=== Scan ${scanId} complete: ${jobsFound} jobs (${jobsNew} new), ${errorLog.length} errors ===`);
}

// ── Poll loop ──────────────────────────────────────────────────────

async function poll() {
  const scan = db.prepare(
    "SELECT id FROM scan_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
  ).get();

  if (scan) {
    await executeScan(scan.id);
  }
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  log('starting...');
  recoverStaleScans();

  // Determine current user_id (for single-user mode, use first available)
  const user = db.prepare("SELECT id FROM users LIMIT 1").get();
  if (!user) {
    log('WARNING: no users found in DB. Scan will fail until a user is registered.');
  }

  if (ONCE) {
    log('--once mode');
    // In --once mode, find or create a scan entry
    const companies = await loadPortals(PROJECT_ROOT);
    const filtered = COMPANY_FILTER
      ? companies.filter(c => c.name === COMPANY_FILTER)
      : companies;

    if (user) {
      const existingPending = db.prepare(
        "SELECT id FROM scan_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
      ).get();

      const scanId = existingPending?.id || crypto.randomUUID();

      if (!existingPending) {
        db.prepare(`
          INSERT INTO scan_queue (id, user_id, status, companies_total)
          VALUES (?, ?, 'pending', ?)
        `).run(scanId, user.id, filtered.length);
      }

      await executeScan(scanId);
    } else {
      log('no users — scanning companies directly (no DB write)');
      // Dry run without DB
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
    log('done.');
    process.exit(0);
  }

  // Daemon mode
  log('daemon mode — polling every 5s');
  setInterval(poll, 5000);
  // Run first poll immediately
  poll();
}

main().catch(err => {
  console.error('Worker fatal:', err);
  process.exit(1);
});
