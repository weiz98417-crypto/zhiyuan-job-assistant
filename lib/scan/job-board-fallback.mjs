// @ts-check

const BOARD_TIMEOUT_MS = Number(process.env.SCAN_BOARD_TIMEOUT_MS || 18_000);

const CITY_CODES_51JOB = new Map([
  ["北京", "010000"],
  ["上海", "020000"],
  ["广州", "030200"],
  ["深圳", "040000"],
  ["杭州", "080200"],
  ["南京", "070200"],
  ["苏州", "070300"],
  ["成都", "090200"],
  ["武汉", "180200"],
  ["西安", "200200"],
]);

const LIEPIN_CITY_CODES = new Map([
  ["北京", "010"],
  ["上海", "020"],
  ["广州", "050020"],
  ["深圳", "050090"],
  ["杭州", "070020"],
  ["南京", "060020"],
  ["苏州", "060080"],
  ["成都", "280020"],
  ["武汉", "170020"],
  ["西安", "270020"],
]);

function uniqByUrl(jobs) {
  const seen = new Set();
  const out = [];
  for (const job of jobs) {
    if (!job.url || seen.has(job.url)) continue;
    seen.add(job.url);
    out.push(job);
  }
  return out;
}

function positiveWords(titleFilter) {
  return (titleFilter?.positive || []).filter(Boolean).slice(0, 4);
}

function negativeWords(titleFilter) {
  return (titleFilter?.negative || []).filter(Boolean);
}

function queryFrom(titleFilter) {
  return positiveWords(titleFilter).join(" ");
}

function cityParam(scope) {
  return (scope?.location || "").trim();
}

function normalizeLocation(location) {
  const loc = (location || "").trim();
  if (!loc) return "";
  const known = [...CITY_CODES_51JOB.keys()].find((name) => loc.includes(name));
  return known || loc;
}

function maxResults(scope) {
  return Math.min(Math.max(Number(scope?.maxResults || 50), 1), 200);
}

function limited(jobs, scope) {
  return jobs.slice(0, maxResults(scope));
}

function normalizeUrl(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return "";
  }
}

function matchesTitle(title, titleFilter) {
  const haystack = (title || "").toLowerCase();
  const positives = positiveWords(titleFilter).map((kw) => kw.toLowerCase());
  const negatives = negativeWords(titleFilter).map((kw) => kw.toLowerCase());
  if (negatives.some((kw) => haystack.includes(kw))) return false;
  return positives.length === 0 || positives.some((kw) => haystack.includes(kw));
}

async function gotoSearch(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: BOARD_TIMEOUT_MS });
  await page.waitForTimeout(5000);
}

async function pageBlocked(page) {
  const title = await page.title().catch(() => "");
  const text = await page.locator("body").textContent({ timeout: 3000 }).catch(() => "");
  const sample = `${title}\n${text || ""}`;
  return /验证码|安全验证|Security Verification|行为异常|captcha|验证连接安全性/i.test(sample);
}

async function searchLiepin(context, titleFilter, scope) {
  const query = encodeURIComponent(queryFrom(titleFilter));
  const normalizedCity = normalizeLocation(cityParam(scope));
  const cityCode = LIEPIN_CITY_CODES.get(normalizedCity) || "000";
  const url = `https://www.liepin.com/zhaopin/?city=${cityCode}&dq=${cityCode}&key=${query}&currentPage=0`;
  const page = await context.newPage();
  try {
    await gotoSearch(page, url);
    if (await pageBlocked(page)) {
      throw new Error("blocked_by_captcha");
    }
    const jobs = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".job-card-pc-container, [class*='job-card']"));
      return cards.map((card) => {
        const titleEl = card.querySelector(".job-title-box > .ellipsis-1, .job-title, [class*='title']");
        const linkEl = card.querySelector("a[href]");
        const companyEl = card.querySelector(".company-name, .company-name-box, [class*='company']");
        const locationEl = card.querySelector(".job-dq-box, [class*='dq'], [class*='location']");
        const salaryEl = card.querySelector(".job-salary, [class*='salary']");
        const title = (titleEl?.textContent || "").replace(/\s+/g, " ").trim();
        const href = linkEl?.getAttribute("href") || "";
        if (!title || !href) return null;
        return {
          title,
          url: new URL(href, location.href).href,
          company: (companyEl?.textContent || "猎聘").replace(/\s+/g, " ").trim(),
          location: (locationEl?.textContent || "").replace(/\s+/g, " ").trim(),
          department: "",
          jd_snippet: (salaryEl?.textContent || "").replace(/\s+/g, " ").trim(),
          discovered_at: new Date().toISOString(),
        };
      }).filter(Boolean);
    });
    return limited(jobs.filter((job) => matchesTitle(job.title, titleFilter)), scope);
  } finally {
    await page.close().catch(() => {});
  }
}

async function search51Job(context, titleFilter, scope) {
  const query = encodeURIComponent(queryFrom(titleFilter));
  const cityCode = CITY_CODES_51JOB.get(normalizeLocation(cityParam(scope))) || "000000";
  const url = `https://we.51job.com/pc/search?jobArea=${cityCode}&keyword=${query}&searchType=2&sortType=0&metro=`;
  const page = await context.newPage();
  try {
    await gotoSearch(page, url);
    if (await pageBlocked(page)) {
      throw new Error("blocked_by_captcha");
    }
    const jobs = await page.evaluate(() => {
      const collect = (root) => {
        const cards = Array.from(root.querySelectorAll(".joblist-item, .j_joblist, [class*='joblist'], [class*='job-card']"));
        const fromCards = cards.map((card) => {
          const titleEl = card.querySelector(".jname, .job-title, [class*='jobName'], [class*='title']");
          const linkEl = card.querySelector("a[href*='jobs.51job.com'], a[href*='we.51job.com'], a[href]");
          const companyEl = card.querySelector(".cname, .company-name, [class*='company']");
          const locationEl = card.querySelector(".area, .job-area, [class*='area']");
          const salaryEl = card.querySelector(".sal, .salary, [class*='salary']");
          const title = (titleEl?.textContent || "").replace(/\s+/g, " ").trim();
          const href = linkEl?.getAttribute("href") || "";
          if (!title || !href) return null;
          return {
            title,
            url: new URL(href, location.href).href,
            company: (companyEl?.textContent || "前程无忧").replace(/\s+/g, " ").trim(),
            location: (locationEl?.textContent || "").replace(/\s+/g, " ").trim(),
            department: "",
            jd_snippet: (salaryEl?.textContent || "").replace(/\s+/g, " ").trim(),
            discovered_at: new Date().toISOString(),
          };
        }).filter(Boolean);
        if (fromCards.length) return fromCards;

        return Array.from(root.querySelectorAll("a[href*='jobs.51job.com'], a[href*='we.51job.com']")).map((a) => ({
          title: (a.textContent || "").replace(/\s+/g, " ").trim(),
          url: a.href,
          company: "前程无忧",
          location: "",
          department: "",
          jd_snippet: "",
          discovered_at: new Date().toISOString(),
        })).filter((job) => job.title.length > 1);
      };

      const jobs = collect(document);
      if (jobs.length) return jobs;

      const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
      const linkMatches = Array.from(text.matchAll(/https?:\/\/[^\s"'<>]+/g)).map((m) => m[0]);
      return linkMatches.slice(0, 20).map((href) => ({
        title: "51job职位",
        url: href,
        company: "前程无忧",
        location: "",
        department: "",
        jd_snippet: "",
        discovered_at: new Date().toISOString(),
      }));
    });
    return limited(jobs.filter((job) => matchesTitle(job.title, titleFilter)), scope);
  } finally {
    await page.close().catch(() => {});
  }
}

async function searchZhaopin(context, titleFilter, scope) {
  const query = encodeURIComponent(queryFrom(titleFilter));
  const city = encodeURIComponent(normalizeLocation(cityParam(scope)));
  const url = city ? `https://sou.zhaopin.com/?kw=${query}&jl=${city}` : `https://sou.zhaopin.com/?kw=${query}`;
  const page = await context.newPage();
  try {
    await gotoSearch(page, url);
    if (await pageBlocked(page)) {
      throw new Error("blocked_by_captcha");
    }
    const jobs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a[href*='jobs.zhaopin.com'], a[href*='sou.zhaopin.com/jobs']"))
        .map((a) => ({
          title: (a.textContent || "").replace(/\s+/g, " ").trim(),
          url: a.href,
          company: "智联招聘",
          location: "",
          department: "",
          jd_snippet: "",
          discovered_at: new Date().toISOString(),
        }))
        .filter((job) => job.title.length > 1);
    });
    return limited(jobs.filter((job) => matchesTitle(job.title, titleFilter)), scope);
  } finally {
    await page.close().catch(() => {});
  }
}

export async function scanJobBoards(context, titleFilter, scope = {}) {
  const scanners = [
    { name: "猎聘", fn: searchLiepin },
    { name: "前程无忧", fn: search51Job },
    { name: "智联招聘", fn: searchZhaopin },
  ];
  const results = [];
  const errors = [];
  for (const scanner of scanners) {
    if (results.length >= maxResults(scope)) break;
    try {
      const jobs = await scanner.fn(context, titleFilter, { ...scope, maxResults: maxResults(scope) - results.length });
      results.push(...jobs);
      if (jobs.length === 0) {
        errors.push({ company: scanner.name, error: "zero matching results", level: "INFO" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({
        company: scanner.name,
        error: message === "blocked_by_captcha" ? "平台触发安全验证，无法自动抓取" : message,
        level: message === "blocked_by_captcha" ? "WARN" : "ERROR",
      });
    }
  }
  return { jobs: limited(uniqByUrl(results), scope), errors };
}
