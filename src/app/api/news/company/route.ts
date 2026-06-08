import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import type { NewsCacheRow } from "@/lib/server-db";

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
        {
          role: "system",
          content: "你是面向中国求职者的公司动态摘要助手。请根据目标公司生成招聘、业务或 AI 相关动态摘要。只返回 JSON 对象：{\"items\":[{\"company\":\"公司名\",\"title\":\"动态标题\",\"summary\":\"一句话摘要\"}]}。不知道就跳过，不要编造具体数字。",
        },
        { role: "user", content: companies.join("、") },
      ],
      temperature: 0.6,
      max_tokens: 800,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  try {
    const parsed = JSON.parse(content);
    const items = Array.isArray(parsed) ? parsed : (parsed.items || parsed.summaries || parsed.news || []);
    return (items as Record<string, string>[])
      .map((item) => ({
        title: item.title || "",
        summary: item.summary || "",
        source_name: item.company || item.source_name || "",
      }))
      .filter((item) => item.title && item.source_name);
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "1";
    const repos = getDataRepositories();
    const newsRepo = repos.news;
    const profile = await repos.profiles.get(user.userId);
    const goals = parseProfileGoals(profile?.goals_json);
    const companies = Array.isArray(goals?.target_companies)
      ? goals.target_companies
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
      : [];

    if (!companies.length) {
      return NextResponse.json({ success: true, data: [], message: "在设置中添加目标公司", hasTargets: false });
    }

    if (!force && await newsRepo.isFresh("company", 6)) {
      const cached = filterCompanyNews(await newsRepo.list("company", 50), companies);
      if (cached.length > 0) {
        return NextResponse.json({ success: true, data: cached.map(fmt), cached: true, hasTargets: true });
      }
    }

    await newsRepo.cleanExpired(48);

    const items = await generateCompanyNews(companies);
    if (items.length) {
      await newsRepo.cache(items.map((item) => ({
        source: "company",
        source_name: item.source_name,
        title: item.title,
        summary: item.summary,
        url: undefined,
        published_at: new Date().toISOString(),
      })));
    }

    const cached = filterCompanyNews(await newsRepo.list("company", 50), companies);
    return NextResponse.json({ success: true, data: cached.map(fmt), cached: false, hasTargets: true });
  } catch (error) {
    console.error("[news] company error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "获取失败" }, { status: 500 });
  }
}

function filterCompanyNews(rows: NewsCacheRow[], companies: string[]): NewsCacheRow[] {
  const companySet = new Set(companies.map((company) => company.toLowerCase()));
  return rows.filter((row) => {
    const sourceName = (row.source_name || "").toLowerCase();
    return companySet.has(sourceName);
  });
}

function fmt(row: NewsCacheRow) {
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

function parseProfileGoals(raw?: string): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
