import { getAgentReadService } from "@/lib/agent/runtime/agent-read-service";
import type { ApplicationListFilters } from "@/lib/data-repositories";
import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";

async function handler(
  params: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  const { status, company, role, score_min: scoreMin, date_from: dateFrom, limit: rawLimit, offset: rawOffset } = params;
  const filters: ApplicationListFilters = {
    status: typeof status === "string" ? status : undefined,
    company: typeof company === "string" ? company : undefined,
    role: typeof role === "string" ? role : undefined,
    score_min: typeof scoreMin === "number" ? scoreMin : undefined,
    date_from: typeof dateFrom === "string" ? dateFrom : undefined,
    limit: typeof rawLimit === "number" ? rawLimit : undefined,
    offset: typeof rawOffset === "number" ? rawOffset : undefined,
  };
  if (context) {
    try {
      const applications = await getAgentReadService().listApplications(context.principal, filters);
      return { success: true, data: applications, errorCategory: "ok", rawData: applications };
    } catch (err) {
      return {
        success: false,
        data: null,
        error: `查询失败: ${err instanceof Error ? err.message : "unknown"}`,
        errorCategory: "transient",
      };
    }
  }
  const sp = new URLSearchParams();
  if (typeof status === "string") sp.set("status", status);
  if (typeof company === "string") sp.set("company", company);
  if (typeof role === "string") sp.set("role", role);
  if (typeof scoreMin === "number") sp.set("score_min", String(scoreMin));
  if (typeof dateFrom === "string") sp.set("date_from", dateFrom);
  if (typeof rawLimit === "number") sp.set("limit", String(rawLimit));
  if (typeof rawOffset === "number") sp.set("offset", String(rawOffset));
  try {
    const res = await fetch(`/api/data/applications?${sp.toString()}`);
    const json = await res.json();
    return { success: json.success, data: json.data, error: json.error, errorCategory: json.success ? "ok" : "permanent" };
  } catch (err) {
    return { success: false, data: null, error: `请求失败: ${err instanceof Error ? err.message : "unknown"}`, errorCategory: "transient" };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `查询失败: ${result.error}`;
  const apps = (Array.isArray(result.data) ? result.data : []) as Array<{ num: number; company: string; role: string; score: number; status: string; date: string; report_path: string }>;
  if (apps.length === 0) return "未找到匹配的投递记录。";
  const lines = apps.map(a => {
    const reportNum = a.report_path ? a.report_path.match(/(\d{3})/)?.[1] : "";
    return `#${a.num} ${a.company} — ${a.role} | ${a.score}/5 | ${a.status} | ${a.date}${reportNum ? ` | 报告#${reportNum}` : ""}`;
  });
  return `找到 ${apps.length} 条投递记录:\n${lines.join("\n")}`;
}

export const searchApplications: ToolDefinition = {
  name: "search_applications",
  description: "搜索用户的投递记录。可按状态/公司/岗位/评分/日期筛选，支持分页。返回记录含报告编号，用于后续 get_report_detail 调用。",
  parameters: {
    status: { type: "string", required: false, description: "投递状态" },
    company: { type: "string", required: false, description: "公司名（模糊匹配）" },
    role: { type: "string", required: false, description: "岗位名（模糊匹配）" },
    score_min: { type: "number", required: false, description: "最低评分筛选" },
    date_from: { type: "string", required: false, description: "起始日期 YYYY-MM-DD" },
    limit: { type: "number", required: false, description: "返回数量上限，默认 20" },
    offset: { type: "number", required: false, description: "分页偏移" },
  },
  category: "query",
  handler,
  formatResult,
};
