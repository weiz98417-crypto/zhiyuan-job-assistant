// @ts-check
/** Greenhouse adapter — public boards-api.greenhouse.io */

const FETCH_TIMEOUT_MS = 10_000;

/**
 * Detect Greenhouse board slug from careers_url
 * @param {string} url
 * @returns {string|null}
 */
function detectBoardSlug(url) {
  const m = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
  return m ? m[1] : null;
}

/**
 * @param {import('./types.mjs').PortalCompany} company
 * @returns {Promise<import('./types.mjs').RawJob[]>}
 */
export async function fetchJobsAPI(company) {
  const slug = detectBoardSlug(company.careers_url);
  if (!slug) throw new Error(`Cannot detect Greenhouse board slug from ${company.careers_url}`);

  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(apiUrl, { signal: controller.signal });
    if (!res.ok) throw new Error(`Greenhouse API returned ${res.status}`);
    const json = await res.json();
    const jobs = json.jobs || [];
    return jobs.map((/** @type {any} */ j) => ({
      title: j.title || '',
      url: j.absolute_url || '',
      company: company.name,
      location: j.location?.name || '',
      department: j.departments?.[0]?.name || '',
      jd_snippet: '',
      discovered_at: new Date().toISOString(),
    }));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {import('./types.mjs').PortalCompany} company
 * @param {import('playwright').Page} page
 * @returns {Promise<import('./types.mjs').RawJob[]>}
 */
export async function fetchJobsPlaywright(company, page) {
  // Greenhouse has public API, Playwright is fallback — navigate to board page
  await page.goto(company.careers_url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const jobs = await page.evaluate(() => {
    const cards = document.querySelectorAll('.opening, [class*="job-post"], [class*="opening"]');
    return Array.from(cards).map((el) => {
      const link = /** @type {HTMLAnchorElement|null} */ (el.querySelector('a[href]'));
      const titleEl = el.querySelector('[class*="title"], h2, h3, a');
      const locEl = el.querySelector('[class*="location"]');
      const deptEl = el.querySelector('[class*="department"]');
      return {
        title: titleEl?.textContent?.trim() || '',
        url: link?.href || '',
        company: '',
        location: locEl?.textContent?.trim() || '',
        department: deptEl?.textContent?.trim() || '',
        jd_snippet: '',
        discovered_at: new Date().toISOString(),
      };
    }).filter(j => j.url);
  });

  return jobs.map(j => ({ ...j, company: company.name }));
}

export const greenhouseAdapter = {
  name: 'greenhouse',
  supportsAPI: true,
  fetchJobsAPI,
  fetchJobsPlaywright,
};
