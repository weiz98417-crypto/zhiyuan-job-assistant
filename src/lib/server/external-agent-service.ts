import { llmRetry } from "@/lib/llm-retry";
import { mcpManager } from "@/lib/agent/mcp/manager";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const SEARCH_MODEL = "deepseek-v4-flash";

export interface ExternalSearchResult {
  text: string;
  sources: string[];
}

export async function getWeatherForecast(city: string, signal?: AbortSignal): Promise<string> {
  const normalizedCity = city.trim();
  if (!normalizedCity) throw new Error("缺少城市名称");
  const response = await fetchWithTimeout(
    `https://wttr.in/${encodeURIComponent(normalizedCity)}?format=j1`,
    {},
    signal,
    8_000,
  );
  if (!response.ok) throw new Error(`天气服务返回 HTTP ${response.status}`);
  const data = await response.json();
  const current = data?.current_condition?.[0];
  const today = data?.weather?.[0];
  if (!current) throw new Error("天气服务未返回当前天气");
  const lines = [
    `**${normalizedCity}天气**`,
    `当前: ${current.weatherDesc?.[0]?.value || "未知"}，${current.temp_C}°C，体感 ${current.FeelsLikeC}°C，湿度 ${current.humidity}%，风速 ${current.windspeedKmph}km/h`,
  ];
  if (today) {
    lines.push(`今日: ${today.weatherDesc?.[0]?.value || "未知"}，最高 ${today.maxtempC}°C / 最低 ${today.mintempC}°C`);
  }
  const tomorrow = data?.weather?.[1];
  if (tomorrow) {
    lines.push(`明日: ${tomorrow.weatherDesc?.[0]?.value || "未知"}，最高 ${tomorrow.maxtempC}°C / 最低 ${tomorrow.mintempC}°C`);
  }
  return lines.join("\n");
}

export async function searchPlaceInformation(
  keyword: string,
  city?: string,
  signal?: AbortSignal,
): Promise<string> {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) throw new Error("缺少地点关键词");
  const subject = [city?.trim(), normalizedKeyword].filter(Boolean).join(" ");
  const text = await searchDuckDuckGo(`${subject} 地址 位置`, 3, signal);
  return text || `未找到“${subject}”的位置信息`;
}

export async function getTravelDirections(
  origin: string,
  destination: string,
  mode = "transit",
  signal?: AbortSignal,
): Promise<string> {
  const normalizedOrigin = origin.trim();
  const normalizedDestination = destination.trim();
  if (!normalizedOrigin || !normalizedDestination) throw new Error("起点和终点不能为空");
  const modeLabel = mode === "driving" ? "驾车" : mode === "walking" ? "步行" : "公交地铁";
  const text = await searchDuckDuckGo(
    `${normalizedOrigin} 到 ${normalizedDestination} ${modeLabel} 路线`,
    2,
    signal,
  );
  return text || `未找到${normalizedOrigin}到${normalizedDestination}的路线信息，建议使用地图 App 查询。`;
}

export async function searchJobLeads(
  keyword: string,
  city?: string,
  signal?: AbortSignal,
): Promise<string> {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) throw new Error("缺少职位关键词");
  const query = [city?.trim(), normalizedKeyword, "招聘"].filter(Boolean).join(" ");
  const text = await searchDuckDuckGo(query, 5, signal);
  if (!text) return "未找到相关职位线索";
  return text.split("\n").map((line) => `- ${line}`).join("\n");
}

export async function searchWeb(query: string, signal?: AbortSignal): Promise<ExternalSearchResult> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) throw new Error("缺少搜索关键词");

  const [mcp, knowledge, wikipedia] = await Promise.all([
    searchWithMcp(normalizedQuery, signal),
    lookupModelKnowledge(normalizedQuery, signal),
    searchWikipedia(normalizedQuery, signal),
  ]);
  const parts: string[] = [];
  const sources: string[] = [];
  if (mcp) {
    parts.push(`【SerpAPI MCP】\n${mcp}`);
    sources.push("SerpAPI MCP");
  }
  if (knowledge) {
    parts.push(knowledge);
    sources.push("AI知识库");
  }
  if (wikipedia) {
    parts.push(`【维基百科】\n${wikipedia}`);
    sources.push("Wikipedia");
  }
  return {
    text: parts.join("\n\n") || "未找到相关结果",
    sources,
  };
}

async function searchWithMcp(query: string, signal?: AbortSignal): Promise<string> {
  try {
    await mcpManager.initServer("serpapi", signal);
    const tool = mcpManager.getServerTools("serpapi").find((candidate) =>
      /search/i.test(candidate.name),
    );
    if (!tool) return "";
    const queryParameter = Object.keys(tool.parameters).find((name) =>
      /^(q|query|search_?term|keyword)$/i.test(name),
    );
    if (!queryParameter) return "";
    const rawName = tool.name.replace(/^serpapi_/, "");
    const result = await mcpManager.callTool(
      "serpapi",
      rawName,
      { [queryParameter]: query },
      signal,
    );
    return result.success ? String(result.data || "").trim() : "";
  } catch (error) {
    rethrowAbort(signal, error);
    return "";
  }
}

async function lookupModelKnowledge(query: string, signal?: AbortSignal): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return "";
  try {
    const response = await llmRetry(DEEPSEEK_API_URL, apiKey, {
      model: SEARCH_MODEL,
      messages: [
        {
          role: "system",
          content: `你是中国企业信息检索专家。请根据你的训练数据，提供关于查询对象的详细事实信息。

输出格式：每条一行，用"- "开头。

规则：
1. 先列基本信息：公司全称、成立年份、总部地点、员工规模
2. 再列业务：主营业务、核心产品或技术、行业地位
3. 再列动态：近期融资、上市、扩张或招聘方向
4. 不确定的信息标注"[存疑]"，不了解的内容直接跳过
5. 每条不超过150字，总共不超过12条，只用中文
6. 如果查询对象是公司名，只输出该公司信息`,
        },
        { role: "user", content: query },
      ],
      temperature: 0.05,
      max_tokens: 1500,
      timeout: 15_000,
      retries: 1,
      signal,
    });
    const data = await response.json();
    const content = String(data?.choices?.[0]?.message?.content || "").trim();
    return content === "无相关信息" ? "" : content;
  } catch (error) {
    rethrowAbort(signal, error);
    return "";
  }
}

async function searchWikipedia(query: string, signal?: AbortSignal): Promise<string> {
  for (const language of ["zh", "en"]) {
    try {
      const base = `https://${language}.wikipedia.org/w/api.php?origin=*`;
      const url = `${base}&action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5&srprop=snippet`;
      const response = await fetchWithTimeout(url, {}, signal, 8_000);
      if (!response.ok) continue;
      const data = await response.json();
      const items = Array.isArray(data?.query?.search)
        ? data.query.search as Array<{ title?: string; snippet?: string }>
        : [];
      const keywords = query.split(/\s+/).filter((keyword) => keyword.length >= 2);
      const relevant = keywords.length
        ? items.filter((item) => keywords.some((keyword) => String(item.title || "").includes(keyword)))
        : items;
      if (!relevant.length) continue;
      const prefix = `https://${language}.wikipedia.org/wiki/`;
      return relevant.map((item, index) => {
        const title = String(item.title || "");
        return `${index + 1}. ${title}\n   ${stripHtml(String(item.snippet || "")).slice(0, 200)}\n   ${prefix}${encodeURIComponent(title.replace(/ /g, "_"))}`;
      }).join("\n\n");
    } catch (error) {
      rethrowAbort(signal, error);
    }
  }
  return "";
}

export async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) forwardAbort();
  else signal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error(`request deadline exceeded: ${input}`)), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

async function searchDuckDuckGo(query: string, limit: number, signal?: AbortSignal): Promise<string> {
  const response = await fetchWithTimeout(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`,
    {},
    signal,
    8_000,
  );
  if (!response.ok) throw new Error(`搜索服务返回 HTTP ${response.status}`);
  const data = await response.json();
  const parts: string[] = [];
  const abstract = String(data?.Abstract || data?.AbstractText || "").trim();
  if (abstract) parts.push(abstract);
  const topics = Array.isArray(data?.RelatedTopics) ? data.RelatedTopics : [];
  for (const topic of topics.slice(0, limit)) {
    const text = String(topic?.Text || "").trim();
    if (text) parts.push(text.slice(0, 200));
  }
  return parts.join("\n");
}

function rethrowAbort(signal: AbortSignal | undefined, error: unknown): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : error;
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
