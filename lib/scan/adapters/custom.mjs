// @ts-check
/**
 * Custom adapter — LLM-based generic extraction for any career page.
 * Primary: Claude API structured extraction
 * Fallback: generic link scraping
 */

/**
 * @param {import('./types.mjs').PortalCompany} company
 * @param {import('playwright').Page} page
 * @returns {Promise<import('./types.mjs').RawJob[]>}
 */
export async function fetchJobsPlaywright(company, page) {
  await page.goto(company.careers_url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Try LLM extraction first (lazy import — only loads @anthropic-ai/sdk when needed)
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { extractWithLLM } = await import('./llm-extractor.mjs');
      const pageText = await page.evaluate(() => document.body.innerText || '');
      if (pageText.length > 200) {
        return await extractWithLLM(pageText, company.name, company.careers_url);
      }
    } catch (err) {
      console.error(`[custom] LLM extraction failed for ${company.name}: ${err.message}, falling back to generic`);
    }
  }

  // Fallback: generic link extraction
  return await genericExtract(page, company);
}

/**
 * Generic fallback: extract all job-like links from the page
 */
async function genericExtract(page, company) {
  const jobs = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    return links
      .filter(a => {
        const href = (a.getAttribute('href') || '').toLowerCase();
        const text = (a.textContent || '').trim();
        return /job|position|career|招聘|职位|岗位/i.test(href + text) && text.length > 2;
      })
      .map(a => ({
        title: (a.textContent || '').trim().slice(0, 200),
        url: a.href || '',
        company: '',
        location: '',
        department: '',
        jd_snippet: '',
        discovered_at: new Date().toISOString(),
      }))
      .slice(0, 200);
  });

  return jobs.map(j => ({ ...j, company: company.name }));
}

export const customAdapter = {
  name: 'custom',
  supportsAPI: false,
  fetchJobsPlaywright,
};
