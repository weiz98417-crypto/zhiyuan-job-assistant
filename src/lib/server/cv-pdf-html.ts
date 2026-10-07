/**
 * CV PDF 渲染的 HTML 构建（Spec 24 从 generate-cv-pdf/route.ts 抽出为纯函数）。
 * 抽出的目的：渲染→解析→反测闭环——测试可以对同一结构化源断言
 * 「渲染产物（剥标签后）包含源中的每个数字/关键词」，数字丢失即 fail。
 */
import fs from "node:fs";
import path from "node:path";

export interface CvSection {
  id: string;
  title: string;
  content: string;
}

export interface CvProfile {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  portfolioUrl?: string;
}

export interface BuildCvHtmlInput {
  sections: CvSection[];
  template?: "clean" | "modern" | "compact";
  profile?: CvProfile;
}

export function normalizeTextForATS(html: string): string {
  let t = html;
  t = t.replace(/—/g, "-");
  t = t.replace(/–/g, "-");
  t = t.replace(/[“”„‟]/g, '"');
  t = t.replace(/[‘’‚‛]/g, "'");
  t = t.replace(/…/g, "...");
  t = t.replace(/[​‌‍⁠﻿]/g, "");
  t = t.replace(/ /g, " ");
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

export function getTemplateCSS(template: string): string {
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

/** 从结构化 CV 源渲染完整 HTML（与原 route 行为一致，模板文件缺失时抛错）。 */
export function buildCvHtml(input: BuildCvHtmlInput): string {
  const { sections = [], template = "clean" } = input;
  const profile = input.profile || {};
  const summaryText = getSection(sections, "summary");
  const skillsText = getSection(sections, "skills");
  const educationText = getSection(sections, "education");

  if (!summaryText && !skillsText && !educationText) {
    throw new Error("简历内容不能为空，请先填写简历");
  }

  const templatePath = path.join(process.cwd(), "templates", "cv-template.html");
  if (!fs.existsSync(templatePath)) throw new Error("CV 模板文件未找到");
  let html = fs.readFileSync(templatePath, "utf-8");

  const name = profile.fullName || "Your Name";
  html = html
    .replace(/{{LANG}}/g, "zh-CN")
    .replace(/{{NAME}}/g, name)
    .replace(/{{PHONE}}/g, profile.phone || "")
    .replace(/{{EMAIL}}/g, profile.email || "")
    .replace(/{{LOCATION}}/g, profile.location || "")
    .replace(/{{LINKEDIN_URL}}/g, profile.linkedin ? `https://${profile.linkedin}` : "")
    .replace(/{{LINKEDIN_DISPLAY}}/g, profile.linkedin || "")
    .replace(/{{PORTFOLIO_URL}}/g, profile.portfolioUrl ? `https://${profile.portfolioUrl}` : "")
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
  // 视觉反测(spec 38)抓出的两个渲染缺陷修复:
  // ① 恒空板块(Certifications/Languages & Tools)整块删除——只清标题文字会留下带下边框的空标题条;
  html = html
    .replace(/<!-- CERTIFICATIONS -->[\s\S]*?<div class="section-title">\{\{SECTION_CERTIFICATIONS\}\}<\/div>\s*\{\{CERTIFICATIONS\}\}\s*<\/div>/, "")
    .replace(/<!-- SKILLS -->[\s\S]*?<div class="section-title">\{\{SECTION_SKILLS\}\}<\/div>\s*\{\{SKILLS\}\}\s*<\/div>/, "");

  // ② 联系方式行空字段渲染悬空「|」——按分隔符切段,剔空后重组;
  html = html.replace(/<div class="contact-row">([\s\S]*?)<\/div>/, (_row, inner: string) => {
    const separator = '<span class="separator">|</span>';
    const segments = inner.split(separator).map((segment) => segment.trim());
    const kept = segments.filter((segment) => segment.replace(/<[^>]+>/g, "").trim().length > 0);
    const rebuilt = kept.join(`\n      ${separator}`);
    return `<div class="contact-row">\n      ${rebuilt}\n    </div>`;
  });

  const fontsDir = path.join(process.cwd(), "fonts");
  html = html.replace(/url\(['"]?\.\/fonts\//g, `url('file://${fontsDir.replace(/\\/g, "/")}/`);
  html = html.replace(/file:\/\/([^'")]+)\.(woff2?|ttf|otf)['"]?\)/g, `file://$1.$2')`);

  const templateCSS = getTemplateCSS(template);
  html = html.replace("</head>", `<style>${templateCSS}</style></head>`);
  return normalizeTextForATS(html);
}

/** 剥离 HTML 标签得到纯文本（反测用）。 */
export function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}
