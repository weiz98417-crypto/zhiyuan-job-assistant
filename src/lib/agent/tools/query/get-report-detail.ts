import { getAgentReadService } from "@/lib/agent/runtime/agent-read-service";
import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";

async function handler(params: Record<string, unknown>, context?: ToolExecutionContext): Promise<ToolResult> {
  // Discovery mode: list recent reports
  if (params.list === true || params.list === "true") {
    try {
      const listJson = context?.principal
        ? { success: true, data: await getAgentReadService().listReports(context.principal) }
        : await fetch("/api/data/reports").then((res) => res.json());
      if (listJson.success && Array.isArray(listJson.data)) {
        const reports = (listJson.data as Array<{ report_num: number; company: string; role: string; date: string; overall_score: number }>).slice(0, 20);
        const summary = reports.length === 0 ? "暂无报告" :
          reports.map(r => `#${r.report_num} ${r.company}-${r.role} | ${r.overall_score}/5 | ${r.date}`).join("\n");
        return { success: true, errorCategory: "ok", llmSummary: `共 ${reports.length} 份报告:\n${summary}`, data: listJson.data };
      }
    } catch (err) {
      return { success: false, data: null, error: `读取报告列表失败: ${err instanceof Error ? err.message : "unknown"}`, errorCategory: "transient" };
    }
  }

  const id = params.reportNum || params.reportId;
  try {
    const reportNum = Number(id);
    const directReport = context?.principal && Number.isFinite(reportNum)
      ? await getAgentReadService().getReport(context.principal, reportNum)
      : undefined;
    const json = context?.principal
      ? { success: Boolean(directReport), data: directReport, error: directReport ? undefined : "报告不存在" }
      : await fetch(`/api/data/reports/${id}`).then((res) => res.json());
    if (!json.success) {
      // Build helpful error with recent reports list
      let errMsg = json.error || "报告不存在";
      try {
        const listJson = context?.principal
          ? { success: true, data: await getAgentReadService().listReports(context.principal) }
          : await fetch("/api/data/reports").then((res) => res.json());
        if (listJson.success && Array.isArray(listJson.data)) {
          const reports = listJson.data.slice(0, 5) as Array<{ report_num: number; company: string; role: string; date: string }>;
          if (reports.length) {
            const list = reports.map(r => `#${r.report_num} ${r.company}-${r.role}(${r.date})`).join(", ");
            errMsg += `。最近报告: ${list}`;
          }
        }
      } catch { /* non-blocking */ }
      return { success: false, data: null, error: errMsg, errorCategory: "permanent" };
    }
    const d = json.data as Record<string, unknown>;

    // Parse blocks
    let blocks: Record<string, { content: string; score: number }> = {};
    try {
      const raw = typeof d.blocks_json === "string" ? JSON.parse(d.blocks_json) : (d.blocks_json || {});
      blocks = raw as Record<string, { content: string; score: number }>;
    } catch { /* ignore */ }

    const labels: Record<string, string> = {
      a: "A · 职位概览", b: "B · 简历匹配", c: "C · 职级与策略",
      d: "D · 薪资与市场", e: "E · 定制化方案", f: "F · 面试准备", g: "G · 职位合法性",
    };

    // Build concise LLM summary. Full blocks stay in uiPayload/rawData, not chat context.
    const blockHints: string[] = [];
    for (const key of ["a", "b", "c", "d", "e", "f", "g"]) {
      const block = blocks[key];
      if (!block) continue;
      const content = typeof block === "string" ? block : (block.content || "");
      if (!content.trim()) continue;
      const oneLine = content.replace(/\s+/g, " ").slice(0, 120);
      blockHints.push(`${labels[key] || key.toUpperCase()}: ${oneLine}${content.length > 120 ? "..." : ""}`);
    }
    const llmSummary = [
      `报告 #${d.report_num || "-"}: ${d.company || "未知公司"} — ${d.role || "未知岗位"}`,
      `总分 ${d.overall_score || "-"}/5；类型 ${d.archetype || "未识别"}；日期 ${d.date || ""}`,
      blockHints.length ? `板块摘要:\n${blockHints.join("\n")}` : "报告暂无板块内容。",
      "完整 A-G 正文只在报告详情页展示。聊天里只输出摘要和入口，不要复述完整报告。",
    ].join("\n");

    return {
      success: true,
      errorCategory: "ok",
      llmSummary,
      uiPayload: {
        type: "report_blocks",
        company: d.company,
        role: d.role,
        overallScore: d.overall_score,
        archetype: d.archetype,
        date: d.date,
        reportNum: d.report_num,
        blocks,
        labels,
      },
      rawData: d,
      data: d,
    };
  } catch (err) {
    return { success: false, data: null, error: `${err instanceof Error ? err.message : "unknown"}`, errorCategory: "permanent" };
  }
}

/** @deprecated Use llmSummary field in ToolResult instead */
function formatResult(result: ToolResult): string {
  if (!result.success) return `查询失败: ${result.error}`;
  return result.llmSummary || "";
}

export const getReportDetail: ToolDefinition = {
  name: "get_report_detail", description: "获取评估报告详情或列出所有报告。list=true 时不需 reportNum。",
  parameters: {
    reportNum: { type: "number", required: false, description: "报告编号（list=true 时不需要）" },
    list: { type: "boolean", required: false, description: "true=列出最近 20 份报告摘要（发现模式）" },
  },
  category: "query", handler, formatResult, toolCtxCap: 1200,
};
