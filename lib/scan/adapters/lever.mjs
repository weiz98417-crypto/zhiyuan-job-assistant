// @ts-check
/** Lever adapter — public api.lever.co */

const FETCH_TIMEOUT_MS = 10_000;

function detectLeverSlug(url) {
  const m = url.match(/jobs\.lever\.co\/([^/?#]+)/);
  return m ? m[1] : null;
}

export async function fetchJobsAPI(company) {
  const slug = detectLeverSlug(company.careers_url);
  if (!slug) throw new Error(`Cannot detect Lever slug from ${company.careers_url}`);

  const apiUrl = `https://api.lever.co/v0/postings/${slug}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(apiUrl, { signal: controller.signal });
    if (!res.ok) throw new Error(`Lever API returned ${res.status}`);
    const json = await res.json();
    const items = Array.isArray(json) ? json : (json?.postings || json?.jobs || []);
    return items.map((/** @type {any} */ j) => ({
      title: j.text || '',
      url: j.hostedUrl || j.applyUrl || '',
      company: company.name,
      location: j.categories?.location || '',
      department: j.categories?.team || j.categories?.department || '',
      jd_snippet: j.descriptionPlain?.slice(0, 500) || '',
      discovered_at: new Date().toISOString(),
    }));
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJobsPlaywright(company, page) {
  await page.goto(company.careers_url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const jobs = await page.evaluate(() => {
    const cards = document.querySelectorAll('.posting, [class*="posting"], [class*="job"]');
    return Array.from(cards).map((el) => {
      const link = /** @type {HTMLAnchorElement|null} */ (el.querySelector('a[href]'));
      const titleEl = el.querySelector('h5, [class*="title"], a');
      const locEl = el.querySelector('[class*="location"], .workplaceTypes');
      const deptEl = el.querySelector('[class*="team"], [class*="department"], .department');
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

export const leverAdapter = {
  name: 'lever',
  supportsAPI: true,
  fetchJobsAPI,
  fetchJobsPlaywright,
};
