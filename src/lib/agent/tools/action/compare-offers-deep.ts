import type { OfferEvaluationReport, OfferSnapshot } from "@/types";
import { evaluateOfferSnapshot, normalizeOfferSnapshot } from "@/lib/offer-evaluation";
import type { ToolDefinition, ToolResult } from "../types";

interface OfferData {
  company: string;
  role: string;
  salary?: string;
  bonus?: string;
  equity?: string;
  location?: string;
  level?: string;
  benefits?: string;
  monthlySalary?: number;
  monthsPerYear?: number;
  annualBonus?: number;
  hasSocialInsurance?: boolean;
  housingFundRate?: number;
  probationMonths?: number;
}

function apiPath(path: string): string {
  return typeof window === "undefined" ? `http://localhost:3000${path}` : path;
}

function numberParam(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function rowToSnapshot(row: Record<string, unknown>): OfferSnapshot {
  return normalizeOfferSnapshot({
    offerId: Number(row.id),
    company: String(row.company || ""),
    role: String(row.role || ""),
    location: String(row.location || ""),
    level: String(row.level || ""),
    monthlySalary: numberParam(row.monthly_salary),
    monthsPerYear: numberParam(row.months_per_year, 12),
    annualBonus: numberParam(row.annual_bonus),
    hasSocialInsurance: row.has_social_insurance !== 0,
    housingFundRate: numberParam(row.housing_fund_rate, 7),
    probationMonths: numberParam(row.probation_months, 3),
    otherBenefits: String(row.other_benefits || ""),
    options: String(row.options || ""),
    employmentForm: String(row.employment_form || "unknown") as OfferSnapshot["employmentForm"],
    overtimePolicy: String(row.overtime_policy || "unknown") as OfferSnapshot["overtimePolicy"],
    bonusGuarantee: String(row.bonus_guarantee || "unknown") as OfferSnapshot["bonusGuarantee"],
    cityCostLevel: String(row.city_cost_level || "unknown") as OfferSnapshot["cityCostLevel"],
    jobNature: String(row.job_nature || ""),
  });
}

function offerToSnapshot(o: OfferData): OfferSnapshot {
  return normalizeOfferSnapshot({
    company: o.company || "未知公司",
    role: o.role || "未知岗位",
    location: o.location || "",
    level: o.level || "",
    monthlySalary: o.monthlySalary || 0,
    monthsPerYear: o.monthsPerYear || 12,
    annualBonus: o.annualBonus || 0,
    hasSocialInsurance: o.hasSocialInsurance !== false,
    housingFundRate: o.housingFundRate || 7,
    probationMonths: o.probationMonths || 3,
    otherBenefits: o.benefits || "",
    options: o.equity || "",
  });
}

async function fetchOffersByIds(offerIds: number[]): Promise<OfferSnapshot[]> {
  const fetched: OfferSnapshot[] = [];
  for (const id of offerIds) {
    const res = await fetch(apiPath(`/api/offers/${id}`));
    if (!res.ok) continue;
    const json = await res.json();
    if (json.success && json.data) fetched.push(rowToSnapshot(json.data as Record<string, unknown>));
  }
  return fetched;
}

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  let offers = (params.offers as OfferData[]) || [];
  const offerIds = Array.isArray(params.offerIds) ? (params.offerIds as unknown[]).map((v) => Number(v)).filter(Number.isFinite) : [];

  let snapshots: OfferSnapshot[] = [];
  if (offerIds.length > 0) snapshots = await fetchOffersByIds(offerIds);
  if (snapshots.length === 0 && Array.isArray(offers)) snapshots = offers.map(offerToSnapshot);

  if (snapshots.length < 2) {
    return {
      success: false,
      data: null,
      error: "Offer 对比至少需要 2 个 offer。单个 offer 请调用 evaluate_offer。",
      errorCategory: "need_user_input",
      llmSummary: "对比失败：至少需要两个可解析 Offer。单个 Offer 应改用 evaluate_offer。",
    };
  }

  const reports: OfferEvaluationReport[] = snapshots.map(evaluateOfferSnapshot);
  const ranking = [...reports].sort((a, b) => b.overallScore - a.overallScore);

  return {
    success: true,
    data: { reports, ranking },
    errorCategory: "ok",
    llmSummary: `Offer 对比完成：${ranking.map((r, i) => `${i + 1}. ${r.company} ${r.overallScore}/5`).join("；")}。请只给用户摘要和取舍逻辑，不要输出完整报告。`,
    uiPayload: {
      type: "offer_comparison",
      offers: reports.map((r) => ({
        offerId: r.offerId,
        company: r.company,
        role: r.role,
        overallScore: r.overallScore,
        verdict: r.verdict,
        redFlags: r.redFlags.slice(0, 3),
      })),
      winner: ranking[0]?.company,
    },
    rawData: { reports, ranking },
  };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `Offer 对比失败：${result.error}`;
  return result.llmSummary || "Offer 对比完成";
}

export const compareOffersDeep: ToolDefinition = {
  name: "compare_offers_deep",
  description: "深度对比 2 个或更多 Offer。只有用户明确说'对比/比较/选哪个/和另一个 offer 比'时调用。单个 Offer 的评估必须使用 evaluate_offer。",
  matchHints: ["对比", "比较", "选哪个", "两个offer", "2个offer", "多个offer", "和另一个offer比"],
  parameters: {
    offers: { type: "array", required: false, description: "Offer 列表；至少 2 个。" },
    offerIds: { type: "array", required: false, description: "已保存 Offer 的 ID 列表；至少 2 个。" },
  },
  category: "action",
  toolCtxCap: 900,
  handler,
  formatResult,
};
