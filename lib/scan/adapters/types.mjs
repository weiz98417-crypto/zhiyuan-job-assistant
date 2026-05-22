// @ts-check
/**
 * Scan adapter types (JSDoc, usable from both .mjs and .ts)
 *
 * @typedef {Object} PortalCompany
 * @property {string} name
 * @property {string} careers_url
 * @property {'moka'|'beisen'|'greenhouse'|'lever'|'custom'} ats_type
 * @property {Object} [selectors]
 * @property {Object} [limits]
 * @property {number} [limits.max_jobs] max jobs per company
 * @property {number} [limits.max_scrolls] max scrolls (moka) or pages (beisen)
 * @property {number} [limits.scroll_wait_ms] wait between scrolls (moka) or pages (beisen)
 */

/**
 * @typedef {Object} RawJob
 * @property {string} title
 * @property {string} url
 * @property {string} company
 * @property {string} [location]
 * @property {string} [department]
 * @property {string} [jd_snippet]
 * @property {string} discovered_at
 */

/**
 * @typedef {Object} ScanAdapter
 * @property {string} name
 * @property {boolean} supportsAPI
 * @property {function(PortalCompany): Promise<RawJob[]>} [fetchJobsAPI]
 * @property {function(PortalCompany, import('playwright').Page): Promise<RawJob[]>} fetchJobsPlaywright
 */

export {};
