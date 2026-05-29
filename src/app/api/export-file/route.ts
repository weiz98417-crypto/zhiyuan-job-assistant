import { NextResponse } from "next/server";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

// POST — save exported file to output/ directory and return download path
export async function POST(request: Request) {
  try {
    const { content, filename, format } = await request.json();

    if (!content || typeof content !== "string" || content.length === 0) {
      return NextResponse.json({ success: false, error: "content is required" }, { status: 400 });
    }
    if (!filename || typeof filename !== "string") {
      return NextResponse.json({ success: false, error: "filename is required" }, { status: 400 });
    }

    const ext = format === "html" ? "html" : format === "txt" ? "txt" : "md";
    const fullName = `${filename}.${ext}`;
    const outputDir = resolve(process.cwd(), "output");
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

    // Save original format
    const filePath = resolve(outputDir, fullName);
    writeFileSync(filePath, content, "utf-8");

    // Always generate a companion .html with proper markdown→HTML conversion
    const htmlName = `${filename}.html`;
    const htmlPath = resolve(outputDir, htmlName);
    const htmlBody = mdToHtml(content);
    const htmlDoc = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(filename)}</title>
<style>
  body { font-family: "Microsoft YaHei","PingFang SC",sans-serif; max-width:840px; margin:40px auto; padding:24px; color:#333; line-height:1.7; }
  h1 { font-size:1.5em; border-bottom:2px solid #2563eb; padding-bottom:8px; }
  h2 { font-size:1.15em; margin-top:28px; color:#1e40af; }
  h3 { font-size:1.05em; margin-top:20px; }
  table { border-collapse:collapse; width:100%; margin:12px 0; font-size:0.92em; }
  th, td { border:1px solid #ddd; padding:8px 12px; text-align:left; }
  th { background:#f0f4ff; font-weight:600; }
  blockquote { border-left:3px solid #2563eb; padding-left:12px; color:#555; margin:12px 0; }
  hr { border:none; border-top:1px solid #ddd; margin:24px 0; }
  code { background:#f0f0f0; padding:2px 6px; border-radius:3px; font-size:0.9em; }
  pre { background:#f5f5f5; padding:16px; border-radius:6px; overflow-x:auto; font-size:0.85em; line-height:1.5; }
  pre code { background:none; padding:0; }
  li { margin:4px 0; }
  @media print { body { margin:0; padding:20px; } }
</style>
</head>
<body>
${htmlBody}
</body>
</html>`;
    writeFileSync(htmlPath, htmlDoc, "utf-8");

    const downloadUrl = `/api/export-file?file=${encodeURIComponent(fullName)}&html=${encodeURIComponent(htmlName)}`;
    return NextResponse.json({
      success: true,
      data: { filename: fullName, downloadUrl, htmlDownloadUrl: `/api/export-file?file=${encodeURIComponent(htmlName)}`, size: content.length },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// GET — serve the file for download
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const file = url.searchParams.get("file");
    if (!file) {
      return NextResponse.json({ success: false, error: "file param required" }, { status: 400 });
    }

    // Sanitize: prevent path traversal
    const safeName = file.replace(/\.\.\/|\\/g, "");
    const filePath = resolve(process.cwd(), "output", safeName);

    if (!existsSync(filePath)) {
      return NextResponse.json({ success: false, error: "file not found" }, { status: 404 });
    }

    const { readFileSync } = await import("fs");
    const content = readFileSync(filePath, "utf-8");
    const ext = safeName.split(".").pop() || "md";

    const mime: Record<string, string> = {
      md: "text/markdown;charset=utf-8",
      html: "text/html;charset=utf-8",
      txt: "text/plain;charset=utf-8",
    };

    return new NextResponse(content, {
      headers: {
        "Content-Type": mime[ext] || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

/* ── Helpers ── */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMd(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let pending: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let inBlockquote = false;
  let bqLines: string[] = [];

  function flushPending() {
    if (pending.length > 0) {
      result.push(`<p>${pending.join("<br>")}</p>`);
      pending = [];
    }
  }

  function flushBlockquote() {
    if (bqLines.length > 0) {
      result.push(`<blockquote>${bqLines.join("<br>")}</blockquote>`);
      bqLines = [];
    }
    inBlockquote = false;
  }

  function flushTable() {
    if (tableRows.length === 0) return;
    const clean: string[][] = [];
    let hasSep = false;
    for (const r of tableRows) {
      if (r.every(c => /^:?-{3,}:?$/.test(c))) { hasSep = true; continue; }
      clean.push(r);
    }
    if (clean.length === 0) { tableRows = []; return; }
    if (!hasSep && clean.length > 1) {
      clean.splice(1, 0, clean[0].map(() => "---"));
    }
    result.push("<table>");
    for (let ri = 0; ri < clean.length; ri++) {
      const tag = ri === 0 ? "th" : "td";
      result.push(`<tr>${clean[ri].map(c => `<${tag}>${inlineMd(c)}</${tag}>`).join("")}</tr>`);
    }
    result.push("</table>");
    tableRows = [];
  }

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Fenced code block
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        const escaped = escapeHtml(codeLines.join("\n"));
        result.push(`<pre><code>${escaped}</code></pre>`);
        codeLines = [];
        inCodeBlock = false;
        continue;
      }
      flushTable();
      flushBlockquote();
      flushPending();
      inCodeBlock = true;
      continue;
    }
    if (inCodeBlock) { codeLines.push(raw); continue; }

    // Table row
    if (line.startsWith("|") && line.endsWith("|")) {
      flushBlockquote();
      flushPending();
      inTable = true;
      tableRows.push(line.slice(1, -1).split("|").map(c => c.trim()));
      continue;
    }
    if (inTable) { flushTable(); inTable = false; }

    // Headings
    if (/^#{1,3}\s/.test(line)) {
      flushBlockquote(); flushPending();
      const m = line.match(/^(#{1,3})\s+(.+)/);
      if (m) { result.push(`<h${m[1].length}>${inlineMd(m[2])}</h${m[1].length}>`); }
      continue;
    }

    // HR
    if (/^(\s*[-*]\s*){3,}$/.test(line)) { flushBlockquote(); flushPending(); result.push("<hr>"); continue; }

    // Blockquote
    if (line.startsWith("> ")) {
      flushPending();
      if (!inBlockquote) inBlockquote = true;
      bqLines.push(inlineMd(line.slice(2)));
      continue;
    }

    // Unordered list
    if (/^[-*]\s/.test(line)) {
      flushBlockquote(); flushPending();
      result.push(`<li>${inlineMd(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      flushBlockquote(); flushPending();
      result.push(`<li>${inlineMd(line.replace(/^\d+\.\s+/, ""))}</li>`);
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      flushTable();
      flushBlockquote();
      flushPending();
      continue;
    }

    // Regular text
    if (inBlockquote) {
      flushBlockquote();
    }
    pending.push(inlineMd(line));
  }

  flushTable();
  flushBlockquote();
  flushPending();

  return result.join("\n");
}
