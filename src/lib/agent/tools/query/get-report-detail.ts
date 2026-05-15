import type { ToolDefinition, ToolResult } from "../types";

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  // Discovery mode: list recent reports
  if (params.list === true || params.list === "true") {
    try {
      const listRes = await fetch("/api/data/reports");
      const listJson = await listRes.json();
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
    const res = await fetch(`/api/data/reports/${id}`);
    const json = await res.json();
    if (!json.success) {
      // Build helpful error with recent reports list
      let errMsg = json.error || "报告不存在";
      try {
        const listRes = await fetch("/api/data/reports");
        const listJson = await listRes.json();
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

    // Build llmSummary — full A-G content for LLM
    const llmParts: string[] = [];
    llmParts.push(`# ${d.company || "未知公司"} — ${d.role || "未知岗位"}`);
    llmParts.push(`**${d.overall_score || "-"}/5** | ${d.archetype || ""} | ${d.date || ""}`);
    llmParts.push(`报告编号: ${d.report_num || "-"}`);
    for (const key of ["a", "b", "c", "d", "e", "f", "g"]) {
      const block = blocks[key];
      if (!block) continue;
      const content = typeof block === "string" ? block : (block.content || "");
      if (!content.trim()) continue;
      llmParts.push(`## ${labels[key] || key.toUpperCase()}`);
      llmParts.push(content);
    }

    return {
      success: true,
      errorCategory: "ok",
      llmSummary: llmParts.join("\n\n") || `报告 #${d.report_num} 内容为空`,
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
  category: "query", handler, formatResult, toolCtxCap: 8000,
};
