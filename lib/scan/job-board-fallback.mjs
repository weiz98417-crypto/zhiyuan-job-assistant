// @ts-check

import { applyDomesticLocationGuard } from "./orchestrator.mjs";
import {
  buildSearchIndexQueries,
  filterRoleQuality,
  matchesExpandedJob,
  primaryQueryFromTitleFilter,
} from "./query-expansion.mjs";

const BOARD_TIMEOUT_MS = Number(process.env.SCAN_BOARD_TIMEOUT_MS || 18_000);
const SEARCH_INDEX_TIMEOUT_MS = Number(process.env.SCAN_SEARCH_INDEX_TIMEOUT_MS || 12_000);
const SEARCH_INDEX_QUERY_LIMIT = Math.min(Math.max(Number(process.env.SCAN_SEARCH_INDEX_QUERY_LIMIT || 4), 1), 12);
const SEARCH_INDEX_VERIFY_LIMIT = Math.min(Math.max(Number(process.env.SCAN_SEARCH_INDEX_VERIFY_LIMIT || 6), 0), 30);
const SOURCE_RESULT_QUOTA = Math.min(Math.max(Number(process.env.SCAN_SOURCE_RESULT_QUOTA || 12), 1), 50);

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

const BOSS_CITY_CODES = new Map([
  ["北京", "101010100"],
  ["上海", "101020100"],
  ["广州", "101280100"],
  ["深圳", "101280600"],
  ["杭州", "101210100"],
  ["南京", "101190100"],
  ["苏州", "101190400"],
  ["成都", "101270100"],
  ["武汉", "101200100"],
  ["西安", "101110100"],
  ["重庆", "101040100"],
  ["天津", "101030100"],
  ["郑州", "101180100"],
  ["长沙", "101250100"],
  ["合肥", "101220100"],
  ["厦门", "101230201"],
  ["福州", "101230101"],
  ["青岛", "101120200"],
  ["济南", "101120101"],
  ["宁波", "101210400"],
  ["无锡", "101190200"],
  ["佛山", "101280800"],
  ["东莞", "101281600"],
  ["珠海", "101280701"],
]);

const DOMESTIC_CITY_NAMES = [
  ...BOSS_CITY_CODES.keys(),
  "全国",
  "中国",
  "远程",
];

const SEARCH_INDEX_DOMAINS = [
  "zhipin.com",
  "zhaopin.com",
  "liepin.com",
  "51job.com",
  "lagou.com",
  "kanzhun.com",
  "nowcoder.com",
  "maimai.cn",
  "dajie.com",
  "shixiseng.com",
];

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

function queryFrom(titleFilter) {
  return primaryQueryFromTitleFilter(titleFilter);
}

function cityParam(scope) {
  return (scope?.location || "").trim();
}

function normalizeLocation(location) {
  const loc = (location || "").trim();
  if (!loc) return "";
  const knownDomestic = DOMESTIC_CITY_NAMES.find((name) => loc.includes(name));
  if (knownDomestic) return knownDomestic;
  return loc;
}

function maxResults(scope) {
  return Math.min(Math.max(Number(scope?.maxResults || 50), 1), 200);
}

function limited(jobs, scope) {
  return jobs.slice(0, maxResults(scope));
}

function sourceLimited(jobs, scope) {
  return jobs.slice(0, Math.min(maxResults(scope), SOURCE_RESULT_QUOTA));
}

function decorateSource(jobs, sourceName, sourceType, verificationStatus = "verified_jd", extra = {}) {
  return jobs.map((job) => ({
    ...job,
    source_name: job.source_name || sourceName,
    source_type: job.source_type || sourceType,
    source_url: job.source_url || job.url || "",
    verification_status: job.verification_status || verificationStatus,
    source_metadata: { ...(job.source_metadata || {}), ...extra },
  }));
}

function looksBlockedText(value) {
  return /验证码|安全验证|访问异常|访问过于频繁|行为异常|CF_APP_WAF|appkey|captcha|verify|robot/i.test(String(value || ""));
}

function cleanBlockedSnippet(job) {
  const snippet = job.jd_snippet || "";
  if (!looksBlockedText(snippet)) return job;
  return {
    ...job,
    jd_snippet: "",
    verification_status: "blocked_detail",
    source_metadata: { ...(job.source_metadata || {}), blocked_reason: "detail_waf_text" },
  };
}

function finalizeSourceJobs(jobs, titleFilter, scope, sourceName, sourceType, verificationStatus = "verified_jd", extra = {}) {
  const matched = jobs
    .map(cleanBlockedSnippet)
    .filter((job) => matchesExpandedJob(job, titleFilter));
  return sourceLimited(
    applyDomesticLocationGuard(filterRoleQuality(decorateSource(matched, sourceName, sourceType, verificationStatus, extra))),
    scope,
  );
}

async function gotoSearch(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: BOARD_TIMEOUT_MS });
  await page.waitForTimeout(5000);
}

async function gotoSearchIndex(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: SEARCH_INDEX_TIMEOUT_MS });
  await page.waitForTimeout(2500);
}

async function pageBlocked(page) {
  const title = await page.title().catch(() => "");
  const text = await page.locator("body").textContent({ timeout: 3000 }).catch(() => "");
  const sample = `${title}\n${text || ""}`;
  return /验证码|安全验证|行为异常|访问过于频繁|登录后继续|Security Verification|captcha|verify|robot/i.test(sample);
}

function sourceLabel(url) {
  const hostname = (() => {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
  })();
  if (hostname.includes("zhipin.com")) return "BOSS直聘";
  if (hostname.includes("zhaopin.com")) return "智联招聘";
  if (hostname.includes("liepin.com")) return "猎聘";
  if (hostname.includes("51job.com")) return "前程无忧";
  if (hostname.includes("lagou.com")) return "拉勾";
  if (hostname.includes("kanzhun.com")) return "看准";
  if (hostname.includes("nowcoder.com")) return "牛客";
  if (hostname.includes("maimai.cn")) return "脉脉";
  if (hostname.includes("dajie.com")) return "大街网";
  if (hostname.includes("shixiseng.com")) return "实习僧";
  return "搜索索引线索";
}

async function extractGenericJobs(page, sourceName, sourceHint) {
  return page.evaluate(({ sourceName, sourceHint }) => {
    const jobHrefRe = /job|jobs|position|career|zhaopin|recruit|post/i;
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    return anchors.map((a) => {
      const href = a.getAttribute("href") || "";
      const text = (a.textContent || "").replace(/\s+/g, " ").trim();
      if (!href || !text || text.length < 3 || text.length > 120) return null;
      if (!jobHrefRe.test(href) && !jobHrefRe.test(text)) return null;
      const card = a.closest("li, article, section, div") || a;
      const cardText = (card.textContent || "").replace(/\s+/g, " ").trim();
      return {
        title: text,
        url: new URL(href, location.href).href,
        company: sourceName,
        location: "",
        department: sourceHint,
        jd_snippet: cardText.slice(0, 220),
        discovered_at: new Date().toISOString(),
      };
    }).filter(Boolean);
  }, { sourceName, sourceHint });
}

async function searchBoss(context, titleFilter, scope) {
  const query = encodeURIComponent(queryFrom(titleFilter));
  const normalizedCity = normalizeLocation(cityParam(scope));
  const cityCode = BOSS_CITY_CODES.get(normalizedCity) || "100010000";
  const url = `https://www.zhipin.com/web/geek/job?query=${query}&city=${cityCode}`;
  const page = await context.newPage();
  try {
    await gotoSearch(page, url);
    if (await pageBlocked(page)) throw new Error("blocked_by_captcha");
    const jobs = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll([
        ".job-card-wrapper",
        ".job-list-box li",
        ".job-primary",
        "li[class*='job-card']",
        "a[href*='/job_detail/']",
      ].join(",")));
      const uniqueCards = Array.from(new Set(cards.map((node) => (
        node instanceof HTMLAnchorElement ? node.closest(".job-card-wrapper, li, .job-primary") || node : node
      ))));
      return uniqueCards.map((card) => {
        const titleEl = card.querySelector(".job-name, .job-title, [class*='job-name'], [class*='job-title']");
        const linkEl = card.querySelector("a[href*='/job_detail/'], a[href]");
        const companyEl = card.querySelector(".company-name, [class*='company-name'], [class*='brand-name']");
        const locationEl = card.querySelector(".job-area, .job-location, [class*='job-area'], [class*='location']");
        const salaryEl = card.querySelector(".salary, [class*='salary'], .red");
        const title = (titleEl?.textContent || linkEl?.textContent || "").replace(/\s+/g, " ").trim();
        const href = linkEl?.getAttribute("href") || "";
        if (!title || !href || !href.includes("job_detail")) return null;
        const company = (companyEl?.textContent || "BOSS直聘").replace(/\s+/g, " ").trim();
        const location = (locationEl?.textContent || "").replace(/\s+/g, " ").trim();
        const salary = (salaryEl?.textContent || "").replace(/\s+/g, " ").trim();
        return {
          title,
          url: new URL(href, location.href).href,
          company,
          location,
          department: "来源：BOSS直聘",
          jd_snippet: [salary, "平台：BOSS直聘"].filter(Boolean).join(" ｜ "),
          discovered_at: new Date().toISOString(),
        };
      }).filter(Boolean);
    });
    return finalizeSourceJobs(jobs, titleFilter, scope, "BOSS直聘", "job_board");
  } finally {
    await page.close().catch(() => {});
  }
}

async function searchLiepin(context, titleFilter, scope) {
  const query = encodeURIComponent(queryFrom(titleFilter));
  const normalizedCity = normalizeLocation(cityParam(scope));
  const cityCode = LIEPIN_CITY_CODES.get(normalizedCity) || "000";
  const url = `https://www.liepin.com/zhaopin/?city=${cityCode}&dq=${cityCode}&key=${query}&currentPage=0`;
  const page = await context.newPage();
  try {
    await gotoSearch(page, url);
    if (await pageBlocked(page)) throw new Error("blocked_by_captcha");
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
          department: "来源：猎聘",
          jd_snippet: (salaryEl?.textContent || "").replace(/\s+/g, " ").trim(),
          discovered_at: new Date().toISOString(),
        };
      }).filter(Boolean);
    });
    return finalizeSourceJobs(jobs, titleFilter, scope, "猎聘", "job_board");
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
    if (await pageBlocked(page)) throw new Error("blocked_by_captcha");
    const jobs = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".joblist-item, .j_joblist, [class*='joblist'], [class*='job-card']"));
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
          department: "来源：前程无忧",
          jd_snippet: (salaryEl?.textContent || "").replace(/\s+/g, " ").trim(),
          discovered_at: new Date().toISOString(),
        };
      }).filter(Boolean);
      if (fromCards.length) return fromCards;
      return Array.from(document.querySelectorAll("a[href*='jobs.51job.com'], a[href*='we.51job.com']")).map((a) => ({
        title: (a.textContent || "").replace(/\s+/g, " ").trim(),
        url: a.href,
        company: "前程无忧",
        location: "",
        department: "来源：前程无忧",
        jd_snippet: "",
        discovered_at: new Date().toISOString(),
      })).filter((job) => job.title.length > 1);
    });
    return finalizeSourceJobs(jobs, titleFilter, scope, "前程无忧", "job_board");
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
    if (await pageBlocked(page)) throw new Error("blocked_by_captcha");
    const jobs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a[href*='jobs.zhaopin.com'], a[href*='sou.zhaopin.com/jobs']"))
        .map((a) => ({
          title: (a.textContent || "").replace(/\s+/g, " ").trim(),
          url: a.href,
          company: "智联招聘",
          location: "",
          department: "来源：智联招聘",
          jd_snippet: "",
          discovered_at: new Date().toISOString(),
        }))
        .filter((job) => job.title.length > 1);
    });
    return finalizeSourceJobs(jobs, titleFilter, scope, "智联招聘", "job_board");
  } finally {
    await page.close().catch(() => {});
  }
}

async function searchLagou(context, titleFilter, scope) {
  const query = encodeURIComponent(queryFrom(titleFilter));
  const city = encodeURIComponent(normalizeLocation(cityParam(scope)) || "全国");
  const url = `https://www.lagou.com/wn/jobs?kd=${query}&city=${city}`;
  const page = await context.newPage();
  try {
    await gotoSearch(page, url);
    if (await pageBlocked(page)) throw new Error("blocked_by_captcha");
    const jobs = await extractGenericJobs(page, "拉勾", "来源：拉勾");
    return finalizeSourceJobs(jobs, titleFilter, scope, "拉勾", "job_board");
  } finally {
    await page.close().catch(() => {});
  }
}

async function searchKanzhun(context, titleFilter, scope) {
  const query = encodeURIComponent([normalizeLocation(cityParam(scope)), queryFrom(titleFilter)].filter(Boolean).join(" "));
  const url = `https://www.kanzhun.com/search?query=${query}`;
  const page = await context.newPage();
  try {
    await gotoSearch(page, url);
    if (await pageBlocked(page)) throw new Error("blocked_by_captcha");
    const jobs = await extractGenericJobs(page, "看准", "来源：看准");
    return finalizeSourceJobs(jobs, titleFilter, scope, "看准", "job_board");
  } finally {
    await page.close().catch(() => {});
  }
}

async function searchNowcoder(context, titleFilter, scope) {
  const query = encodeURIComponent([normalizeLocation(cityParam(scope)), queryFrom(titleFilter)].filter(Boolean).join(" "));
  const url = `https://www.nowcoder.com/jobs/recommend?query=${query}`;
  const page = await context.newPage();
  try {
    await gotoSearch(page, url);
    if (await pageBlocked(page)) throw new Error("blocked_by_captcha");
    const jobs = await extractGenericJobs(page, "牛客", "来源：牛客");
    return finalizeSourceJobs(jobs, titleFilter, scope, "牛客", "job_board");
  } finally {
    await page.close().catch(() => {});
  }
}

async function searchMaimai(context, titleFilter, scope) {
  const query = encodeURIComponent([normalizeLocation(cityParam(scope)), queryFrom(titleFilter)].filter(Boolean).join(" "));
  const url = `https://maimai.cn/jobs/search?query=${query}`;
  const page = await context.newPage();
  try {
    await gotoSearch(page, url);
    if (await pageBlocked(page)) throw new Error("blocked_by_captcha");
    const jobs = await extractGenericJobs(page, "脉脉", "来源：脉脉");
    return finalizeSourceJobs(jobs, titleFilter, scope, "脉脉", "job_board");
  } finally {
    await page.close().catch(() => {});
  }
}

async function verifySearchIndexLead(page, lead, titleFilter) {
  const source = sourceLabel(lead.url);
  try {
    await gotoSearchIndex(page, lead.url);
    if (await pageBlocked(page)) {
      return {
        ...lead,
        source_name: source,
        source_type: "search_index",
        verification_status: "blocked_detail",
        jd_snippet: "",
        source_metadata: {
          ...(lead.source_metadata || {}),
          verify_error: "blocked_detail",
        },
      };
    }

    const detail = await page.evaluate(() => {
      const selectors = [
        ".job-sec",
        ".detail-content",
        ".job-detail",
        ".job-description",
        ".content-word",
        ".bmsg.job_msg",
        ".job_msg",
        ".position-content",
        ".job-content",
        "main",
      ];
      const node = selectors.map((selector) => document.querySelector(selector)).find(Boolean) || document.body;
      const titleNode = document.querySelector("h1, .job-name, .job-title, [class*='job-title'], [class*='position-title']");
      const companyNode = document.querySelector(".company-name, [class*='company-name'], [class*='brand-name'], [class*='company']");
      const locationNode = document.querySelector(".job-area, .job-location, [class*='location'], [class*='area']");
      return {
        title: (titleNode?.textContent || "").replace(/\s+/g, " ").trim(),
        company: (companyNode?.textContent || "").replace(/\s+/g, " ").trim(),
        location: (locationNode?.textContent || "").replace(/\s+/g, " ").trim(),
        text: (node?.textContent || "").replace(/\s+/g, " ").trim(),
      };
    });

    const upgraded = {
      ...lead,
      title: detail.title || lead.title,
      company: detail.company || source,
      location: detail.location || lead.location,
      department: `${source}｜搜索索引二次验证`,
      jd_snippet: detail.text.slice(0, 500),
      source_name: source,
      source_type: "search_index_verified",
      verification_status: "verified_jd",
      source_metadata: {
        ...(lead.source_metadata || {}),
        verified_from_search_index: true,
      },
    };

    if (detail.text.length >= 120 && matchesExpandedJob(upgraded, titleFilter)) {
      return upgraded;
    }

    return {
      ...lead,
      source_name: source,
      source_type: "search_index",
      verification_status: "lead",
      source_metadata: {
        ...(lead.source_metadata || {}),
        verify_error: "insufficient_or_unmatched_detail",
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...lead,
      source_name: source,
      source_type: "search_index",
      verification_status: "lead",
      source_metadata: {
        ...(lead.source_metadata || {}),
        verify_error: message.slice(0, 160),
      },
    };
  }
}

async function searchIndexLeads(context, titleFilter, scope) {
  const queries = buildSearchIndexQueries(titleFilter, scope).slice(0, SEARCH_INDEX_QUERY_LIMIT);
  const jobs = [];
  const page = await context.newPage();
  try {
    for (const query of queries) {
      if (jobs.length >= maxResults(scope)) break;
      const engines = [
        `https://www.so.com/s?q=${encodeURIComponent(query)}`,
        `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`,
      ];
      for (const url of engines) {
        if (jobs.length >= maxResults(scope)) break;
        try {
          await gotoSearchIndex(page, url);
          if (await pageBlocked(page)) continue;
          const leads = await page.evaluate((domains) => {
            const anchors = Array.from(document.querySelectorAll("a[href]"));
            return anchors.map((a) => {
              const href = a.getAttribute("mu") || a.getAttribute("data-url") || a.getAttribute("href") || "";
              const text = (a.textContent || "").replace(/\s+/g, " ").trim();
              const absoluteUrl = href ? new URL(href, location.href).href : "";
              const combined = `${absoluteUrl} ${text}`;
              if (!domains.some((domain) => combined.includes(domain))) return null;
              if (!text || text.length < 4) return null;
              return {
                title: text.slice(0, 80),
                url: absoluteUrl,
                company: "搜索索引线索",
                location: "",
                department: "待校验线索｜搜索索引",
                jd_snippet: "从国内搜索索引发现，需打开原链接确认 JD 是否仍有效。",
                discovered_at: new Date().toISOString(),
              };
            }).filter(Boolean);
          }, SEARCH_INDEX_DOMAINS);
          for (const lead of leads) {
            const source = sourceLabel(lead.url);
            jobs.push({
              ...lead,
              company: source,
              department: `${source}｜待校验线索｜搜索索引`,
            });
          }
        } catch {
          // Search-index leads are opportunistic; direct platform scanners carry the error signal.
        }
      }
    }
    const matchedLeads = uniqByUrl(jobs.filter((job) => matchesExpandedJob(job, titleFilter)));
    const verifyPage = await context.newPage();
    const verifiedJobs = [];
    try {
      for (const lead of matchedLeads) {
        if (verifiedJobs.length < SEARCH_INDEX_VERIFY_LIMIT) {
          verifiedJobs.push(await verifySearchIndexLead(verifyPage, lead, titleFilter));
        } else {
          verifiedJobs.push(lead);
        }
      }
    } finally {
      await verifyPage.close().catch(() => {});
    }
    return sourceLimited(
      applyDomesticLocationGuard(filterRoleQuality(decorateSource(
        verifiedJobs,
        "搜索索引线索",
        "search_index",
        "lead",
      ))),
      scope,
    );
  } finally {
    await page.close().catch(() => {});
  }
}

export async function scanJobBoards(context, titleFilter, scope = {}) {
  const scanners = [
    { name: "BOSS直聘", fn: searchBoss },
    { name: "智联招聘", fn: searchZhaopin },
    { name: "猎聘", fn: searchLiepin },
    { name: "前程无忧", fn: search51Job },
    { name: "拉勾", fn: searchLagou },
    { name: "看准", fn: searchKanzhun },
    { name: "牛客", fn: searchNowcoder },
    { name: "脉脉", fn: searchMaimai },
    { name: "搜索索引线索", fn: searchIndexLeads },
  ];
  const results = [];
  const errors = [];
  for (const scanner of scanners) {
    if (results.length >= maxResults(scope)) break;
    try {
      const jobs = await scanner.fn(context, titleFilter, { ...scope, maxResults: Math.min(SOURCE_RESULT_QUOTA, maxResults(scope) - results.length) });
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
  return { jobs: limited(applyDomesticLocationGuard(uniqByUrl(results)), scope), errors };
}
