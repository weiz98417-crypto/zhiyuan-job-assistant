// @ts-check
/**
 * Scan orchestrator — shared logic between API routes and worker.
 * Import both from API routes (.ts via getDb) and worker (.mjs via getDb).
 */
import { createHash } from 'crypto';

/** @param {string} url */
export function makeDedupKey(url) {
  return createHash('sha256').update(url).digest('hex');
}

/**
 * Load title_filter from portals.yml
 * @param {string} [projectRoot]
 * @returns {Promise<{positive: string[], negative: string[]}>}
 */
export async function loadTitleFilter(projectRoot) {
  const root = projectRoot || process.cwd();
  const { readFileSync } = await import('fs');
  const path = await import('path');
  const yaml = await import('js-yaml');
  const content = readFileSync(path.join(root, 'portals.yml'), 'utf-8');
  const config = /** @type {any} */ (yaml.load(content));
  return {
    positive: config.title_filter?.positive || [],
    negative: config.title_filter?.negative || [],
  };
}

/**
 * Apply title filter to a list of jobs
 * @param {Array<import('./adapters/types.mjs').RawJob>} jobs
 * @param {{positive: string[], negative: string[]}} titleFilter
 * @returns {Array<import('./adapters/types.mjs').RawJob>}
 */
export function applyTitleFilter(jobs, titleFilter) {
  if (!titleFilter.positive.length && !titleFilter.negative.length) return jobs;
  return jobs.filter(job => {
    const title = job.title || '';
    // Negative filter: exclude if any negative keyword matches
    if (titleFilter.negative.some(kw => title.includes(kw))) return false;
    // Positive filter: include if any positive keyword matches (or no positive filter set)
    if (titleFilter.positive.length === 0) return true;
    return titleFilter.positive.some(kw => title.includes(kw));
  });
}

/**
 * Load portals.yml (compatible with both Node ESM and Next.js environments)
 * @param {string} [projectRoot]
 * @returns {Promise<Array<import('./adapters/types.mjs').PortalCompany>>}
 */
export async function loadPortals(projectRoot) {
  const root = projectRoot || process.cwd();
  const { readFileSync } = await import('fs');
  const path = await import('path');
  const yaml = await import('js-yaml');
  const content = readFileSync(path.join(root, 'portals.yml'), 'utf-8');
  const config = /** @type {any} */ (yaml.load(content));
  return (config.tracked_companies || []).map((/** @type {any} */ c) => ({
    name: c.name,
    careers_url: c.careers_url || c.url || '',
    ats_type: c.ats_type || 'custom',
    selectors: c.selectors,
    limits: c.limits,
  }));
}

/**
 * Create a scan entry and return its ID (for API route use)
 * @param {any} db - better-sqlite3 Database instance
 * @param {string} userId
 * @param {Array<import('./adapters/types.mjs').PortalCompany>} companies
 * @param {string[]} [companyFilter] - optional company names to limit scan
 * @returns {{ scanId: string, conflict: boolean, companiesTotal?: number }}
 */
export function createScanEntry(db, userId, companies, companyFilter) {
  // Check for existing pending/running scan
  const existing = db.prepare(
    "SELECT id FROM scan_queue WHERE user_id = ? AND status IN ('pending','running')"
  ).get(userId);

  if (existing) {
    return { scanId: existing.id, conflict: true };
  }

  const filtered = companyFilter
    ? companies.filter(c => companyFilter.includes(c.name))
    : companies;

  const scanId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO scan_queue (id, user_id, status, companies_total, companies_done, jobs_found, jobs_new, error_log)
    VALUES (?, ?, 'pending', ?, 0, 0, 0, '[]')
  `).run(scanId, userId, filtered.length);

  return { scanId, conflict: false, companiesTotal: filtered.length };
}

/**
 * Get scan status with per-company breakdown
 * @param {any} db
 * @param {string} scanId
 * @param {string} [userId] if provided, verifies ownership
 */
export function getScanStatus(db, scanId, userId) {
  const scan = db.prepare(
    userId
      ? "SELECT * FROM scan_queue WHERE id = ? AND user_id = ?"
      : "SELECT * FROM scan_queue WHERE id = ?"
  ).get(userId ? scanId : scanId, ...(userId ? [userId] : []));
  if (!scan) return null;

  const companies = db.prepare(`
    SELECT company, COUNT(*) as jobs_found
    FROM scan_jobs WHERE scan_id = ?
    GROUP BY company
  `).all(scanId);

  /** @type {Array<{company: string, error: string, level: string}>} */
  let errorLog = [];
  try { errorLog = JSON.parse(scan.error_log || '[]'); } catch { /* keep empty */ }

  // Build error map for O(1) lookup
  const errorMap = new Map();
  for (const e of errorLog) errorMap.set(e.company, e);

  const companyStatus = companies.map((/** @type {any} */ c) => ({
    name: c.company,
    status: errorMap.has(c.company) ? 'error' : 'success',
    jobsFound: c.jobs_found,
    error: errorMap.get(c.company)?.error || null,
  }));

  return {
    scanId: scan.id,
    status: scan.status,
    companiesDone: scan.companies_done,
    companiesTotal: scan.companies_total,
    jobsFound: scan.jobs_found,
    jobsNew: scan.jobs_new,
    companies: companyStatus,
    createdAt: scan.created_at,
  };
}

/**
 * Get active scan for a user (for page reconnection)
 * @param {any} db
 * @param {string} userId
 */
export function getActiveScan(db, userId) {
  const scan = db.prepare(
    "SELECT * FROM scan_queue WHERE user_id = ? AND status = 'running' ORDER BY updated_at DESC LIMIT 1"
  ).get(userId);
  if (!scan) return null;
  return getScanStatus(db, scan.id, userId);
}

/**
 * Query scan jobs
 * @param {any} db
 * @param {string} userId
 * @param {{ status?: string, page?: number, limit?: number }} filters
 */
export function getScanJobs(db, userId, filters = {}) {
  const status = filters.status || 'new';
  const limit = filters.limit || 20;
  const offset = ((filters.page || 1) - 1) * limit;

  const total = db.prepare(
    "SELECT COUNT(*) as count FROM scan_jobs WHERE user_id = ? AND status = ?"
  ).get(userId, status);

  const jobs = db.prepare(`
    SELECT * FROM scan_jobs WHERE user_id = ? AND status = ?
    ORDER BY discovered_at DESC LIMIT ? OFFSET ?
  `).all(userId, status, limit, offset);

  return { jobs, total: total.count, page: filters.page || 1 };
}

/**
 * Update job status with ownership check
 * @param {any} db
 * @param {number} jobId
 * @param {string} userId
 * @param {string} newStatus - 'dismissed' | 'evaluated' | 'new'
 * @returns {{ success: boolean, error?: string }}
 */
export function updateJobStatus(db, jobId, userId, newStatus) {
  const validStatuses = ['new', 'dismissed', 'evaluated'];
  if (!validStatuses.includes(newStatus)) {
    return { success: false, error: `Invalid status: ${newStatus}` };
  }

  const result = db.prepare(`
    UPDATE scan_jobs SET status = ?, last_interaction_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(newStatus, jobId, userId);

  return { success: result.changes > 0 };
}

/**
 * Get scan history (derived from scan_queue)
 * @param {any} db
 * @param {string} userId
 * @param {{ page?: number, limit?: number }} opts
 */
export function getScanHistory(db, userId, opts = {}) {
  const limit = opts.limit || 10;
  const offset = ((opts.page || 1) - 1) * limit;

  const total = db.prepare(
    "SELECT COUNT(*) as count FROM scan_queue WHERE user_id = ?"
  ).get(userId);

  const scans = db.prepare(`
    SELECT sq.id, sq.created_at, sq.companies_done, sq.jobs_found, sq.jobs_new, sq.error_log,
           (SELECT COUNT(*) FROM scan_jobs WHERE scan_id = sq.id) as total_jobs
    FROM scan_queue sq WHERE sq.user_id = ?
    ORDER BY sq.created_at DESC LIMIT ? OFFSET ?
  `).all(userId, limit, offset);

  return {
    history: scans.map((/** @type {any} */ s) => {
      let failedCompanies = [];
      try { failedCompanies = JSON.parse(s.error_log || '[]'); } catch { /* keep empty */ }
      return {
        scanId: s.id,
        createdAt: s.created_at,
        companiesDone: s.companies_done,
        jobsFound: s.jobs_found,
        jobsNew: s.jobs_new,
        totalJobs: s.total_jobs,
        failedCompanies,
      };
    }),
    total: total.count,
    page: opts.page || 1,
  };
}

/**
 * Reset "possibly broken" flag for a company
 * @param {any} db
 * @param {string} scanId
 * @param {string} company
 * @param {string} [userId]
 */
export function resetCompanyFlag(db, scanId, company, userId) {
  const scan = db.prepare(
    userId
      ? "SELECT error_log FROM scan_queue WHERE id = ? AND user_id = ?"
      : "SELECT error_log FROM scan_queue WHERE id = ?"
  ).get(userId ? scanId : scanId, ...(userId ? [userId] : []));
  if (!scan) return false;
  /** @type {Array<{company: string, error: string, level: string}>} */
  let errorLog = [];
  try { errorLog = JSON.parse(scan.error_log || '[]'); } catch { /* keep empty */ }
  const updated = errorLog.filter((/** @type {any} */ e) => e.company !== company);
  db.prepare("UPDATE scan_queue SET error_log = ? WHERE id = ?").run(JSON.stringify(updated), scanId);
  return true;
}
