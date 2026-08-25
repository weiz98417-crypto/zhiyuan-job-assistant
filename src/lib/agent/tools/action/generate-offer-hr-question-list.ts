import type { OfferEvaluationReport, OfferSnapshot } from "@/types";
import { getOfferReportForAgent } from "@/lib/server/offer-agent-service";
import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";

function apiPath(path: string): string {
  return typeof window === "undefined" ? `http://localhost:3000${path}` : path;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

async function loadReport(reportId: number): Promise<Partial<OfferEvaluationReport> | null> {
  const res = await fetch(apiPath(`/api/offer-reports/${reportId}`));
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.success || !json.data) return null;
  const row = json.data as Record<string, unknown>;
  const snapshot = parseJson<Partial<OfferSnapshot>>(row.offer_snapshot_json, {});
  return {
    id: Number(row.id),
    company: snapshot.company || "",
    role: snapshot.role || "",
    summary: String(row.summary || ""),
    redFlags: parseJson(row.red_flags_json, []),
    missingInfo: parseJson(row.missing_info_json, []),
    hrQuestions: parseJson(row.hr_questions_json, []),
  };
}

async function handler(
  params: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  const reportId = Number(params.offerReportId || params.reportId || 0);
  if (!Number.isFinite(reportId) || reportId <= 0) {
    return { success: false, data: null, error: "缺少 offerReportId", errorCategory: "need_user_input" };
  }
  const report = context
    ? await getOfferReportForAgent(context.principal, reportId)
    : await loadReport(reportId);
  if (!report) {
    return { success: false, data: null, error: "未找到 Offer 报告", errorCategory: "need_user_input" };
  }

  const questions = [
    ...(report.hrQuestions || []),
    "请问 offer 里的薪资、年终、补贴哪些是写入正式 offer/合同的？",
    "五险一金按哪个城市和什么基数缴纳？公积金比例是多少？",
    "试用期工资比例、考核标准和转正流程是怎样的？",
    "工作时间、加班补偿、调休和年假规则是怎样的？",
    "用工主体是否与目标公司一致？是否存在外包、派遣或第三方合同？",
  ];
  const unique = Array.from(new Set(questions)).slice(0, 12);
  const result = {
    reportId,
    company: report.company,
    role: report.role,
    priorityQuestions: unique.slice(0, 5),
    fullChecklist: unique,
    sourceMissingInfo: report.missingInfo || [],
    sourceRedFlags: report.redFlags || [],
  };

  return {
    success: true,
    data: result,
    errorCategory: "ok",
    llmSummary: `已生成 ${report.company} Offer 的 HR 问询清单，优先确认：${result.priorityQuestions.slice(0, 3).join("；")}。`,
    uiPayload: { type: "offer_hr_question_list", reportId, questions: result },
    rawData: result,
  };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `生成 HR 问询清单失败：${result.error}`;
  return result.llmSummary || "已生成 HR 问询清单";
}

export const generateOfferHRQuestionList: ToolDefinition = {
  name: "generate_offer_hr_question_list",
  description: "基于已保存的 Offer 评估报告生成 HR 问询清单。用户问'要问 HR 什么/帮我列问题/哪些点要确认'时调用。不要重新评估 Offer。",
  matchHints: ["问HR", "HR问题", "问询清单", "确认哪些", "要问什么"],
  parameters: {
    offerReportId: { type: "number", required: true, description: "已保存 Offer 评估报告 ID。" },
  },
  category: "action",
  toolCtxCap: 900,
  handler,
  formatResult,
};
