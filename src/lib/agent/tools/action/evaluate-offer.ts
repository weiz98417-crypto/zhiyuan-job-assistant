import type { OfferEvaluationReport, OfferSnapshot } from "@/types";
import { evaluateOfferSnapshot, normalizeOfferSnapshot } from "@/lib/offer-evaluation";
import type { ToolDefinition, ToolResult } from "../types";
import type { ImageIntakeResult } from "@/lib/agent/image-intake";
import { fetchAgentMemoryContext, indexAgentMemorySource, writeCandidateAgentMemory } from "../memory-helpers";

function apiPath(path: string): string {
  return typeof window === "undefined" ? `http://localhost:3000${path}` : path;
}

function numberParam(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function extractCompany(text: string): string {
  const labeled = text.match(/(?:公司|company)[:：]\s*([^\n，,。；;]+)/i)?.[1]?.trim();
  if (labeled) return labeled;

  const entity = text.match(/([^\n，,。；;]{2,40}?(?:有限责任公司|股份有限公司|科技有限公司|有限公司|公司))/)?.[1]?.trim();
  if (entity) return entity.replace(/^[：:\s]+/, "").trim();

  const beforeOffer = text.match(/([^\n，,。；;]{2,40}?)(?:的)?(?:Offer|offer)/)?.[1]?.trim();
  return beforeOffer || "";
}

function extractRole(text: string): string {
  const labeled = text.match(/(?:岗位|职位|role|title)[:：]\s*([^\n，,。；;]+)/i)?.[1]?.trim();
  if (labeled) return labeled;
  return text.match(/(?:岗位|职位|职务|offer|Offer)\s*(?:是|为|:|：)?\s*([^\n，,。；;]{2,40})/)?.[1]?.trim() || "";
}

function parseOfferText(text: string, params: Record<string, unknown>): OfferSnapshot {
  const company =
    String(params.company || "").trim() ||
    extractCompany(text) ||
    "未知公司";
  const role =
    String(params.role || "").trim() ||
    extractRole(text) ||
    "未知岗位";
  const salaryMatch = text.match(/(\d+(?:\.\d+)?)\s*[kK]\s*(?:\*|x|×)?\s*(1[2-6])?/);
  const salaryWanMatch = text.match(/月薪\s*(\d+(?:\.\d+)?)\s*万/);
  const monthsMatch = text.match(/(1[2-6])\s*(?:薪|个月)/);
  const bonusMatch = text.match(/年终(?:奖)?\s*(\d+(?:\.\d+)?)\s*(?:个月|月)/);
  const fundMatch = text.match(/公积金\s*(\d{1,2})\s*%/);
  const probationMatch = text.match(/试用期\s*(\d)\s*(?:个月|月)/);
  const socialBaseType =
    (params.socialInsuranceBaseType as OfferSnapshot["socialInsuranceBaseType"]) ||
    (/full\s*-?\s*(salary|base)|actual\s+salary|全额|足额|按实际工资|按工资全额/i.test(text)
      ? "full_salary"
      : /minimum\s*-?\s*base|lowest\s*-?\s*base|low\s*-?\s*base|最低|下限|最低基数|低基数/i.test(text)
        ? "minimum_base"
        : "unknown");

  return {
    company,
    role,
    location: String(params.location || text.match(/(?:地点|城市|base)[:：]\s*([^\n，,]+)/i)?.[1] || "").trim(),
    monthlySalary: numberParam(params.monthlySalary, salaryMatch ? Number(salaryMatch[1]) : salaryWanMatch ? Number(salaryWanMatch[1]) * 10 : 0),
    monthsPerYear: numberParam(params.monthsPerYear, salaryMatch?.[2] ? Number(salaryMatch[2]) : monthsMatch ? Number(monthsMatch[1]) : 12),
    annualBonus: numberParam(params.annualBonus, bonusMatch ? Number(bonusMatch[1]) : 0),
    hasSocialInsurance: params.hasSocialInsurance !== false && !/无社保|不缴社保|不交社保/.test(text),
    socialInsuranceBaseType: socialBaseType,
    socialInsuranceBaseK: numberParam(params.socialInsuranceBaseK, 0) || undefined,
    housingFundRate: numberParam(params.housingFundRate, fundMatch ? Number(fundMatch[1]) : 7),
    probationMonths: numberParam(params.probationMonths, probationMatch ? Number(probationMatch[1]) : 3),
    otherBenefits: String(params.otherBenefits || text).slice(0, 1000),
    options: String(params.options || text.match(/(?:期权|RSU|股票)[:：]?\s*([^\n]+)/i)?.[1] || "").trim(),
    employmentForm: (params.employmentForm as OfferSnapshot["employmentForm"]) || (/外包/.test(text) ? "outsourcing" : /派遣/.test(text) ? "dispatch" : "unknown"),
    employerName: String(params.employerName || "").trim(),
    contractMonths: numberParam(params.contractMonths, 0) || undefined,
    overtimePolicy: (params.overtimePolicy as OfferSnapshot["overtimePolicy"]) || (/大小周|996|高强度/.test(text) ? "intense" : "unknown"),
    bonusGuarantee: (params.bonusGuarantee as OfferSnapshot["bonusGuarantee"]) || (/保底|保证/.test(text) ? "guaranteed" : "unknown"),
    cityCostLevel: (params.cityCostLevel as OfferSnapshot["cityCostLevel"]) || "unknown",
    jobNature: String(params.jobNature || "").trim(),
  };
}

function usableOfferText(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/【缺失】/g, "").trim();
  if (text.length < 10) return "";
  return text;
}

async function extractOfferFromImages(images: string[]): Promise<{
  offerText: string;
  structured: Record<string, unknown>;
  errors: string[];
}> {
  const bodies: string[] = [];
  const structured: Record<string, unknown> = {};
  const errors: string[] = [];

  for (let i = 0; i < Math.min(images.length, 5); i++) {
    try {
      const res = await fetch(apiPath("/api/agent/image-intake"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [images[i]], preferredDocumentType: "offer" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        errors.push(`第 ${i + 1} 张：${json.error || `image intake HTTP ${res.status}`}`);
        continue;
      }

      const data = json.data as ImageIntakeResult | undefined;
      if (!data) {
        errors.push(`第 ${i + 1} 张：image intake 返回为空`);
        continue;
      }

      const text = usableOfferText(data.structured?.offerText || data.extractedText);
      if (data.documentType !== "offer" && !text) {
        errors.push(`第 ${i + 1} 张：${data.reason || "图片不像 Offer"}`);
        continue;
      }

      if (text) bodies.push(text);
      for (const [key, value] of Object.entries(data.structured || {})) {
        if (value === undefined || value === null || value === "") continue;
        if (structured[key] === undefined || structured[key] === "" || structured[key] === null) {
          structured[key] = value;
        }
      }
    } catch (err) {
      errors.push(`第 ${i + 1} 张：${err instanceof Error ? err.message : "image intake 调用失败"}`);
    }
  }

  return { offerText: bodies.join("\n\n---\n\n"), structured, errors };
}

function reportToMarkdown(report: OfferEvaluationReport): string {
  const lines = [
    `# ${report.company} Offer 评估报告`,
    "",
    `综合评分：${report.overallScore}/5`,
    `结论：${report.summary}`,
    "",
    "## 模块评分",
    "| 模块 | 分数 | 置信度 | 说明 |",
    "|---|---:|---:|---|",
    ...report.modules.map((m) => `| ${m.label} | ${m.score}/5 | ${Math.round(m.confidence * 100)}% | ${m.notes} |`),
    "",
    "## 主要风险",
    ...(report.redFlags.length ? report.redFlags.map((r) => `- ${r}`) : ["- 暂无明显红旗"]),
    "",
    "## 缺失信息",
    ...(report.missingInfo.length ? report.missingInfo.map((r) => `- ${r}`) : ["- 暂无"]),
    "",
    "## 谈判杠杆",
    ...(report.negotiationLevers.length ? report.negotiationLevers.map((r) => `- ${r}`) : ["- 暂无明确杠杆"]),
  ];
  return lines.join("\n");
}

async function loadOfferById(offerId: number): Promise<OfferSnapshot | null> {
  const res = await fetch(apiPath(`/api/offers/${offerId}`));
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.success || !json.data) return null;
  const row = json.data as Record<string, unknown>;
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
    startDate: String(row.start_date || ""),
    otherBenefits: String(row.other_benefits || ""),
    options: String(row.options || ""),
    employmentForm: String(row.employment_form || "unknown") as OfferSnapshot["employmentForm"],
    employerName: String(row.employer_name || ""),
    contractMonths: numberParam(row.contract_months, 0) || undefined,
    overtimePolicy: String(row.overtime_policy || "unknown") as OfferSnapshot["overtimePolicy"],
    bonusGuarantee: String(row.bonus_guarantee || "unknown") as OfferSnapshot["bonusGuarantee"],
    equityType: String(row.equity_type || ""),
    equityVesting: String(row.equity_vesting || ""),
    commuteMinutes: numberParam(row.commute_minutes, 0) || undefined,
    cityCostLevel: String(row.city_cost_level || "unknown") as OfferSnapshot["cityCostLevel"],
    jobNature: String(row.job_nature || ""),
    applicationId: numberParam(row.application_id, 0) || undefined,
  });
}

async function saveOffer(snapshot: OfferSnapshot): Promise<number | null> {
  if (snapshot.offerId) return snapshot.offerId;
  if (!snapshot.company || !snapshot.role) return null;

  const res = await fetch(apiPath("/api/offers"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company: snapshot.company,
      role: snapshot.role,
      monthly_salary: snapshot.monthlySalary || 0,
      months_per_year: snapshot.monthsPerYear || 12,
      annual_bonus: snapshot.annualBonus || 0,
      has_social_insurance: snapshot.hasSocialInsurance !== false,
      housing_fund_rate: snapshot.housingFundRate || 7,
      options: snapshot.options || null,
      probation_months: snapshot.probationMonths || 3,
      start_date: snapshot.startDate || null,
      other_benefits: snapshot.otherBenefits || null,
      location: snapshot.location || "",
      level: snapshot.level || "",
      benefits: {},
      employment_form: snapshot.employmentForm || "unknown",
      employer_name: snapshot.employerName || null,
      contract_months: snapshot.contractMonths || null,
      overtime_policy: snapshot.overtimePolicy || "unknown",
      bonus_guarantee: snapshot.bonusGuarantee || "unknown",
      equity_type: snapshot.equityType || null,
      equity_vesting: snapshot.equityVesting || null,
      commute_minutes: snapshot.commuteMinutes || null,
      city_cost_level: snapshot.cityCostLevel || "unknown",
      job_nature: snapshot.jobNature || null,
      application_id: snapshot.applicationId || null,
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.success && json.data?.id ? Number(json.data.id) : null;
}

async function saveReport(report: OfferEvaluationReport): Promise<number | null> {
  const res = await fetch(apiPath("/api/offer-reports"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `${report.company} Offer 评估报告`,
      report_type: "single",
      model_version: report.modelVersion,
      offer_id: report.offerId,
      offer_snapshot: report.offerSnapshot,
      overall_score: report.overallScore,
      verdict: report.verdict,
      summary: report.summary,
      modules_json: report.modules,
      red_flags_json: report.redFlags,
      missing_info_json: report.missingInfo,
      negotiation_levers_json: report.negotiationLevers,
      hr_questions_json: report.hrQuestions,
      assumptions_json: report.assumptions,
      take_home_json: report.takeHomeEstimate,
      offers_json: [report.offerSnapshot],
      report_markdown: reportToMarkdown(report),
    }),
  });
  const json = await res.json();
  return json.success ? Number(json.data.id) : null;
}

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const offerId = numberParam(params.offerId, 0);
  let offerText = String(params.offerText || "");
  const images = Array.isArray(params.images)
    ? params.images.filter((item): item is string => typeof item === "string" && item.startsWith("data:image/"))
    : [];
  let enrichedParams = { ...params };

  if (!offerId && offerText.trim().length < 10 && images.length > 0) {
    const extracted = await extractOfferFromImages(images);
    if (extracted.offerText.trim()) {
      offerText = extracted.offerText;
      enrichedParams = { ...extracted.structured, ...params, offerText };
    } else {
      return {
        success: false,
        data: null,
        error: `未能从截图中提取到有效 Offer 信息${extracted.errors.length ? `（${extracted.errors.slice(0, 2).join("；")}）` : ""}`,
        errorCategory: "need_user_input",
        llmSummary: "截图识别没有提取到有效 Offer 信息。请让用户上传更清晰的原始 Offer 截图，或直接粘贴 Offer 文本/关键待遇。",
      };
    }
  }

  let snapshot: OfferSnapshot | null = offerId ? await loadOfferById(offerId) : null;
  if (!snapshot && offerText.trim().length >= 10) {
    snapshot = parseOfferText(offerText, enrichedParams);
  }
  if (!snapshot && (enrichedParams.company || enrichedParams.role || enrichedParams.monthlySalary)) {
    snapshot = normalizeOfferSnapshot({
      company: String(enrichedParams.company || "未知公司"),
      role: String(enrichedParams.role || "未知岗位"),
      location: String(enrichedParams.location || ""),
      monthlySalary: numberParam(enrichedParams.monthlySalary, 0),
      monthsPerYear: numberParam(enrichedParams.monthsPerYear, 12),
      annualBonus: numberParam(enrichedParams.annualBonus, 0),
      hasSocialInsurance: enrichedParams.hasSocialInsurance !== false,
      socialInsuranceBaseType: (enrichedParams.socialInsuranceBaseType as OfferSnapshot["socialInsuranceBaseType"]) || "unknown",
      socialInsuranceBaseK: numberParam(enrichedParams.socialInsuranceBaseK, 0) || undefined,
      housingFundRate: numberParam(enrichedParams.housingFundRate, 7),
      probationMonths: numberParam(enrichedParams.probationMonths, 3),
      otherBenefits: String(enrichedParams.otherBenefits || ""),
      options: String(enrichedParams.options || ""),
      employmentForm: (enrichedParams.employmentForm as OfferSnapshot["employmentForm"]) || "unknown",
      employerName: String(enrichedParams.employerName || ""),
      contractMonths: numberParam(enrichedParams.contractMonths, 0) || undefined,
      overtimePolicy: (enrichedParams.overtimePolicy as OfferSnapshot["overtimePolicy"]) || "unknown",
      bonusGuarantee: (enrichedParams.bonusGuarantee as OfferSnapshot["bonusGuarantee"]) || "unknown",
      equityType: String(enrichedParams.equityType || ""),
      equityVesting: String(enrichedParams.equityVesting || ""),
      commuteMinutes: numberParam(enrichedParams.commuteMinutes, 0) || undefined,
      cityCostLevel: (enrichedParams.cityCostLevel as OfferSnapshot["cityCostLevel"]) || "unknown",
      jobNature: String(enrichedParams.jobNature || ""),
    });
  }

  if (!snapshot) {
    return {
      success: false,
      data: null,
      error: "请提供 offerId 或 Offer 文本/关键字段",
      errorCategory: "need_user_input",
      llmSummary: "缺少可评估的 Offer。请让用户提供 offerId、公司/岗位/薪资，或粘贴 Offer 原文。",
    };
  }

  const memoryContext = await fetchAgentMemoryContext({
    task: "offer",
    query: `${snapshot.company || ""} ${snapshot.role || ""} ${snapshot.location || ""} salary compensation offer preference`,
    budgetChars: 1000,
    semanticTopK: 5,
  });

  const savedOfferId = await saveOffer(snapshot);
  if (savedOfferId && !snapshot.offerId) {
    snapshot = { ...snapshot, offerId: savedOfferId };
  }

  const report = evaluateOfferSnapshot(snapshot);
  const reportId = await saveReport(report);
  const withId = reportId ? { ...report, id: reportId } : report;
  const reportMarkdown = reportToMarkdown(report);

  if (savedOfferId) {
    await indexAgentMemorySource({
      sourceType: "offer",
      sourceId: savedOfferId,
      title: `${report.company} ${report.role}`,
      text: offerText || JSON.stringify(report.offerSnapshot),
      metadata: { reportId, company: report.company, role: report.role },
    });
  }
  if (reportId) {
    await indexAgentMemorySource({
      sourceType: "offer_report",
      sourceId: reportId,
      title: `${report.company} ${report.role} offer report`,
      text: reportMarkdown,
      metadata: { offerId: report.offerId, company: report.company, role: report.role },
    });
    await writeCandidateAgentMemory({
      memoryType: "offer_evaluation_observation",
      canonicalText: `${report.company} ${report.role} offer evaluated as ${report.verdict}; score ${report.overallScore}/5.`,
      sourceType: "offer_report",
      sourceId: reportId,
      quote: report.summary,
      confidence: 0.65,
      importance: report.redFlags.length ? 0.75 : 0.55,
      extractionMethod: "offer_evaluation_writeback",
      metadata: { offerId: report.offerId, reportId, company: report.company, role: report.role },
    });
  }

  return {
    success: true,
    data: withId,
    errorCategory: "ok",
    llmSummary: `Offer 评估完成：${report.company} - ${report.role}，${report.summary}。报告编号：${reportId || "未保存"}。缺失信息：${report.missingInfo.slice(0, 3).join("、") || "暂无"}。`,
    uiPayload: {
      type: "offer_evaluation",
      reportId,
      offerId: report.offerId,
      company: report.company,
      role: report.role,
      overallScore: report.overallScore,
      verdict: report.verdict,
      redFlags: report.redFlags.slice(0, 5),
      missingInfo: report.missingInfo.slice(0, 5),
      memoryContext: memoryContext ? {
        structuredCount: Array.isArray(memoryContext.structuredFacts) ? memoryContext.structuredFacts.length : 0,
        semanticCount: Array.isArray(memoryContext.semanticSnippets) ? memoryContext.semanticSnippets.length : 0,
        warnings: Array.isArray(memoryContext.warnings) ? memoryContext.warnings : [],
      } : null,
    },
    rawData: { report: withId, memoryContext },
  };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `Offer 评估失败：${result.error}`;
  return result.llmSummary || "Offer 评估完成";
}

export const evaluateOffer: ToolDefinition = {
  name: "evaluate_offer",
  description: "评估单个 Offer。用户首次问'这个 offer 值不值得接/帮我看 offer/评估 offer'时调用。若已有可用评估报告且用户只是问谈判/HR问题，不要调用本工具；那些场景应读取报告或调用谈判/问询工具。",
  matchHints: ["offer评估", "这个offer怎么样", "值不值得接", "薪资待遇", "录取"],
  parameters: {
    offerId: { type: "number", required: false, description: "已保存 Offer 的 ID。优先使用本地 offerId，而不是要求用户重贴。" },
    offerText: { type: "string", required: false, description: "Offer 原文或用户提供的关键待遇信息。" },
    company: { type: "string", required: false, description: "公司名。若用户对话里提到但 Offer 原文没有，也要传入。" },
    role: { type: "string", required: false, description: "岗位名。" },
    location: { type: "string", required: false, description: "城市或办公地点。" },
    monthlySalary: { type: "number", required: false, description: "税前月薪，单位 K。" },
    monthsPerYear: { type: "number", required: false, description: "发薪月数，如 12/13/14。" },
    annualBonus: { type: "number", required: false, description: "年终奖月数。" },
    hasSocialInsurance: { type: "boolean", required: false, description: "是否缴纳五险一金。" },
    housingFundRate: { type: "number", required: false, description: "公积金个人缴存比例百分数。" },
    socialInsuranceBaseType: { type: "string", required: false, description: "full_salary/minimum_base/unknown，用于判断社保公积金缴纳基数风险。" },
    socialInsuranceBaseK: { type: "number", required: false, description: "社保/公积金缴纳基数，单位 K。" },
    probationMonths: { type: "number", required: false, description: "试用期月数。" },
    employmentForm: { type: "string", required: false, description: "direct_hire/dispatch/outsourcing/intern/contractor/unknown。" },
    overtimePolicy: { type: "string", required: false, description: "none/occasional/common/intense/unknown。" },
    bonusGuarantee: { type: "string", required: false, description: "guaranteed/partial/uncertain/none/unknown。" },
    images: { type: "array", required: false, description: "Offer 截图 base64 数组，最多 5 张。" },
  },
  category: "action",
  toolCtxCap: 900,
  handler,
  formatResult,
};
