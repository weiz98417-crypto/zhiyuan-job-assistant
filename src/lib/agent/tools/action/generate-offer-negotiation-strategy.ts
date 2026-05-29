import type { OfferEvaluationReport, OfferSnapshot } from "@/types";
import type { ToolDefinition, ToolResult } from "../types";

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
    offerId: Number(row.offer_id || 0) || undefined,
    company: snapshot.company || "",
    role: snapshot.role || "",
    overallScore: Number(row.overall_score || 0),
    verdict: row.verdict as OfferEvaluationReport["verdict"],
    summary: String(row.summary || ""),
    redFlags: parseJson(row.red_flags_json, []),
    missingInfo: parseJson(row.missing_info_json, []),
    negotiationLevers: parseJson(row.negotiation_levers_json, []),
    offerSnapshot: snapshot as OfferSnapshot,
  };
}

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const reportId = Number(params.offerReportId || params.reportId || 0);
  if (!Number.isFinite(reportId) || reportId <= 0) {
    return { success: false, data: null, error: "缺少 offerReportId", errorCategory: "need_user_input" };
  }
  const report = await loadReport(reportId);
  if (!report) {
    return { success: false, data: null, error: "未找到 Offer 报告", errorCategory: "need_user_input" };
  }

  const levers = report.negotiationLevers?.length ? report.negotiationLevers : ["争取书面明确关键待遇"];
  const strategy = {
    reportId,
    company: report.company,
    role: report.role,
    targetAsks: levers,
    fallbackAsks: ["入职时间弹性", "试用期后薪资复核", "补充商业保险或餐补/交通补贴"],
    evidenceToCite: [
      `当前评估分 ${report.overallScore}/5`,
      ...(report.redFlags || []).slice(0, 3).map((r) => `风险点：${r}`),
      ...(report.missingInfo || []).slice(0, 3).map((m) => `需确认：${m}`),
    ],
    wording: [
      "我对岗位本身是感兴趣的，想把几个 offer 细节确认清楚，方便我做长期决定。",
      "如果薪资结构暂时不能调整，是否可以在公积金、签字费、试用期后 review 或补贴上做一些优化？",
      "这些点如果能以书面 offer 或邮件确认，我这边会更容易推进入职决策。",
    ],
  };

  return {
    success: true,
    data: strategy,
    errorCategory: "ok",
    llmSummary: `已生成 ${report.company} Offer 谈判策略：优先谈 ${strategy.targetAsks.slice(0, 3).join("、")}；备选谈 ${strategy.fallbackAsks.slice(0, 2).join("、")}。`,
    uiPayload: { type: "offer_negotiation_strategy", reportId, strategy },
    rawData: strategy,
  };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `生成谈判策略失败：${result.error}`;
  return result.llmSummary || "已生成谈判策略";
}

export const generateOfferNegotiationStrategy: ToolDefinition = {
  name: "generate_offer_negotiation_strategy",
  description: "基于已保存的 Offer 评估报告生成谈判策略。用户问'怎么谈/怎么跟 HR 聊/争取什么'时调用。不要重新评估 Offer。",
  matchHints: ["谈判", "怎么谈", "跟HR聊", "争取", "薪资谈判"],
  parameters: {
    offerReportId: { type: "number", required: true, description: "已保存 Offer 评估报告 ID。" },
  },
  category: "action",
  toolCtxCap: 900,
  handler,
  formatResult,
};
