import { NextResponse } from "next/server";
import { chromium } from "playwright";
import fs from "fs";
import os from "os";
import path from "path";

interface CvSection {
  id: string;
  title: string;
  content: string;
}

interface GenerateCvPdfRequest {
  sections: CvSection[];
  template?: "clean" | "modern" | "compact";
  targetCompany?: string;
  profile?: {
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    portfolioUrl?: string;
  };
}

const PROJECT_ROOT = path.join(process.cwd());

function findChromiumExecutable(): string {
  const bundled = chromium.executablePath();
  if (bundled && fs.existsSync(bundled)) return bundled;

  const platform = os.platform();
  const exeName = platform === "win32" ? "chrome.exe" : "chrome";
  const subdir =
    platform === "win32" ? "chrome-win64" :
    platform === "darwin" ? "chrome-mac" : "chrome-linux64";

  const playwrightDir = path.join(os.homedir(), "AppData", "Local", "ms-playwright");
  if (!fs.existsSync(playwrightDir)) {
    throw new Error("Playwright browsers not installed. Run: npx playwright install chromium");
  }

  const dir = fs.readdirSync(playwrightDir)
    .find((e) => e.startsWith("chromium-") && !e.includes("headless_shell"));

  if (!dir) {
    throw new Error("Chromium browser not found in Playwright directory. Run: npx playwright install chromium");
  }

  const exe = path.join(playwrightDir, dir, subdir, exeName);
  if (!fs.existsSync(exe)) {
    throw new Error(`Chromium executable not found at ${exe}`);
  }

  return exe;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateCvPdfRequest;
    const { targetCompany } = body;
    const profile = body.profile || {};

    // HTML 构建已抽出为纯函数（Spec 24）：渲染→解析→反测闭环的可测接缝
    const { buildCvHtml } = await import("@/lib/server/cv-pdf-html");
    let html: string;
    try {
      html = buildCvHtml({ sections: body.sections || [], template: body.template, profile });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : "简历内容不能为空，请先填写简历" },
        { status: 400 },
      );
    }

    // Generate PDF via Playwright
    const browser = await chromium.launch({
      headless: true,
      executablePath: findChromiumExecutable(),
      args: ["--no-sandbox", "--disable-gpu", "--disable-setuid-sandbox"],
    });
    let pdfBuffer: Buffer;

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load", timeout: 30000 });
      await Promise.race([
        page.evaluate(() => document.fonts.ready),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);

      pdfBuffer = await page.pdf({
        format: "A4",
        margin: { top: "0.6in", bottom: "0.6in", left: "0.6in", right: "0.6in" },
        printBackground: true,
        displayHeaderFooter: false,
      });
    } finally {
      await browser.close();
    }

    const date = new Date().toISOString().slice(0, 10);
    const company = targetCompany || "cv";
    const filename = `cv-${company}-${date}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Generate CV PDF error:", message);
    return NextResponse.json(
      { success: false, error: `PDF 生成失败: ${message}` },
      { status: 500 },
    );
  }
}
