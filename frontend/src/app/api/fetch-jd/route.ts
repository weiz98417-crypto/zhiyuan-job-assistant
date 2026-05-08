import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_SIZE = 500_000; // 500KB

interface FetchJdResponse {
  success: boolean;
  data?: {
    url: string;
    title: string;
    text: string;
    source: string;
    fetchedAt: string;
  };
  error?: string;
}

function detectPlatform(url: string): string {
  const host = new URL(url).hostname.replace("www.", "");
  const map: Record<string, string> = {
    "zhipin.com": "Boss直聘",
    "lagou.com": "拉勾",
    "liepin.com": "猎聘",
    "linkedin.com": "LinkedIn",
    "greenhouse.io": "Greenhouse",
    "jobs.ashbyhq.com": "Ashby",
    "lever.co": "Lever",
    "51job.com": "前程无忧",
    "job.indeed.com": "Indeed",
  };
  for (const [key, label] of Object.entries(map)) {
    if (host.includes(key)) return label;
  }
  return host;
}

function extractText($: cheerio.CheerioAPI, url: string): string {
  const host = new URL(url).hostname.replace("www.", "");

  // Platform-specific selectors for main content
  const selectors: Record<string, string[]> = {
    "zhipin.com": [".job-sec", ".detail-content", ".job-detail", ".text"],
    "lagou.com": [".job-detail", ".job-content", ".job-main"],
    "liepin.com": [".job-description", ".content-word", ".job-main-content"],
    "linkedin.com": [".description__text", ".show-more-less-html__markup", ".jobs-description-content"],
    "greenhouse.io": ["#content", ".job-description", ".body"],
    "jobs.ashbyhq.com": [".job-description", ".posting-content", "main"],
    "lever.co": [".posting-page", ".section--job-description", ".posting-content"],
    "51job.com": [".bmsg.job_msg", ".job_msg", ".tCompany_main"],
  };

  let selected: string | undefined;
  for (const [key, sels] of Object.entries(selectors)) {
    if (host.includes(key)) {
      selected = sels.find((sel) => $(sel).length > 0);
      break;
    }
  }

  if (selected) {
    return $(selected).text().replace(/\s+/g, " ").trim();
  }

  // Fallback: remove obvious non-content elements and get body text
  $("script, style, nav, header, footer, .nav, .header, .footer, .sidebar, noscript, iframe, [role='navigation']").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

export async function POST(request: Request) {
  try {
    const { url } = (await request.json()) as { url: string };

    if (!url || !url.trim()) {
      return NextResponse.json(
        { success: false, error: "请提供职位链接" },
        { status: 400 },
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { success: false, error: "无效的 URL 格式" },
        { status: 400 },
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(parsedUrl.toString(), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
        signal: controller.signal,
        redirect: "follow",
      });
    } catch (err) {
      clearTimeout(timeout);
      const msg = err instanceof Error && err.name === "AbortError" ? "请求超时" : "无法访问该链接";
      return NextResponse.json(
        { success: false, error: msg },
        { status: err instanceof Error && err.name === "AbortError" ? 408 : 502 },
      );
    }
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `远程服务器返回 ${response.status}` },
        { status: 502 },
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return NextResponse.json(
        { success: false, error: "该链接不是网页，可能无法直接访问" },
        { status: 422 },
      );
    }

    // Read with size limit
    const reader = response.body?.getReader();
    if (!reader) {
      return NextResponse.json(
        { success: false, error: "无法读取响应内容" },
        { status: 500 },
      );
    }

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

    if (!html.trim()) {
      return NextResponse.json(
        { success: false, error: "页面内容为空" },
        { status: 422 },
      );
    }

    const $ = cheerio.load(html);
    const title = $("title").text().replace(/\s+/g, " ").trim() || parsedUrl.hostname;
    const text = extractText($, url);

    if (text.length < 200) {
      return NextResponse.json(
        { success: false, error: "未检测到职位描述内容，请确认链接有效或改用文本粘贴" },
        { status: 422 },
      );
    }

    const result: FetchJdResponse = {
      success: true,
      data: {
        url,
        title,
        text: text.slice(0, 8000), // Limit JD text size for downstream AI
        source: detectPlatform(url),
        fetchedAt: new Date().toISOString(),
      },
    };

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Fetch JD API error:", message);
    return NextResponse.json(
      { success: false, error: `获取失败: ${message}` },
      { status: 500 },
    );
  }
}
