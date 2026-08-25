import type { OfferEvaluationReport, OfferSnapshot } from "@/types";
import { getAgentReadService } from "@/lib/agent/runtime/agent-read-service";
import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";

function apiPath(path: string): string {
  return typeof window === "undefined" ? `http://localhost:3000${path}` : path;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function handler(params: Record<string, unknown>, context?: ToolExecutionContext): Promise<ToolResult> {
  const reportId = Number(params.offerReportId || params.reportId || 0);
  if (!Number.isFinite(reportId) || reportId <= 0) {
    return {
      success: false,
      data: null,
      error: "缺少 offerReportId",
      errorCategory: "need_user_input",
      llmSummary: "没有可读取的 Offer 报告编号。请先评估 Offer，或让用户选择一份报告。",
    };
  }

  const res = context?.principal
    ? undefined
    : await fetch(apiPath(`/api/offer-reports/${reportId}`));
  if (res && !res.ok) {
      return {
        success: false,
        data: null,
        error: `读取 Offer 报告失败: HTTP ${res.status}`,
        errorCategory: "permanent",
      };
  }
  const directReport = context?.principal
    ? await getAgentReadService().getOfferReport(context.principal, reportId)
    : undefined;
  const json = context?.principal
    ? { success: Boolean(directReport), data: directReport }
    : await res!.json();
  if (!json.success || !json.data) {
    return {
      success: false,
      data: null,
      error: "未找到 Offer 报告",
      errorCategory: "need_user_input",
    };
  }

  const row = json.data as Record<string, unknown>;
  const snapshot = parseJson<Partial<OfferSnapshot>>(row.offer_snapshot_json, {});
  const report: Partial<OfferEvaluationReport> = {
    id: Number(row.id),
    reportType: (row.report_type as "single" | "comparison") || "single",
    modelVersion: String(row.model_version || ""),
    offerId: Number(row.offer_id || 0) || undefined,
    company: snapshot.company || "",
    role: snapshot.role || "",
    overallScore: Number(row.overall_score || 0),
    verdict: row.verdict as OfferEvaluationReport["verdict"],
    summary: String(row.summary || ""),
    modules: parseJson(row.modules_json, []),
    redFlags: parseJson(row.red_flags_json, []),
    missingInfo: parseJson(row.missing_info_json, []),
    negotiationLevers: parseJson(row.negotiation_levers_json, []),
    hrQuestions: parseJson(row.hr_questions_json, []),
    assumptions: parseJson(row.assumptions_json, []),
    takeHomeEstimate: parseJson(row.take_home_json, undefined),
    offerSnapshot: snapshot as OfferSnapshot,
    createdAt: String(row.created_at || ""),
  };

  return {
    success: true,
    data: report,
    errorCategory: "ok",
    llmSummary: `已读取 Offer 报告 #${report.id}：${report.summary || `${report.company} ${report.role}，评分 ${report.overallScore}/5`}。红旗：${report.redFlags?.slice(0, 3).join("；") || "暂无"}。缺失信息：${report.missingInfo?.slice(0, 3).join("；") || "暂无"}。`,
    uiPayload: {
      type: "offer_report",
      reportId: report.id,
      offerId: report.offerId,
      company: report.company,
      role: report.role,
      overallScore: report.overallScore,
      verdict: report.verdict,
    },
    rawData: report,
  };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `读取 Offer 报告失败：${result.error}`;
  return result.llmSummary || "已读取 Offer 报告";
}

export const readOfferReport: ToolDefinition = {
  name: "read_offer_report",
  description: "读取已保存的单个 Offer 评估报告。用户问解释、谈判、HR 问题且已有报告时优先调用，不要重新评估。",
  matchHints: ["读取offer报告", "已有报告", "刚才的offer", "这个offer报告"],
  parameters: {
    offerReportId: { type: "number", required: true, description: "Offer 报告 ID。" },
  },
  category: "query",
  toolCtxCap: 900,
  handler,
  formatResult,
};
