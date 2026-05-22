// @ts-check
/** Beisen (北森) adapter — Playwright-based scraper */

const DEFAULT_SELECTORS = {
  jobList: '[class*="job-list"], [class*="position-list"], .recruit-list, .list-container',
  jobCard: '[class*="job-item"], [class*="position-item"], .recruit-item, li',
  title: 'a[href], [class*="title"], h3, h4',
  location: '[class*="location"], [class*="city"], [class*="place"]',
  department: '[class*="department"], [class*="team"], [class*="category"]',
  nextPage: '[class*="next"], .pagination .next, a:has-text("下一页"), [rel="next"]',
};

/**
 * @param {import('./types.mjs').PortalCompany} company
 * @param {import('playwright').Page} page
 * @returns {Promise<import('./types.mjs').RawJob[]>}
 */
export async function fetchJobsPlaywright(company, page) {
  const selectors = { ...DEFAULT_SELECTORS, ...(company.selectors || {}) };
  const limits = { max_jobs: 200, max_pages: 50, page_wait_ms: 2000, ...(company.limits || {}) };

  await page.goto(company.careers_url, { waitUntil: 'networkidle', timeout: 30000 });

  const allJobs = [];
  let pageNum = 0;

  while (pageNum < limits.max_pages && allJobs.length < limits.max_jobs) {
    await page.waitForTimeout(limits.page_wait_ms);

    const cards = await page.$$(selectors.jobCard);
    for (const card of cards) {
      if (allJobs.length >= limits.max_jobs) break;
      try {
        const titleEl = await card.$(selectors.title);
        const link = await card.$('a[href]');
        const locEl = await card.$(selectors.location);
        const deptEl = await card.$(selectors.department);

        const url = link ? await link.getAttribute('href') : '';
        const title = titleEl ? (await titleEl.textContent() || '').trim() : '';

        if (!title || !url) continue;

        allJobs.push({
          title,
          url: resolveUrl(url, company.careers_url),
          company: company.name,
          location: locEl ? (await locEl.textContent() || '').trim() : '',
          department: deptEl ? (await deptEl.textContent() || '').trim() : '',
          jd_snippet: '',
          discovered_at: new Date().toISOString(),
        });
      } catch {
        // skip individual failures
      }
    }

    // Try to go to next page
    const nextBtn = await page.$(selectors.nextPage);
    if (nextBtn) {
      const isDisabled = await nextBtn.getAttribute('disabled');
      const classes = await nextBtn.getAttribute('class') || '';
      if (isDisabled !== null || classes.includes('disabled')) break;
      await nextBtn.click();
      pageNum++;
    } else {
      break; // no pagination found
    }
  }

  return allJobs;
}

function resolveUrl(url, base) {
  if (!url) return '';
  try { return new URL(url, base).href; } catch { return url; }
}

export const beisenAdapter = {
  name: 'beisen',
  supportsAPI: false,
  fetchJobsPlaywright,
};
