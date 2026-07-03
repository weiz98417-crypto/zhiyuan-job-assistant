// @ts-check
/**
 * Scan orchestrator — shared logic between API routes and worker.
 * Import both from API routes (.ts via getDb) and worker (.mjs via getDb).
 */
import { createHash, randomUUID } from 'crypto';

const TRACKING_PARAM_NAMES = new Set([
  'campaign',
  'fbclid',
  'from',
  'gclid',
  'msclkid',
  'ref',
  'ref_src',
  'share',
  'share_source',
  'source',
  'spm',
  'track',
  'tracking',
]);

/**
 * @param {string} name
 * @returns {boolean}
 */
function isTrackingParam(name) {
  const key = name.toLowerCase();
  return key.startsWith('utm_') || TRACKING_PARAM_NAMES.has(key);
}

/**
 * Canonicalize a discovered job URL for strong deduplication while preserving
 * the raw URL on the stored job for display and navigation.
 * @param {string} url
 */
export function normalizeJobUrl(url) {
  const input = String(url || '').trim();
  if (!input) return '';

  try {
    const parsed = new URL(input);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = '';
    if (
      (parsed.protocol === 'https:' && parsed.port === '443') ||
      (parsed.protocol === 'http:' && parsed.port === '80')
    ) {
      parsed.port = '';
    }
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');

    /** @type {Array<[string, string]>} */
    const params = [];
    parsed.searchParams.forEach((value, key) => {
      if (!isTrackingParam(key)) params.push([key, value]);
    });
    params.sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
    ));

    parsed.search = '';
    for (const [key, value] of params) parsed.searchParams.append(key, value);
    return parsed.toString();
  } catch {
    return input.replace(/#.*$/, '').replace(/\/+$/, '');
  }
}

/** @param {string} url */
export function makeDedupKey(url) {
  return createHash('sha256').update(normalizeJobUrl(url)).digest('hex');
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

const OVERSEAS_LOCATION_PATTERNS = [
  /海外|境外|国外|全球|亚太|北美|欧洲|欧美|拉美|中东|非洲|东南亚/,
  /远程|全远程|居家|remote|work\s*from\s*home|wfh/i,
  /美国|加拿大|英国|德国|法国|荷兰|西班牙|意大利|瑞士|瑞典|澳洲|澳大利亚|日本|韩国|新加坡|马来西亚|泰国|越南|印度|印尼|菲律宾|迪拜|阿联酋/,
  /United States|USA|Canada|UK|Germany|France|Netherlands|Spain|Italy|Switzerland|Sweden|Australia|Japan|Korea|Singapore|Malaysia|Thailand|Vietnam|India|Indonesia|Philippines|Dubai|UAE/i,
  /\bUS\b|\bEU\b|\bEMEA\b|\bAPAC\b/i,
];

const DOMESTIC_LOCATION_PATTERNS = [
  /中国|大陆|内地|全国|北京|上海|广州|深圳|杭州|南京|苏州|成都|武汉|西安|重庆|天津|郑州|长沙|合肥|厦门|福州|青岛|济南|大连|沈阳|长春|哈尔滨|宁波|无锡|佛山|东莞|珠海|中山|惠州|南昌|昆明|贵阳|南宁|海口|石家庄|太原|呼和浩特|兰州|银川|西宁|乌鲁木齐|拉萨|香港|澳门|台湾/,
  /Beijing|Shanghai|Guangzhou|Shenzhen|Hangzhou|Nanjing|Suzhou|Chengdu|Wuhan|Xi'an|Xian|Chongqing|Tianjin|Zhengzhou|Changsha|Hefei|Xiamen|Fuzhou|Qingdao|Jinan|Dalian|Shenyang|Ningbo|Wuxi|Foshan|Dongguan|Zhuhai|China|Mainland China|Hong Kong|Macau|Taiwan/i,
];

/**
 * Keep domestic jobs by default. Unknown/empty locations are kept because many
 * company career pages omit city text; explicit overseas/remote locations are
 * rejected before results are persisted.
 * @param {Array<import('./adapters/types.mjs').RawJob>} jobs
 * @returns {Array<import('./adapters/types.mjs').RawJob>}
 */
export function applyDomesticLocationGuard(jobs) {
  return jobs.filter((job) => {
    const text = [job.location, job.title, job.department, job.company].filter(Boolean).join(' ').trim();
    if (!text) return true;
    if (OVERSEAS_LOCATION_PATTERNS.some((pattern) => pattern.test(text))) {
      return DOMESTIC_LOCATION_PATTERNS.some((pattern) => pattern.test(text));
    }
    return true;
  });
}

/**
 * Apply a location filter without discarding jobs whose location cannot be read.
 * @param {Array<import('./adapters/types.mjs').RawJob>} jobs
 * @param {string} location
 * @returns {Array<import('./adapters/types.mjs').RawJob>}
 */
export function applyLocationFilter(jobs, location) {
  const loc = (location || '').trim();
  if (!loc) return jobs;
  return jobs.filter(job => {
    const jobLocation = (job.location || '').trim();
    return !jobLocation || jobLocation.includes(loc);
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
 * @param {{positive?: string[], negative?: string[]}} [titleFilter] - optional title keywords for this scan
 * @param {{location?: string, maxResults?: number}} [scanOptions] - user-selected scan scope
 * @returns {{ scanId: string, conflict: boolean, companiesTotal?: number }}
 */
export function createScanEntry(db, userId, companies, companyFilter, titleFilter, scanOptions) {
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

  const scanId = randomUUID();
  const positive = titleFilter?.positive || [];
  const negative = titleFilter?.negative || [];
  const location = (scanOptions?.location || '').trim();
  const maxResults = Math.min(Math.max(Number(scanOptions?.maxResults || 50), 1), 200);
  db.prepare(`
    INSERT INTO scan_queue
      (id, user_id, status, title_positive_json, title_negative_json, location_filter, max_results, companies_total, companies_done, jobs_found, jobs_new, error_log)
    VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, 0, 0, 0, '[]')
  `).run(scanId, userId, JSON.stringify(positive), JSON.stringify(negative), location, maxResults, filtered.length);

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

  // Build issue map for O(1) lookup. INFO means no matching jobs, not a scanner failure.
  const issueMap = new Map();
  for (const e of errorLog) issueMap.set(e.company, e);

  const companyStatus = companies.map((/** @type {any} */ c) => ({
    name: c.company,
    status: issueMap.has(c.company) && issueMap.get(c.company)?.level !== 'INFO' ? 'error' : 'success',
    jobsFound: c.jobs_found,
    error: issueMap.get(c.company)?.error || null,
    level: issueMap.get(c.company)?.level || null,
  }));
  for (const e of errorLog) {
    if (!companyStatus.some((/** @type {any} */ c) => c.name === e.company)) {
      companyStatus.push({
        name: e.company || 'scan',
        status: e.level === 'INFO' ? 'empty' : 'error',
        jobsFound: 0,
        error: e.error || null,
        level: e.level || null,
      });
    }
  }

  return {
    scanId: scan.id,
    status: scan.status,
    companiesDone: scan.companies_done,
    companiesTotal: scan.companies_total,
    jobsFound: scan.jobs_found,
    jobsNew: scan.jobs_new,
    companies: companyStatus,
    titleFilter: {
      positive: JSON.parse(scan.title_positive_json || '[]'),
      negative: JSON.parse(scan.title_negative_json || '[]'),
    },
    locationFilter: scan.location_filter || '',
    maxResults: scan.max_results || 50,
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
    "SELECT * FROM scan_queue WHERE user_id = ? AND status IN ('pending','running') ORDER BY updated_at DESC LIMIT 1"
  ).get(userId);
  if (!scan) return null;
  return getScanStatus(db, scan.id, userId);
}

/**
 * Query scan jobs
 * @param {any} db
 * @param {string} userId
 * @param {{ status?: string, page?: number, limit?: number, scanId?: string, after?: string, since?: string }} filters
 */
export function getScanJobs(db, userId, filters = {}) {
  const status = filters.status || 'new';
  const limit = filters.limit || 20;
  const offset = ((filters.page || 1) - 1) * limit;

  const clauses = ["user_id = ?", "status = ?"];
  const params = [userId, status];
  if (filters.scanId) {
    clauses.push("scan_id = ?");
    params.push(filters.scanId);
  }
  if (filters.after) {
    clauses.push("discovered_at > ?");
    params.push(filters.after);
  } else if (filters.since) {
    clauses.push("discovered_at >= ?");
    params.push(filters.since);
  }
  const where = clauses.join(" AND ");

  const total = db.prepare(`SELECT COUNT(*) as count FROM scan_jobs WHERE ${where}`).get(...params);

  const jobs = db.prepare(`
    SELECT * FROM scan_jobs WHERE ${where}
    ORDER BY discovered_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return { jobs, total: total.count, page: filters.page || 1 };
}

/**
 * Update job status with ownership check
 * @param {any} db
 * @param {number} jobId
 * @param {string} userId
 * @param {string} newStatus
 * @returns {{ success: boolean, error?: string }}
 */
export function updateJobStatus(db, jobId, userId, newStatus) {
  const validStatuses = ['new', 'viewed', 'saved', 'evaluating', 'evaluated', 'dismissed'];
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
 * Cancel a pending/running scan.
 * @param {any} db
 * @param {string} scanId
 * @param {string} userId
 * @returns {{ success: boolean }}
 */
export function cancelScan(db, scanId, userId) {
  const result = db.prepare(`
    UPDATE scan_queue
    SET status = 'canceled',
        error_log = '[{"company":"scan","error":"user canceled scan","level":"INFO"}]',
        updated_at = datetime('now')
    WHERE id = ? AND user_id = ? AND status IN ('pending','running')
  `).run(scanId, userId);
  return { success: result.changes > 0 };
}

/**
 * Cancel all active scans for a user.
 * @param {any} db
 * @param {string} userId
 * @returns {{ success: boolean }}
 */
export function cancelActiveScan(db, userId) {
  const result = db.prepare(`
    UPDATE scan_queue
    SET status = 'canceled',
        error_log = '[{"company":"scan","error":"user canceled scan","level":"INFO"}]',
        updated_at = datetime('now')
    WHERE user_id = ? AND status IN ('pending','running')
  `).run(userId);
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
           sq.title_positive_json, sq.title_negative_json, sq.location_filter, sq.max_results,
           (SELECT COUNT(*) FROM scan_jobs WHERE scan_id = sq.id) as total_jobs
    FROM scan_queue sq WHERE sq.user_id = ?
    ORDER BY sq.created_at DESC LIMIT ? OFFSET ?
  `).all(userId, limit, offset);

  return {
    history: scans.map((/** @type {any} */ s) => {
      let issues = [];
      try { issues = JSON.parse(s.error_log || '[]'); } catch { /* keep empty */ }
      const failedCompanies = issues.filter((/** @type {any} */ issue) => issue.level !== 'INFO');
      return {
        scanId: s.id,
        createdAt: s.created_at,
        companiesDone: s.companies_done,
        jobsFound: s.jobs_found,
        jobsNew: s.jobs_new,
        totalJobs: s.total_jobs,
        failedCompanies,
        emptyCompanies: issues.filter((/** @type {any} */ issue) => issue.level === 'INFO'),
        titleFilter: {
          positive: JSON.parse(s.title_positive_json || '[]'),
          negative: JSON.parse(s.title_negative_json || '[]'),
        },
        locationFilter: s.location_filter || '',
        maxResults: s.max_results || 50,
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
