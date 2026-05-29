import { NextResponse } from "next/server";
import { chromium } from "playwright";
import fs from "fs";
import os from "os";
import path from "path";
import { getReport } from "@/lib/server-db";
import { markdownToSafeHtml } from "@/lib/server-markdown";

const BLOCK_LABELS: Record<string, string> = {
  a: "A 职位概览",
  b: "B 简历匹配",
  c: "C 职级与策略",
  d: "D 薪资与市场",
  e: "E 定制化方案",
  f: "F 面试准备",
  g: "G 合法性与风险",
};

function findChromiumExecutable(): string | undefined {
  const bundled = chromium.executablePath();
  if (bundled && fs.existsSync(bundled)) return bundled;

  const platform = os.platform();
  if (platform !== "win32") return undefined;
  const playwrightDir = path.join(os.homedir(), "AppData", "Local", "ms-playwright");
  if (!fs.existsSync(playwrightDir)) return undefined;

  const candidates = fs.readdirSync(playwrightDir)
    .filter((entry) => entry.startsWith("chromium-") && !entry.includes("headless_shell"))
    .map((entry) => path.join(playwrightDir, entry, "chrome-win64", "chrome.exe"));

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function blockContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { content?: unknown }).content === "string") {
    return (value as { content: string }).content;
  }
  return "";
}

function blockScore(value: unknown): number | null {
  if (value && typeof value === "object" && typeof (value as { score?: unknown }).score === "number") {
    return (value as { score: number }).score;
  }
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildReportHtml(report: NonNullable<ReturnType<typeof getReport>>): string {
  const rawBlocks = parseJson<Record<string, unknown>>(report.blocks_json, {});
  const keywords = parseJson<string[]>(report.keywords_json, []);
  const sections = Object.entries(BLOCK_LABELS)
    .map(([key, label]) => {
      const content = blockContent(rawBlocks[key]);
      if (!content.trim()) return "";
      const score = blockScore(rawBlocks[key]);
      return `
        <section class="block">
          <div class="block-title">
            <h2>${label}</h2>
            ${score != null ? `<span>${score}/5</span>` : ""}
          </div>
          <div class="markdown">${markdownToSafeHtml(content)}</div>
        </section>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.company)} - ${escapeHtml(report.role)} JD评估报告</title>
  <style>
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #1f2937;
      font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif;
      font-size: 11px;
      line-height: 1.55;
      background: #fff;
    }
    .cover { border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 16px; }
    h1 { font-size: 24px; line-height: 1.2; margin: 0 0 8px; }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; color: #4b5563; }
    .pill { border: 1px solid #d1d5db; border-radius: 999px; padding: 3px 8px; }
    .keywords { margin-top: 10px; color: #4b5563; }
    .block { break-inside: avoid; page-break-inside: avoid; margin: 0 0 16px; }
    .block-title {
      display: flex; justify-content: space-between; align-items: baseline;
      border-bottom: 1px solid #111827; margin-bottom: 8px; padding-bottom: 4px;
    }
    h2 { font-size: 15px; margin: 0; }
    h3 { font-size: 13px; margin: 12px 0 6px; }
    h4 { font-size: 12px; margin: 10px 0 4px; }
    p { margin: 5px 0; }
    ul, ol { margin: 5px 0 7px 18px; padding: 0; }
    li { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 10px; table-layout: auto; break-inside: avoid; }
    th, td { border: 1px solid #9ca3af; padding: 5px 6px; vertical-align: top; word-break: break-word; }
    th { background: #f3f4f6; color: #111827; font-weight: 700; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    code { background: #f3f4f6; padding: 1px 3px; border-radius: 3px; }
    pre { background: #f3f4f6; padding: 8px; overflow-wrap: break-word; white-space: pre-wrap; }
    blockquote { margin: 8px 0; padding: 6px 10px; border-left: 3px solid #6b7280; background: #f9fafb; }
  </style>
</head>
<body>
  <header class="cover">
    <h1>${escapeHtml(report.company)} - ${escapeHtml(report.role)}</h1>
    <div class="meta">
      <span class="pill">报告 #${report.report_num}</span>
      <span class="pill">日期 ${escapeHtml(report.date)}</span>
      <span class="pill">总分 ${report.overall_score}/5</span>
      ${report.archetype ? `<span class="pill">${escapeHtml(report.archetype)}</span>` : ""}
    </div>
    ${keywords.length ? `<div class="keywords">关键词：${keywords.map(escapeHtml).join("、")}</div>` : ""}
  </header>
  ${sections}
</body>
</html>`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ reportNum: string }> }) {
  try {
    const { reportNum } = await params;
    const report = getReport(Number(reportNum));
    if (!report) {
      return NextResponse.json({ success: false, error: "报告不存在" }, { status: 404 });
    }

    const html = buildReportHtml(report);
    const executablePath = findChromiumExecutable();
    const browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ["--no-sandbox", "--disable-gpu", "--disable-setuid-sandbox"],
    });
    let pdf: Buffer;
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load", timeout: 30000 });
      await Promise.race([
        page.evaluate(() => document.fonts.ready),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<div></div>",
        footerTemplate: "<div style='width:100%;font-size:8px;color:#6b7280;text-align:center;'>第 <span class='pageNumber'></span> / <span class='totalPages'></span> 页</div>",
        margin: { top: "14mm", right: "12mm", bottom: "16mm", left: "12mm" },
      });
    } finally {
      await browser.close();
    }

    const filename = `report-${report.report_num}-${report.company}-${report.role}.pdf`
      .replace(/[\\/:*?"<>|]/g, "-");
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": String(pdf.length),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json({ success: false, error: `PDF 生成失败: ${message}` }, { status: 500 });
  }
}
