import { NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { resolve } from "path";
import { tmpdir } from "os";

const TEMPLATE_PATH = resolve(process.cwd(), "..", "templates", "cv-template.html");

/** Convert basic markdown to HTML for PDF rendering */
function mdToHtml(md: string): string {
  return md
    // Headers
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Bullet lists
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
    // Newlines → <br> (but not after tags)
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

function fillTemplate(cvData: Record<string, unknown>): string {
  if (!existsSync(TEMPLATE_PATH)) return "<html><body>模板文件不存在</body></html>";

  let html = readFileSync(TEMPLATE_PATH, "utf-8");

  // Extract sections from cvData (could be nested in versions or flat)
  let sections: Record<string, string> = {};
  if (cvData.versions && (cvData as Record<string, unknown>).activeVersion) {
    const v = (cvData as Record<string, unknown>).versions as Record<string, { sections?: Array<{ id: string; content: string }> }>;
    const active = v[(cvData as Record<string, unknown>).activeVersion as string];
    if (active?.sections) {
      for (const s of active.sections) sections[s.id] = s.content || "";
    }
  } else {
    sections = cvData as Record<string, string>;
  }

  for (const [key, value] of Object.entries(sections)) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    html = html.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi"), mdToHtml(text) || "&nbsp;");
  }

  return html;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const cvData = body.cvData || body;

    const html = fillTemplate(cvData);

    // Write to temp file for puppeteer
    const tmpDir = tmpdir();
    const tmpPath = resolve(tmpDir, `cv-${Date.now()}.html`);
    writeFileSync(tmpPath, html, "utf-8");

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    let pdfBuffer: Buffer;
    try {
      const page = await browser.newPage();
      await page.goto(`file://${tmpPath}`, { waitUntil: "networkidle0", timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);

      pdfBuffer = Buffer.from(await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0.6in", right: "0.6in", bottom: "0.6in", left: "0.6in" },
      }));
    } finally {
      await browser.close();
      try { unlinkSync(tmpPath); } catch { /* cleanup */ }
    }

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="resume.pdf"',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json({ success: false, error: `PDF 生成失败: ${msg}` }, { status: 500 });
  }
}
