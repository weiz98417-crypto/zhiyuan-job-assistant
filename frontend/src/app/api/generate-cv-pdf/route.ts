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

const PROJECT_ROOT = path.join(process.cwd(), "..");

function findChromiumExecutable(): string {
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

function getTemplateCSS(template: string): string {
  switch (template) {
    case "modern":
      return `
        .page { display: flex !important; }
        .sidebar { width: 35% !important; background: #f5f5f5 !important; padding: 1.5cm !important; }
        .main-content { width: 65% !important; padding: 1.5cm !important; }
        h1 { font-size: 18pt !important; }
        h2 { font-size: 12pt !important; }
        .competency-tag { display: inline-block !important; margin: 2px !important; padding: 2px 8px !important; background: #e0e0e0 !important; border-radius: 3px !important; font-size: 8pt !important; }
      `;
    case "compact":
      return `
        body { font-size: 9pt !important; line-height: 1.3 !important; }
        h1 { font-size: 14pt !important; }
        h2 { font-size: 11pt !important; margin-top: 4pt !important; margin-bottom: 2pt !important; }
        .section { margin-bottom: 6pt !important; }
        .competency-tag { font-size: 7pt !important; padding: 1px 5px !important; }
        p, li { font-size: 9pt !important; margin-bottom: 1pt !important; }
        .job { margin-bottom: 6pt !important; }
      `;
    default:
      return "";
  }
}

function normalizeTextForATS(html: string): string {
  let t = html;
  t = t.replace(/—/g, "-");
  t = t.replace(/–/g, "-");
  t = t.replace(/[“”„‟]/g, '"');
  t = t.replace(/[‘’‚‛]/g, "'");
  t = t.replace(/…/g, "...");
  t = t.replace(/[​‌‍⁠﻿]/g, "");
  t = t.replace(/ /g, " ");
  return t;
}

function getSection(sections: CvSection[], id: string): string {
  return sections.find((s) => s.id === id)?.content || "";
}

/** Build an HTML job entry for experience/projects */
function buildJobHtml(jobs: string[]): string {
  return jobs
    .filter(Boolean)
    .map((job) => {
      const lines = job.split("\n").filter(Boolean);
      if (lines.length < 2) return `<p>${job}</p>`;
      const company = lines[0];
      const role = lines[1];
      const bullets = lines.slice(2).map((l) => `<li>${l}</li>`).join("");
      return `<div class="job">
  <div class="job-header">
    <span class="job-company">${company}</span>
  </div>
  <div class="job-role">${role}</div>
  <ul>${bullets}</ul>
</div>`;
    })
    .join("\n");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateCvPdfRequest;
    const { sections = [], targetCompany } = body;
    const profile = body.profile || {};

    const summaryText = getSection(sections, "summary");
    const skillsText = getSection(sections, "skills");
    const educationText = getSection(sections, "education");

    if (!summaryText && !skillsText && !educationText) {
      return NextResponse.json(
        { success: false, error: "简历内容不能为空，请先填写简历" },
        { status: 400 },
      );
    }

    // Load template
    const templatePath = path.join(PROJECT_ROOT, "templates", "cv-template.html");
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json(
        { success: false, error: "CV 模板文件未找到" },
        { status: 500 },
      );
    }

    let html = fs.readFileSync(templatePath, "utf-8");

    // Replace placeholders
    const name = profile.fullName || "Your Name";
    html = html
      .replace(/{{LANG}}/g, "zh-CN")
      .replace(/{{NAME}}/g, name)
      .replace(/{{PHONE}}/g, profile.phone || "")
      .replace(/{{EMAIL}}/g, profile.email || "")
      .replace(/{{LOCATION}}/g, profile.location || "")
      .replace(/{{LINKEDIN_URL}}/g, profile.linkedin ? `https://${profile.linkedin}` : "")
      .replace(/{{LINKEDIN_DISPLAY}}/g, profile.linkedin || "")
      .replace(/{{PORTFOLIO_URL}}/g, profile.portfolioUrl || "")
      .replace(/{{PORTFOLIO_DISPLAY}}/g, profile.portfolioUrl || "")
      .replace(/{{PAGE_WIDTH}}/g, "210mm")
      .replace(/{{SECTION_SUMMARY}}/g, "Professional Summary")
      .replace(/{{SUMMARY_TEXT}}/g, summaryText || " ")
      .replace(/{{SECTION_COMPETENCIES}}/g, "Skills")
      .replace(/{{COMPETENCIES}}/g, skillsText
        ? skillsText.split(/[,，\n]/).filter(Boolean).map((s) => `<span class="competency-tag">${s.trim()}</span>`).join("\n")
        : " ")
      .replace(/{{SECTION_EXPERIENCE}}/g, "Experience")
      .replace(/{{EXPERIENCE}}/g, buildJobHtml(getSection(sections, "experience").split(/\n\n+/)))
      .replace(/{{SECTION_PROJECTS}}/g, "Projects")
      .replace(/{{PROJECTS}}/g, buildJobHtml(getSection(sections, "projects").split(/\n\n+/)))
      .replace(/{{SECTION_EDUCATION}}/g, "Education")
      .replace(/{{EDUCATION}}/g, educationText
        ? educationText.split("\n").filter(Boolean).map((l) => `<p>${l}</p>`).join("\n")
        : " ")
      .replace(/{{SECTION_CERTIFICATIONS}}/g, "Certifications")
      .replace(/{{CERTIFICATIONS}}/g, " ")
      .replace(/{{SECTION_SKILLS}}/g, "Languages & Tools")
      .replace(/{{SKILLS}}/g, " ");

    // Fix font paths to absolute
    const fontsDir = path.join(PROJECT_ROOT, "fonts");
    html = html.replace(
      /url\(['"]?\.\/fonts\//g,
      `url('file://${fontsDir.replace(/\\/g, "/")}/`
    );
    html = html.replace(
      /file:\/\/([^'")]+)\.(woff2?|ttf|otf)['"]?\)/g,
      `file://$1.$2')`
    );

    // Inject template-specific CSS
    const template = body.template || "clean";
    const templateCSS = getTemplateCSS(template);
    html = html.replace("</head>", `<style>${templateCSS}</style></head>`);

    // ATS normalize
    html = normalizeTextForATS(html);

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
