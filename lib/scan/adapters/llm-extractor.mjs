// @ts-check
/**
 * LLM-based job extractor for custom career pages.
 * Falls back to generic CSS extraction when API is unavailable.
 */

let _anthropic = null;
async function getAnthropic() {
  if (!_anthropic) {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

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
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set — cannot use LLM extraction');
  }

  // Truncate to avoid token waste (most career pages are <50K chars)
  const truncated = pageText.slice(0, 100000);

  const anthropic = await getAnthropic();
  const startTime = Date.now();
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: truncated }],
  });

  const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
  const elapsed = Date.now() - startTime;
  const inputTokens = msg.usage?.input_tokens || 0;
  const outputTokens = msg.usage?.output_tokens || 0;
  const cost = (inputTokens / 1_000_000 * 0.80) + (outputTokens / 1_000_000 * 4.00);

  console.log(`[llm-extractor] ${companyName}: ${inputTokens}+${outputTokens} tokens, $${cost.toFixed(4)}, ${elapsed}ms`);

  // Parse JSON — handle potential markdown wrapping
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`LLM response is not JSON: ${text.slice(0, 200)}`);

  const parsed = JSON.parse(jsonMatch[0]);
  const jobs = (parsed.jobs || []).slice(0, 200);

  return jobs.map((/** @type {any} */ j) => ({
    title: j.title || '',
    url: resolveUrl(j.url || '', baseUrl),
    company: companyName,
    location: j.location || '',
    department: j.department || '',
    jd_snippet: '',
    discovered_at: new Date().toISOString(),
  }));
}

function resolveUrl(url, base) {
  if (!url) return '';
  try { return new URL(url, base).href; } catch { return url; }
}
