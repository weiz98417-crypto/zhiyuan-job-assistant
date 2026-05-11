/* ── CLI Data Format Exporters ── */
/* Export IndexedDB data back to 筝筝纸鸢 CLI-compatible formats */

import type { Application } from "@/types";
import { STATUS_LABELS } from "@/types";

/** Export applications to applications.md markdown table format */
export function exportApplicationsMD(applications: Application[]): string {
  const header =
    "| # | Date | Company | Role | Score | Status | PDF | Report | Notes |";
  const separator =
    "|---|------|---------|------|-------|--------|-----|--------|-------|";
  const rows = applications
    .sort((a, b) => a.num - b.num)
    .map((app) => {
      const score =
        app.score > 0 ? `**${app.score.toFixed(1)}/5**` : "N/A";
      const pdf = app.pdfGenerated ? "✅" : "❌";
      const report = app.reportPath
        ? `[${app.num}](${app.reportPath})`
        : "";
      return `| ${app.num} | ${app.date} | ${app.company} | ${app.role} | ${score} | ${STATUS_LABELS[app.status]} | ${pdf} | ${report} | ${app.notes || ""} |`;
    });

  return [header, separator, ...rows].join("\n") + "\n";
}

/** Create a downloadable blob and trigger download */
export function downloadAsFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
