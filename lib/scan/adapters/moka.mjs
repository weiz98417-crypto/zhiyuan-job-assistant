// @ts-check
/** Moka adapter — Playwright-based scraper with generic fallback */

/**
 * @param {import('./types.mjs').PortalCompany} company
 * @param {import('playwright').Page} page
 * @returns {Promise<import('./types.mjs').RawJob[]>}
 */
export async function fetchJobsPlaywright(company, page) {
  await page.goto(company.careers_url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for SPA hydration
  await page.waitForTimeout(5000);

  // Strategy 1: Try scrolling to load lazy content
  try {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
  } catch { /* scroll optional */ }

  // Strategy 2: Extract all job-like links from the rendered page
  const jobs = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    const seen = new Set();
    const results = [];

    for (const a of links) {
      const href = (a.href || '').toLowerCase();
      const text = (a.textContent || '').trim();
      const key = href || text;

      // Match job/position/career URLs or text
      const isJobLink = /job|position|career|招聘|职位|岗位|社招|校招/i.test(href + text);

      if (!isJobLink || !text || text.length < 3 || seen.has(key)) continue;
      seen.add(key);

      // Try to find location/department in nearby elements
      const card = a.closest('li, [class*="card"], [class*="item"], [class*="list"]');
      let location = '';
      let department = '';

      if (card) {
        const locEl = card.querySelector('[class*="location"], [class*="city"], [class*="address"], [class*="place"]');
        const deptEl = card.querySelector('[class*="department"], [class*="team"], [class*="category"], [class*="type"]');
        location = locEl?.textContent?.trim() || '';
        department = deptEl?.textContent?.trim() || '';
      }

      // Try parent text scanning for location/department clues
      const parentText = card?.textContent || '';
      if (!location) {
        const locMatch = parentText.match(/(北京|上海|深圳|广州|杭州|成都|南京|武汉|西安|厦门|苏州)/);
        if (locMatch) location = locMatch[1];
      }

      results.push({
        title: text.slice(0, 200),
        url: a.href,
        company: '',
        location,
        department,
        jd_snippet: '',
        discovered_at: new Date().toISOString(),
      });
    }

    return results.slice(0, 200);
  });

  return jobs.map(j => ({ ...j, company: company.name }));
}

export const mokaAdapter = {
  name: 'moka',
  supportsAPI: false,
  fetchJobsPlaywright,
};
