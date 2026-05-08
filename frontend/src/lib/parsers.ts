/* ── CLI Data Format Parsers ── */
/* Parse 筝筝纸鸢 CLI Markdown/TSV/YAML data into typed objects */

import type { Application, ApplicationStatus, EvaluationReport } from "@/types";
import { STATUS_ORDER } from "@/types";

/** Parse applications.md markdown table into Application[] */
export function parseApplicationsMD(markdown: string): Application[] {
  const lines = markdown.trim().split("\n");
  const applications: Application[] = [];

  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      if (trimmed.includes("---")) continue;
      if (trimmed.includes("Date") && trimmed.includes("Company")) {
        inTable = true;
        continue;
      }
      if (!inTable) continue;

      const cells = trimmed
        .split("|")
        .filter((c) => c !== "")
        .map((c) => c.trim());

      if (cells.length >= 8) {
        const scoreStr = cells[4].replace(/\*\*/g, "");
        const score = scoreStr === "N/A" || scoreStr === "DUP" ? 0 : parseFloat(scoreStr.split("/")[0]) || 0;
        const status = normalizeStatus(cells[5].replace(/\*\*/g, ""));

        applications.push({
          num: parseInt(cells[0]) || 0,
          date: cells[1],
          company: cells[2],
          role: cells[3],
          score,
          status,
          pdfGenerated: cells[6].includes("✅"),
          reportPath: extractReportPath(cells[7]),
          notes: cells[8] || "",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
  }

  return applications;
}

/** Normalize Chinese/legacy statuses to canonical status */
function normalizeStatus(raw: string): ApplicationStatus {
  const cleaned = raw.trim();
  const mapping: Record<string, ApplicationStatus> = {
    "已评估": "evaluated",
    "Evaluated": "evaluated",
    "已投递": "applied",
    "Applied": "applied",
    "已回复": "responded",
    "已沟通": "responded",
    "Responded": "responded",
    "面试中": "interview",
    "面试": "interview",
    "Interview": "interview",
    "已获Offer": "offer",
    "已发Offer": "offer",
    "Offer": "offer",
    "已拒绝": "rejected",
    "已淘汰": "rejected",
    "Rejected": "rejected",
    "已放弃": "discarded",
    "已关闭": "discarded",
    "Discarded": "discarded",
    "跳过": "skip",
    "SKIP": "skip",
    "Skip": "skip",
  };
  const result = mapping[cleaned];
  if (result) return result;
  if (STATUS_ORDER.includes(cleaned as ApplicationStatus)) return cleaned as ApplicationStatus;
  return "evaluated";
}

function extractReportPath(cell: string): string | undefined {
  const match = cell.match(/\]\(([^)]+)\)/);
  return match ? match[1] : undefined;
}

/** Parse an evaluation report markdown into EvaluationReport */
export function parseReportMD(markdown: string): Partial<EvaluationReport> {
  const report: Partial<EvaluationReport> = {
    scores: { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: "" },
    blocks: { a: "", b: "", c: "", d: "", e: "", f: "", g: "" },
    keywords: [],
  };

  // Extract metadata
  const dateMatch = markdown.match(/\*\*日期:\*\*\s*(.+)/);
  if (dateMatch) report.date = dateMatch[1].trim();

  const archetypeMatch = markdown.match(/\*\*Archetype:\*\*\s*(.+)/);
  if (archetypeMatch) report.archetype = archetypeMatch[1].trim();

  const scoreMatch = markdown.match(/\*\*Score:\*\*\s*([\d.]+)\/5/);
  if (scoreMatch) report.overallScore = parseFloat(scoreMatch[1]);

  const legitimacyMatch = markdown.match(/\*\*Legitimacy:\*\*\s*(.+)/);
  if (legitimacyMatch) report.legitimacy = legitimacyMatch[1].trim();

  const urlMatch = markdown.match(/\*\*URL:\*\*\s*(.+)/);
  if (urlMatch) report.url = urlMatch[1].trim();

  // Extract block headers
  const blockPatterns = [
    { key: "a" as const, pattern: /## A[.\s]+职位概览([\s\S]*?)(?=## B|$)/ },
    { key: "b" as const, pattern: /## B[.\s]+简历匹配([\s\S]*?)(?=## C|$)/ },
    { key: "c" as const, pattern: /## C[.\s]+职级与策略([\s\S]*?)(?=## D|$)/ },
    { key: "d" as const, pattern: /## D[.\s]+薪资与市场([\s\S]*?)(?=## E|$)/ },
    { key: "e" as const, pattern: /## E[.\s]+定制化方案([\s\S]*?)(?=## F|$)/ },
    { key: "f" as const, pattern: /## F[.\s]+面试准备([\s\S]*?)(?=## G|$)/ },
    { key: "g" as const, pattern: /## G[.\s]+职位合法性([\s\S]*?)$/ },
  ];

  for (const { key, pattern } of blockPatterns) {
    const match = markdown.match(pattern);
    if (match) {
      report.blocks![key] = match[1].trim();
    }
  }

  // Extract keywords
  const kwMatch = markdown.match(/##\s*关键词\s*\n([\s\S]*?)(?=\n\n|$)/);
  if (kwMatch) {
    report.keywords = kwMatch[1]
      .split(/[,，\n]/)
      .map((k) => k.trim().replace(/^[-*]\s*/, ""))
      .filter(Boolean);
  }

  return report;
}
