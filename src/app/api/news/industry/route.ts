import { NextResponse } from "next/server";
import { getDataRepositories } from "@/lib/data-repositories";
import type { NewsCacheRow } from "@/lib/server-db";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";

/* ── RSS Sources (verified working URLs, curated for AI job seekers) ── */
const SOURCES = [
  // Chinese — AI & tech news
  { name: "机器之心", url: "https://www.jiqizhixin.com/rss" },
  { name: "量子位", url: "https://www.qbitai.com/feed" },
  { name: "36氪", url: "https://36kr.com/feed" },
  // English — global AI industry
  { name: "OpenAI", url: "https://openai.com/blog/rss.xml" },
  { name: "Anthropic", url: "https://www.anthropic.com/blog/rss.xml" },
  { name: "TechCrunch", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { name: "Hacker News", url: "https://hnrss.org/frontpage" },
];

/* ── Date filtering: keep only items from last 3 days ── */
const MAX_AGE_DAYS = 3;
const CUTOFF = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

function parseDate(raw?: string): Date | null {
  if (!raw) return null;
  // Try ISO / RFC 2822 / various common formats
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d;
  // Try Chinese date format: "2026年5月6日" or "2026-05-06 10:30"
  const cn = raw.match(/(\d{4})[年-](\d{1,2})[月-](\d{1,2})/);
  if (cn) return new Date(parseInt(cn[1]), parseInt(cn[2]) - 1, parseInt(cn[3]));
  return null;
}

function isRecent(raw?: string): boolean {
  if (!raw) return true; // no date = include (don't discard)
  const d = parseDate(raw);
  if (!d) return true;
  return d >= CUTOFF;
}

interface FeedItem {
  title: string;
  url?: string;
  summary?: string;
  published_at?: string;
}

/* ── Fetch individual RSS feed ── */
async function fetchSource(name: string, url: string): Promise<FeedItem[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.log(`[news] ${name}: HTTP ${res.status}`);
      return [];
    }

    const xml = await res.text();
    return parseFeed(xml);
  } catch (err) {
    console.log(`[news] ${name}: fetch error - ${err instanceof Error ? err.message : "unknown"}`);
    return [];
  }
}

/* ── RSS/Atom XML parsing ── */
function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];

  // Try RSS <item> blocks first
  const rssItems = xml.match(/<item>[\s\S]*?<\/item>/gi);
  if (rssItems) {
    for (const block of rssItems.slice(0, 8)) {
      const title = extractTag(block, "title");
      if (!title) continue;
      const published_at = extractTag(block, "pubDate") || extractTag(block, "dc:date");
      if (!isRecent(published_at)) continue;
      const url = extractTag(block, "link");
      const summary = extractTag(block, "description") || extractTag(block, "content:encoded");
      items.push({ title: cleanText(title), url, summary: summary ? cleanText(stripHtml(summary)).slice(0, 200) : undefined, published_at });
    }
  }

  // Try Atom <entry> blocks if RSS yielded nothing
  if (items.length === 0) {
    const atomEntries = xml.match(/<entry>[\s\S]*?<\/entry>/gi);
    if (atomEntries) {
      for (const block of atomEntries.slice(0, 8)) {
        const title = extractTag(block, "title");
        if (!title) continue;
        const published_at = extractTag(block, "published") || extractTag(block, "updated");
        if (!isRecent(published_at)) continue;
        const url = extractAttr(block, "link", "href");
        const summary = extractTag(block, "summary") || extractTag(block, "content");
        items.push({ title: cleanText(title), url, summary: summary ? cleanText(stripHtml(summary)).slice(0, 200) : undefined, published_at });
      }
    }
  }

  return items;
}

function extractTag(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].trim() : undefined;
}

function extractAttr(block: string, tag: string, attr: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}[^>]*${attr}\\s*=\\s*["']([^"']+)`, "i"));
  return m ? m[1].trim() : undefined;
}

function cleanText(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
    .trim();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

/* ── AI Summarization ── */
async function summarizeWithDeepSeek(
  allItems: { source_name: string; title: string; url?: string; summary?: string }[]
): Promise<{ title: string; summary: string; url?: string }[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured");

  const itemsText = allItems.map((item, i) =>
    `[${i + 1}] 来源:${item.source_name} | 标题:${item.title}${item.summary ? ` | 原文摘要:${item.summary}` : ""}`
  ).join("\n");

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "你是AI行业新闻摘要助手。为每条新闻生成一句中文摘要（30字以内），只提取最核心的信息点。忽略与AI/科技/互联网无关的内容。只返回JSON对象：{\"summaries\":[{\"index\":1,\"summary\":\"一句话中文摘要\"},...]}。不要markdown，不要额外解释。",
        },
        { role: "user", content: `请为以下AI行业快讯生成中文摘要:\n\n${itemsText}` },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) throw new Error(`DeepSeek API error: ${response.status}`);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty DeepSeek response");

  let summaries: { index: number; summary: string }[] = [];
  try {
    const parsed = JSON.parse(content);
    summaries = parsed.summaries || parsed.items || [];
    if (!Array.isArray(summaries)) summaries = [];
  } catch {
    const m = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) {
      try {
        const inner = JSON.parse(m[1]);
        summaries = inner.summaries || inner.items || [];
        if (!Array.isArray(summaries)) summaries = [];
      } catch { /* ignore */ }
    }
  }

  return summaries.map((s) => {
    const item = allItems[s.index - 1];
    return { title: item?.title || "", summary: s.summary || "", url: item?.url };
  });
}

/* ── Route Handler ── */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "1";
    const newsRepo = getDataRepositories().news;

    // 1. Check cache (skip if force refresh)
    if (!force && await newsRepo.isFresh("industry", 6)) {
      const cached = await newsRepo.list("industry", 10);
      return NextResponse.json({ success: true, data: cached.map(formatNewsItem), cached: true });
    }

    // 2. Clean expired cache
    await newsRepo.cleanExpired(24);

    // 3. Fetch all RSS sources
    const results = await Promise.all(
      SOURCES.map(async ({ name, url }) => {
        const items = await fetchSource(name, url);
        return items.map((item) => ({ ...item, source_name: name }));
      })
    );
    const allItems = results.flat();

    console.log(`[news] industry: fetched ${allItems.length} items from ${SOURCES.length} sources`);

    // 4. If RSS fetches failed, fall back to DeepSeek-only news generation
    if (allItems.length === 0) {
      console.log("[news] industry: all RSS fetches failed, generating with DeepSeek");
      const generated = await generateNewsWithDeepSeek();
      if (generated.length > 0) {
        await newsRepo.cache(generated.map((item) => ({
          source: "industry" as const,
          source_name: item.source_name,
          title: item.title,
          summary: item.summary,
          url: undefined,
          published_at: new Date().toISOString(),
        })));
        const cached = await newsRepo.list("industry", 10);
        return NextResponse.json({ success: true, data: cached.map(formatNewsItem), cached: false });
      }

      // Return stale cache as last resort
      const stale = await newsRepo.list("industry", 10);
      if (stale.length > 0) {
        return NextResponse.json({ success: true, data: stale.map(formatNewsItem), cached: true, stale: true });
      }
      return NextResponse.json({ success: true, data: [], message: "快讯暂不可用" });
    }

    // 5. Summarize with DeepSeek (pick top 20 from all sources)
    const toSummarize = allItems.slice(0, 20);
    let summarized;
    try {
      summarized = await summarizeWithDeepSeek(
        toSummarize.map((item) => ({
          source_name: item.source_name,
          title: item.title,
          url: item.url,
          summary: item.summary,
        }))
      );
      if (summarized.length === 0) {
        console.warn("[news] industry: summarization returned no items, using raw titles");
        summarized = toSummarize.map((item) => ({
          title: item.title,
          summary: item.summary || item.title,
          url: item.url,
        }));
      }
    } catch (err) {
      console.error("[news] industry: summarization failed, using raw titles:", err);
      summarized = toSummarize.map((item) => ({
        title: item.title,
        summary: item.title,
        url: item.url,
      }));
    }

    // 6. Cache to the selected database
    if (summarized.length > 0) {
      await newsRepo.cache(
        summarized.map((item, i) => ({
          source: "industry" as const,
          source_name: toSummarize[i]?.source_name || "",
          title: item.title,
          summary: item.summary,
          url: item.url || undefined,
          published_at: toSummarize[i]?.published_at || new Date().toISOString(),
        }))
      );
    }

    // 7. Return
    const cached = await newsRepo.list("industry", 12);
    return NextResponse.json({ success: true, data: cached.map(formatNewsItem), cached: false });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("[news] industry error:", message);
    return NextResponse.json({ success: false, error: "快讯获取失败" }, { status: 500 });
  }
}

/* ── DeepSeek-only news generation (fallback when RSS fails) ── */
async function generateNewsWithDeepSeek(): Promise<{ title: string; summary: string; source_name: string }[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured");

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `你是AI行业新闻编辑。请基于你的知识生成最近一周的AI/科技行业重要新闻。

规则：
- 聚焦中国AI求职者关心的信息：大模型发布、开源动态、融资并购、招聘趋势、政策法规
- 来源从机器之心、量子位、36氪、虎嗅、雷锋网、极客公园等渠道中选取
- 只返回JSON对象：{"news":[{"title":"新闻标题","summary":"一句话中文摘要(30字)","source_name":"来源名称"}]}
- 生成5-8条，不要重复
- 不编造具体日期数字`,
        },
        { role: "user", content: "请生成最近一周AI行业重要新闻摘要" },
      ],
      temperature: 0.5,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) throw new Error(`DeepSeek API error: ${response.status}`);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return [];

  try {
    const parsed = JSON.parse(content);
    const items = parsed.news || parsed.items || [];
    if (!Array.isArray(items)) return [];
    return items.map((item: Record<string, string>) => ({
      title: item.title || "",
      summary: item.summary || item.title || "",
      source_name: item.source_name || item.source || "AI快讯",
    }));
  } catch {
    return [];
  }
}

function formatNewsItem(row: NewsCacheRow) {
  return {
    id: row.id,
    source: row.source_name || row.source,
    title: row.title,
    summary: row.summary || "",
    url: row.url,
    publishedAt: row.published_at,
    cachedAt: row.cached_at,
  };
}
