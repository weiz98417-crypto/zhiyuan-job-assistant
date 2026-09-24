// @ts-check
/**
 * LLM-based job extractor for custom career pages.
 * Falls back to generic CSS extraction when API is unavailable.
 */

const SYSTEM_PROMPT = `你是一个精确的 JSON 提取器。从给定的招聘页面内容中提取所有职位信息。

返回格式必须是合法 JSON，不要添加任何解释：
{
  "jobs": [
    {
      "title": "职位名称",
      "url": "职位详情页链接",
      "location": "工作地点",
      "department": "部门"
    }
  ]
}

规则：
- 如果字段不存在，用空字符串 ""
- url 必须是完整 URL（相对路径要补全为 https://）
- 最多提取 200 个职位
- 不输出任何 JSON 以外的内容`;

/**
 * @param {string} pageText - The page text content
 * @param {string} companyName - Company name (for logging)
 * @param {string} baseUrl - Base URL for resolving relative paths
 * @returns {Promise<Array<import('./types.mjs').RawJob>>}
 */
export async function extractWithLLM(pageText, companyName, baseUrl) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY not set — cannot use LLM extraction');
  }

  // Truncate to avoid token waste (most career pages are <50K chars)
  const truncated = pageText.slice(0, 100000);

  const startTime = Date.now();
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-flash',
      max_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: truncated },
      ],
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`DeepSeek extraction failed (HTTP ${response.status})`);

  const result = await response.json();
  const text = result.choices?.[0]?.message?.content || '';
  const elapsed = Date.now() - startTime;

  const inputTokens = result.usage?.prompt_tokens || 0;
  const outputTokens = result.usage?.completion_tokens || 0;
  console.log(`[llm-extractor] ${companyName}: ${inputTokens}+${outputTokens} tokens, ${elapsed}ms`);

  // Parse JSON — handle potential markdown wrapping
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`LLM response is not JSON: ${text.slice(0, 200)}`);

  let parsed;
  try { parsed = JSON.parse(jsonMatch[0]); } catch (e) {
    throw new Error(`LLM returned invalid JSON: ${text.slice(0, 200)}`);
  }

  const rawJobs = (parsed.jobs || []).slice(0, 200);

  // Filter invalid entries (must have title AND url)
  const jobs = rawJobs
    .filter((/** @type {any} */ j) => j && typeof j.title === 'string' && j.title.trim() && typeof j.url === 'string' && j.url.trim())
    .map((/** @type {any} */ j) => ({
      title: j.title.trim(),
      url: resolveUrl(j.url.trim(), baseUrl),
      company: companyName,
      location: (j.location || '').trim(),
      department: (j.department || '').trim(),
      jd_snippet: '',
      discovered_at: new Date().toISOString(),
    }));

  return jobs;
}

/**
 * @param {string} url
 * @param {string} base
 */
function resolveUrl(url, base) {
  if (!url) return '';
  try { return new URL(url, base).href; } catch { return url; }
}
