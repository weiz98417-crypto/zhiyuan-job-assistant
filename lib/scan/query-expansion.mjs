// @ts-check

/**
 * @typedef {{ positive?: unknown[], negative?: unknown[] }} TitleFilter
 * @typedef {{
 *   title?: unknown,
 *   company?: unknown,
 *   department?: unknown,
 *   location?: unknown,
 *   jd_snippet?: unknown,
 *   snippet?: unknown,
 *   source_metadata?: Object,
 * }} JobLike
 * @typedef {{ location?: unknown, maxResults?: unknown }} SearchScope
 */

const AI_PRODUCT_VARIANTS = [
  "AI 产品经理",
  "AI产品经理",
  "人工智能产品经理",
  "大模型产品经理",
  "AIGC 产品经理",
  "AIGC产品经理",
  "智能产品经理",
  "智能体产品经理",
  "Agent 产品经理",
  "AI 应用产品经理",
  "AI平台产品经理",
  "AI 平台产品经理",
  "算法产品经理",
  "数据产品经理",
  "AI 产品专家",
  "大模型产品专家",
  "AIGC 产品专家",
  "AI 解决方案产品经理",
  "Copilot 产品经理",
  "知识库产品经理",
  "产品经理 AI",
  "产品经理 大模型",
];

const PRODUCT_ROLE_VARIANTS = [
  "产品经理",
  "高级产品经理",
  "产品专家",
  "产品负责人",
];

const AI_SIGNAL_RE = /(?:\bai\b|人工智能|大模型|aigc|智能体|agent|copilot|算法|机器学习|nlp|llm)/i;
const PRODUCT_SIGNAL_RE = /产品|pm|product/i;
const ENGINEERING_ROLE_RE = /(?:工程师|研发|后端|前端|客户端|算法|测试|开发|架构师|运维|SRE|全栈|iOS|安卓|Android|Java|Go|Python|C\+\+|engineer|developer|backend|frontend|algorithm|qa|test)/i;
const PRODUCT_ROLE_RE = /(?:产品经理|产品专家|产品负责人|策略产品|平台产品|商业化产品|Product\s*Manager|\bPM\b)/i;

/** @param {unknown} value */
function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

/** @param {unknown} value */
function compact(value) {
  return clean(value).replace(/\s+/g, "").toLowerCase();
}

/** @param {unknown[]} values */
function unique(values) {
  const seen = new Set();
  const out = [];
  for (const value of values.map(clean).filter(Boolean)) {
    const key = compact(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/** @param {TitleFilter | undefined | null} titleFilter */
export function positiveWords(titleFilter) {
  return Array.isArray(titleFilter?.positive) ? titleFilter.positive.map(clean).filter(Boolean) : [];
}

/** @param {TitleFilter | undefined | null} titleFilter */
export function negativeWords(titleFilter) {
  return Array.isArray(titleFilter?.negative) ? titleFilter.negative.map(clean).filter(Boolean) : [];
}

/** @param {TitleFilter | undefined | null} titleFilter */
export function expandTitleFilter(titleFilter) {
  const positives = positiveWords(titleFilter);
  const joined = positives.join(" ");
  const expanded = [...positives];

  if (AI_SIGNAL_RE.test(joined) && PRODUCT_SIGNAL_RE.test(joined)) {
    expanded.push(...AI_PRODUCT_VARIANTS);
  } else if (AI_SIGNAL_RE.test(joined)) {
    expanded.push("AI", "人工智能", "大模型", "AIGC", "智能体", "Agent");
  } else if (PRODUCT_SIGNAL_RE.test(joined)) {
    expanded.push(...PRODUCT_ROLE_VARIANTS);
  }

  return {
    positive: unique(expanded),
    negative: negativeWords(titleFilter),
  };
}

/** @param {TitleFilter | undefined | null} titleFilter */
export function primaryQueryFromTitleFilter(titleFilter) {
  const positives = positiveWords(titleFilter);
  const expanded = expandTitleFilter(titleFilter).positive;
  return clean(positives.join(" ")) || expanded[0] || "产品经理";
}

/** @param {JobLike | undefined | null} job */
function haystackForJob(job) {
  return compact([
    job?.title,
    job?.company,
    job?.department,
    job?.location,
    job?.jd_snippet,
    job?.snippet,
  ].filter(Boolean).join(" "));
}

/**
 * @param {JobLike | undefined | null} job
 * @param {TitleFilter | undefined | null} titleFilter
 */
export function matchesExpandedJob(job, titleFilter) {
  const haystack = haystackForJob(job);
  if (!haystack) return false;

  const negatives = negativeWords(titleFilter).map(compact);
  if (negatives.some((kw) => kw && haystack.includes(kw))) return false;

  const positives = expandTitleFilter(titleFilter).positive.map(compact);
  return positives.length === 0 || positives.some((kw) => kw && haystack.includes(kw));
}

/** @param {JobLike | undefined | null} job */
export function classifyJobMatch(job) {
  const title = clean(job?.title);
  const text = clean([
    job?.title,
    job?.company,
    job?.department,
    job?.location,
    job?.jd_snippet,
    job?.snippet,
  ].filter(Boolean).join(" "));

  if (!title && !text) return { keep: false, confidence: "low", reason: "empty_job" };
  if (ENGINEERING_ROLE_RE.test(title) && !PRODUCT_ROLE_RE.test(title)) {
    return { keep: false, confidence: "low", reason: "engineering_role_title" };
  }
  if (PRODUCT_ROLE_RE.test(title) && AI_SIGNAL_RE.test(text)) {
    return { keep: true, confidence: "high", reason: "ai_product_title" };
  }
  if (PRODUCT_ROLE_RE.test(title)) {
    return { keep: true, confidence: "medium", reason: "product_title" };
  }
  if (AI_SIGNAL_RE.test(text) && PRODUCT_SIGNAL_RE.test(text) && !ENGINEERING_ROLE_RE.test(title)) {
    return { keep: true, confidence: "medium", reason: "ai_product_context" };
  }
  return { keep: true, confidence: "low", reason: "keyword_match" };
}

/**
 * @template {JobLike} T
 * @param {T[]} jobs
 * @returns {Array<T & { match_confidence: string, source_metadata: Object }>}
 */
export function filterRoleQuality(jobs) {
  return jobs.filter((job) => classifyJobMatch(job).keep).map((job) => {
    const classification = classifyJobMatch(job);
    return {
      ...job,
      match_confidence: classification.confidence,
      source_metadata: { ...(job.source_metadata || {}), match_reason: classification.reason },
    };
  });
}

/**
 * @param {TitleFilter | undefined | null} titleFilter
 * @param {SearchScope} [scope]
 */
export function buildSearchIndexQueries(titleFilter, scope = {}) {
  const city = clean(scope?.location);
  const variants = expandTitleFilter(titleFilter).positive.slice(0, 8);
  const base = variants.length ? variants : [primaryQueryFromTitleFilter(titleFilter)];
  return unique(base.flatMap((keyword) => {
    const withCity = city ? `${city} ${keyword}` : keyword;
    return [
      `${withCity} 招聘`,
      `${withCity} 岗位`,
      `site:zhipin.com ${withCity}`,
      `site:zhaopin.com ${withCity}`,
      `site:liepin.com ${withCity}`,
      `site:51job.com ${withCity}`,
      `site:lagou.com ${withCity}`,
      `site:kanzhun.com ${withCity}`,
      `site:nowcoder.com ${withCity}`,
      `site:maimai.cn ${withCity}`,
      `site:dajie.com ${withCity}`,
      `site:shixiseng.com ${withCity}`,
    ];
  })).slice(0, 40);
}
