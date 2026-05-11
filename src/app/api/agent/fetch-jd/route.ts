import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { url } = await request.json();
  if (!url || typeof url !== "string" || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ success: false, error: "请提供有效的 URL" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ZhiyuanBot/1.0)" },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ success: false, error: `无法获取 JD 内容: HTTP ${res.status}` }, { status: 502 });
    }

    const html = await res.text();

    // Simple text extraction: strip HTML tags, normalize whitespace
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 20000);

    return NextResponse.json({ success: true, data: { text } });
  } catch (err) {
    const msg = err instanceof Error && err.name === "AbortError"
      ? "请求超时"
      : `抓取失败: ${err instanceof Error ? err.message : "未知错误"}`;
    return NextResponse.json({ success: false, error: msg }, { status: 502 });
  }
}
