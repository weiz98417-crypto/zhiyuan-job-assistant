import type { ToolDefinition, ToolResult } from "../types";

interface ReportData {
  company: string;
  role: string;
}

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const reportNum = Number(params.reportNum);
  if (!reportNum) return { success: false, data: null, error: "reportNum is required" };

  try {
    const res = await fetch(`/api/data/reports/${reportNum}`);
    const json = await res.json();
    if (!json.success) return { success: false, data: null, error: json.error || "报告不存在" };

    const report = json.data as ReportData;
    const downloadUrl = `/api/reports/${reportNum}/pdf`;
    return {
      success: true,
      data: {
        reportNum,
        company: report.company,
        role: report.role,
        filename: `report-${reportNum}.pdf`,
        downloadUrl,
      },
      llmSummary: `报告 #${reportNum} 的 PDF 下载链接已生成。`,
    };
  } catch (err) {
    return { success: false, data: null, error: `导出失败: ${err instanceof Error ? err.message : "unknown"}` };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `PDF 导出失败: ${result.error}`;
  const d = result.data as { reportNum?: number; company?: string; role?: string; downloadUrl?: string } | null;
  return d
    ? `报告 #${d.reportNum}（${d.company} - ${d.role}）PDF 已生成：${d.downloadUrl}`
    : "PDF 已生成";
}

export const downloadReportPDF: ToolDefinition = {
  name: "download_report_pdf",
  description: "将评估报告导出为真正的 PDF 下载文件，返回可点击下载链接。",
  parameters: {
    reportNum: { type: "number", required: true, description: "报告编号" },
  },
  category: "action",
  handler,
  formatResult,
};
