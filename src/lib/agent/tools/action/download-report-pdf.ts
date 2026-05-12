import type { ToolDefinition, ToolResult } from "../types";

interface ReportData {
  company: string;
  role: string;
  overall_score: number;
  archetype: string;
  legitimacy: string;
  date: string;
  blocks_json: string;
  keywords_json: string;
}

function parseBlocks(blocksJson: string): Record<string, { content: string; score: number }> {
  try { return JSON.parse(blocksJson); } catch { return {}; }
}

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const reportNum = params.reportNum as number;
  if (!reportNum) return { success: false, data: null, error: "reportNum is required" };

  try {
    const res = await fetch(`/api/data/reports/${reportNum}`);
    const json = await res.json();
    if (!json.success) return { success: false, data: null, error: json.error || "报告不存在" };

    const r = json.data as ReportData;
    const blocks = parseBlocks(r.blocks_json || "{}");

    const blockLabels: Record<string, string> = {
      a: "A · 职位概览", b: "B · 简历匹配", c: "C · 职级与策略",
      d: "D · 薪资与市场", e: "E · 定制化方案", f: "F · 面试准备", g: "G · 职位合法性",
    };

    let body = "";
    for (const bk of ["a", "b", "c", "d", "e", "f", "g"]) {
      const b = blocks[bk];
      if (b?.content) {
        body += `<section><h2>${blockLabels[bk]}</h2>${b.content.replace(/\n/g, "<br>")}</section>`;
      }
    }

    const keywords = (() => { try { return JSON.parse(r.keywords_json || "[]"); } catch { return []; } })();
    const kwStr = keywords.length ? `<p><strong>关键词：</strong>${keywords.join("、")}</p>` : "";

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${r.company} — ${r.role} 评估报告</title>
<style>
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #333; line-height: 1.7; }
  h1 { font-size: 1.5em; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }
  h2 { font-size: 1.15em; margin-top: 28px; color: #1e40af; }
  .meta { color: #666; font-size: 0.9em; margin-bottom: 24px; }
  .score { font-size: 1.3em; font-weight: bold; color: #2563eb; }
  section { margin-bottom: 20px; }
  @media print { body { margin: 0; padding: 20px; } }
</style>
</head>
<body>
<h1>${r.company} — ${r.role}</h1>
<div class="meta">
  <p><span class="score">${r.overall_score}/5</span> | ${r.archetype || ""} | ${r.legitimacy || ""} | ${r.date || ""}</p>
  ${kwStr}
</div>
${body}
<script>window.onload = () => { setTimeout(() => window.print(), 500); }</script>
</body>
</html>`;

    const w = window.open("", "_blank");
    if (!w) return { success: false, data: null, error: "浏览器拦截了弹窗，请允许弹窗后重试" };
    w.document.write(html);
    w.document.close();

    return { success: true, data: { reportNum, company: r.company, role: r.role } };
  } catch (err) {
    return { success: false, data: null, error: `导出失败: ${err instanceof Error ? err.message : "unknown"}` };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `PDF 导出失败: ${result.error}`;
  const d = result.data as { reportNum?: number; company?: string; role?: string } | null;
  return d
    ? `已打开报告 #${d.reportNum}（${d.company} — ${d.role}）的打印对话框。选择"另存为 PDF"即可下载。`
    : "已打开打印对话框";
}

export const downloadReportPDF: ToolDefinition = {
  name: "download_report_pdf",
  description: "将评估报告导出为 PDF。打开格式化后的报告页面并触发浏览器打印对话框，用户选择「另存为 PDF」即可下载。",
  parameters: {
    reportNum: { type: "number", required: true, description: "报告编号" },
  },
  category: "action",
  handler,
  formatResult,
};
