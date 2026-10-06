import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { findChromiumExecutable } from "@/lib/server/chromium";

/**
 * 简历 PDF 的唯一渲染出口(spec 37 收口后:原 /api/cv/generate-pdf Puppeteer 死路由与
 * generate-pdf.mjs 脚本已删)。HTML 构建走 cv-pdf-html.ts 纯函数接缝。
 */

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
      executablePath: findChromiumExecutable(true),
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
