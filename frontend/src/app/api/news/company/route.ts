import { NextResponse } from "next/server";
import { getProfileGoals, getCachedNews, cacheNews, cleanExpiredNews, isNewsCacheFresh, type NewsCacheRow } from "@/lib/server-db";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";

async function generateCompanyNews(companies: string[]): Promise<{ title: string; summary: string; source_name: string }[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return [];

  const res = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: `为中国互联网公司生成招聘/业务动态摘要。每家公司15字以内。只返回JSON数组：[{"company":"公司名","title":"动态标题(6字)","summary":"一句话(15字)"}]。不知道的公司跳过，不要编造数字。` },
        { role: "user", content: companies.join("、") },
      ],
      temperature: 0.6, max_tokens: 800,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  try {
    const parsed = JSON.parse(content);
    const items = Array.isArray(parsed) ? parsed : (parsed.summaries || parsed.items || []);
    return (items as Record<string, string>[]).map((item) => ({
      title: item.title || "", summary: item.summary || "", source_name: item.company || item.source_name || "",
    }));
  } catch { return []; }
}

export async function GET() {
  try {
    const goals = getProfileGoals();
    const companies: string[] = goals?.target_companies as string[] || [];
    if (!companies.length) return NextResponse.json({ success: true, data: [], message: "在设置中添加目标公司", hasTargets: false });

    if (isNewsCacheFresh("company", 6)) {
      return NextResponse.json({ success: true, data: getCachedNews("company", 10).map(fmt), cached: true, hasTargets: true });
    }
    cleanExpiredNews(48);

    const items = await generateCompanyNews(companies);
    if (items.length) cacheNews(items.map((s) => ({ source: "company", source_name: s.source_name, title: s.title, summary: s.summary, url: undefined, published_at: new Date().toISOString() })));

    return NextResponse.json({ success: true, data: getCachedNews("company", 10).map(fmt), cached: false, hasTargets: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: "获取失败" }, { status: 500 });
  }
}

function fmt(row: NewsCacheRow) {
  return { id: row.id, source: row.source_name || row.source, title: row.title, summary: row.summary || "", url: row.url, publishedAt: row.published_at, cachedAt: row.cached_at };
}
