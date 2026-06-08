import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import {
  attachJdToScanJobForUser,
  getScanJobForUser,
  markScanJobViewedForUser,
  updateScanJobErrorForUser,
} from "@/lib/scan-data";
import type { JDRow } from "@/lib/server-db";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_SIZE = 500_000;

type ScanJob = {
  id: number | string;
  jd_id?: number | string | null;
  company: string;
  title: string;
  url: string;
  jd_snippet?: string;
  last_error?: string;
};

function toClientJD(jd: JDRow) {
  return {
    id: jd.id,
    company: jd.company,
    role: jd.role,
    sourceType: jd.source_type,
    sourceUrl: jd.source_url || undefined,
    body: jd.body,
    keywords: (() => {
      try { return JSON.parse(jd.keywords_json || "[]"); } catch { return []; }
    })(),
    reportId: jd.report_id,
    createdAt: jd.created_at || new Date().toISOString(),
  };
}

function extractText(html: string, url: string): { title: string; text: string } {
  const $ = cheerio.load(html);
  const host = new URL(url).hostname.replace("www.", "");
  const selectors: Record<string, string[]> = {
    "greenhouse.io": ["#content", ".job-description", ".body"],
    "jobs.ashbyhq.com": [".job-description", ".posting-content", "main"],
    "lever.co": [".posting-page", ".section--job-description", ".posting-content"],
    "linkedin.com": [".description__text", ".show-more-less-html__markup", ".jobs-description-content"],
    "zhipin.com": [".job-sec", ".detail-content", ".job-detail", ".text"],
  };

  let selected: string | undefined;
  for (const [key, values] of Object.entries(selectors)) {
    if (host.includes(key)) selected = values.find((sel) => $(sel).length > 0);
  }
  $("script, style, nav, header, footer, aside, noscript, iframe, [role='navigation']").remove();
  const text = (selected ? $(selected).text() : $("body").text()).replace(/\s+/g, " ").trim();
  const title = $("title").text().replace(/\s+/g, " ").trim();
  return { title, text };
}

async function fetchJDText(url: string): Promise<{ title: string; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw new Error("链接不是可读取的网页");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("无法读取网页内容");
    let html = "";
    let totalSize = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.length;
      if (totalSize > MAX_RESPONSE_SIZE) {
        reader.cancel();
        break;
      }
      html += new TextDecoder().decode(value);
    }
    const parsed = extractText(html, url);
    if (parsed.text.length < 80) throw new Error("没有抓到足够的 JD 正文");
    return { title: parsed.title, text: parsed.text.slice(0, 12000) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const jobId = Number(id);
    const userId = String(user.userId);
    const job = await getScanJobForUser(jobId, userId) as ScanJob | undefined;
    if (!job) return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });

    if (job.jd_id) {
      const jd = await getDataRepositories().jds.get(Number(job.jd_id), userId);
      if (jd) return NextResponse.json({ success: true, data: { job, jd: toClientJD(jd), reused: true } });
    }

    try {
      const fetched = await fetchJDText(job.url);
      await markScanJobViewedForUser(jobId, userId, { snippet: fetched.text.slice(0, 1000) });
      return NextResponse.json({
        success: true,
        data: {
          job: { ...job, status: "viewed" },
          fetched: {
            title: fetched.title || job.title,
            body: fetched.text,
            sourceUrl: job.url,
            company: job.company,
            role: job.title,
          },
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "JD 抓取失败";
      await markScanJobViewedForUser(jobId, userId, { error: message });
      return NextResponse.json({
        success: true,
        data: {
          job: { ...job, status: "viewed", last_error: message },
          fetched: null,
          error: message,
        },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const jobId = Number(id);
    const userId = String(user.userId);
    const job = await getScanJobForUser(jobId, userId) as ScanJob | undefined;
    if (!job) return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });

    const body = await request.json().catch(() => ({})) as { jdBody?: string; company?: string; role?: string; evaluate?: boolean };
    let jdBody = (body.jdBody || "").trim();
    let fetchError = "";
    if (!jdBody) {
      try {
        jdBody = (await fetchJDText(job.url)).text;
      } catch (err) {
        fetchError = err instanceof Error ? err.message : "JD 抓取失败";
      }
    }
    if (jdBody.length < 50) {
      await updateScanJobErrorForUser(jobId, userId, fetchError || "JD 正文不足");
      return NextResponse.json({ success: false, error: fetchError || "JD 正文不足，请手动粘贴后再保存" }, { status: 422 });
    }

    const row: JDRow = {
      company: body.company || job.company || "",
      role: body.role || job.title || "",
      source_type: "discovery",
      source_url: job.url,
      body: jdBody,
      keywords_json: JSON.stringify([]),
    };
    const repos = getDataRepositories();
    const reusable = await repos.jds.findReusable({ source_url: row.source_url, body: row.body }, userId);
    const jdId = reusable?.id || await repos.jds.insert(row, userId);
    await attachJdToScanJobForUser(jobId, userId, Number(jdId), body.evaluate ? "evaluating" : "saved");
    return NextResponse.json({ success: true, jdId, reused: Boolean(reusable), data: reusable ? toClientJD(reusable) : { ...toClientJD(row), id: jdId } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
