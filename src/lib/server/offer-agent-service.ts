import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { assembleAgentMemoryContext } from "@/lib/agent/memory-context";
import { getDataRepositories, type DataRepositories } from "@/lib/data-repositories";
import { evaluateOfferSnapshot, normalizeOfferSnapshot } from "@/lib/offer-evaluation";
import {
  offerLatestReportMatches,
  offerReadBackMatches,
  offerReportReadBackMatches,
} from "@/lib/offer-persistence-verifier";
import { inspectDocumentImages } from "@/lib/server-image-intake";
import type { OfferEvaluationReport, OfferSnapshot } from "@/types";

export interface OfferAgentEvaluationInput extends Record<string, unknown> {
  offerId?: number;
  offerText?: string;
  images?: string[];
  company?: string;
  role?: string;
}

export interface OfferComparisonInput extends Record<string, unknown> {
  offerIds?: unknown[];
  offers?: Array<Record<string, unknown>>;
}

export interface OfferReportReadModel {
  id: number;
  offerId?: number;
  company: string;
  role: string;
  overallScore: number;
  verdict?: OfferEvaluationReport["verdict"];
  summary: string;
  redFlags: string[];
  missingInfo: string[];
  negotiationLevers: string[];
  hrQuestions: string[];
  offerSnapshot: Partial<OfferSnapshot>;
}

export interface SaveOfferReportResult {
  id: number;
  readBackVerified: true;
  linkedOfferReadBackVerified: true;
}

export interface DurableOfferEvaluationResult extends OfferEvaluationReport {
  id: number;
  readBackVerified: true;
  offerReadBackVerified: true;
  memoryContext?: {
    structuredCount: number;
    semanticCount: number;
    warnings: string[];
  };
}

export class OfferAgentInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfferAgentInputError";
  }
}

export async function saveOfferReportForUser(
  principal: ExecutionPrincipal,
  input: Record<string, unknown>,
): Promise<SaveOfferReportResult> {
  const reportMarkdown = stringValue(input.report_markdown);
  if (!reportMarkdown) throw new OfferAgentInputError("report_markdown is required");
  const offers = parseJsonArray(input.offers_json);
  const snapshot = objectValue(input.offer_snapshot || (offers.length === 1 ? offers[0] : {}));
  const evaluated = stringValue(snapshot.company) && stringValue(snapshot.role)
    ? evaluateOfferSnapshot(snapshot as unknown as OfferSnapshot)
    : null;
  const reportInput = {
    title: stringValue(input.title) || (evaluated ? `${evaluated.company} Offer 评估报告` : "Offer report"),
    report_type: stringValue(input.report_type) || (offers.length > 1 ? "comparison" : "single"),
    model_version: stringValue(input.model_version) || evaluated?.modelVersion || "",
    offer_id: input.offer_id ?? evaluated?.offerId ?? null,
    overall_score: input.overall_score ?? evaluated?.overallScore ?? 0,
    verdict: input.verdict ?? evaluated?.verdict ?? "",
    summary: input.summary ?? evaluated?.summary ?? "",
    offer_snapshot_json: snapshot,
    modules_json: input.modules_json ?? evaluated?.modules ?? [],
    red_flags_json: input.red_flags_json ?? evaluated?.redFlags ?? [],
    missing_info_json: input.missing_info_json ?? evaluated?.missingInfo ?? [],
    negotiation_levers_json: input.negotiation_levers_json ?? evaluated?.negotiationLevers ?? [],
    hr_questions_json: input.hr_questions_json ?? evaluated?.hrQuestions ?? [],
    assumptions_json: input.assumptions_json ?? evaluated?.assumptions ?? [],
    take_home_json: input.take_home_json ?? evaluated?.takeHomeEstimate ?? {},
    offers_json: offers,
    report_markdown: reportMarkdown,
    num_offers: offers.length,
  };
  const repositories = getDataRepositories();
  const linkedOffer = reportInput.offer_id
    ? await repositories.offers.get(Number(reportInput.offer_id), principal.userId)
    : undefined;
  return persistOfferReportInput(principal, reportInput, repositories, linkedOffer);
}

interface OfferAgentAdapters {
  repositories: Pick<DataRepositories, "offers" | "offerReports">;
  inspectImages(images: string[]): Promise<{
    offerText: string;
    structured: Record<string, unknown>;
    errors: string[];
  }>;
  getMemoryContext(principal: ExecutionPrincipal, snapshot: OfferSnapshot): Promise<{
    structuredFacts: unknown[];
    semanticSnippets: unknown[];
    warnings: string[];
  }>;
}

export async function evaluateOfferForAgent(
  principal: ExecutionPrincipal,
  input: OfferAgentEvaluationInput,
  options: { signal?: AbortSignal; adapters?: OfferAgentAdapters } = {},
): Promise<DurableOfferEvaluationResult> {
  const adapters = options.adapters || defaultAdapters();
  options.signal?.throwIfAborted();
  const resolved = await resolveOfferSnapshot(principal, input, adapters);
  options.signal?.throwIfAborted();
  const offerInput = snapshotToRow(resolved.snapshot);
  const saved = resolved.snapshot.offerId
    ? { id: resolved.snapshot.offerId }
    : await adapters.repositories.offers.upsert(offerInput, principal.userId);
  const offerId = Number(saved.id);
  const offerRow = await adapters.repositories.offers.get(offerId, principal.userId);
  if (!offerReadBackMatches(offerRow, offerInput, offerId)) {
    throw new Error("Offer 持久化后读回校验失败");
  }

  const snapshot = normalizeOfferSnapshot({ ...resolved.snapshot, offerId });
  const report = evaluateOfferSnapshot(snapshot);
  const reportInput = reportToRow(report);
  const persistedReport = await persistOfferReportInput(principal, reportInput, adapters.repositories, offerRow);
  const reportId = persistedReport.id;

  const memoryContext = await adapters.getMemoryContext(principal, snapshot).catch(() => null);
  return {
    ...report,
    id: reportId,
    offerId,
    readBackVerified: true,
    offerReadBackVerified: true,
    memoryContext: memoryContext ? {
      structuredCount: memoryContext.structuredFacts.length,
      semanticCount: memoryContext.semanticSnippets.length,
      warnings: memoryContext.warnings,
    } : undefined,
  };
}

export async function compareOffersForAgent(
  principal: ExecutionPrincipal,
  input: OfferComparisonInput,
): Promise<{ reports: OfferEvaluationReport[]; ranking: OfferEvaluationReport[] }> {
  const repositories = getDataRepositories();
  const offerIds = Array.isArray(input.offerIds)
    ? input.offerIds.map((value) => numberValue(value)).filter((value) => value > 0)
    : [];
  const snapshots: OfferSnapshot[] = [];
  for (const offerId of offerIds) {
    const row = await repositories.offers.get(offerId, principal.userId);
    if (row) snapshots.push(rowToSnapshot(row));
  }
  if (snapshots.length === 0 && Array.isArray(input.offers)) {
    snapshots.push(...input.offers.map((offer) => normalizeOfferSnapshot({
      ...paramsToSnapshot(offer),
      company: stringValue(offer.company) || "未知公司",
      role: stringValue(offer.role) || "未知岗位",
      otherBenefits: stringValue(offer.benefits || offer.otherBenefits),
      options: stringValue(offer.equity || offer.options),
    })));
  }
  if (snapshots.length < 2) {
    throw new OfferAgentInputError("Offer 对比至少需要 2 个可解析 Offer");
  }
  const reports = snapshots.map(evaluateOfferSnapshot);
  return { reports, ranking: [...reports].sort((left, right) => right.overallScore - left.overallScore) };
}

export async function getOfferReportForAgent(
  principal: ExecutionPrincipal,
  reportId: number,
): Promise<OfferReportReadModel | null> {
  const row = await getDataRepositories().offerReports.get(reportId, principal.userId);
  if (!row) return null;
  const snapshot = parseJsonObject(row.offer_snapshot_json);
  return {
    id: numberValue(row.id),
    offerId: optionalNumber(row.offer_id),
    company: stringValue(snapshot.company),
    role: stringValue(snapshot.role),
    overallScore: numberValue(row.overall_score),
    verdict: stringValue(row.verdict) as OfferEvaluationReport["verdict"],
    summary: stringValue(row.summary),
    redFlags: parseJsonStrings(row.red_flags_json),
    missingInfo: parseJsonStrings(row.missing_info_json),
    negotiationLevers: parseJsonStrings(row.negotiation_levers_json),
    hrQuestions: parseJsonStrings(row.hr_questions_json),
    offerSnapshot: snapshot,
  };
}

async function resolveOfferSnapshot(
  principal: ExecutionPrincipal,
  input: OfferAgentEvaluationInput,
  adapters: OfferAgentAdapters,
): Promise<{ snapshot: OfferSnapshot; offerText: string }> {
  const offerId = numberValue(input.offerId);
  if (offerId > 0) {
    const row = await adapters.repositories.offers.get(offerId, principal.userId);
    if (!row) throw new OfferAgentInputError(`未找到 Offer #${offerId}`);
    return { snapshot: rowToSnapshot(row), offerText: "" };
  }

  let offerText = stringValue(input.offerText);
  let enriched: Record<string, unknown> = { ...input };
  const images = Array.isArray(input.images)
    ? input.images.filter((value): value is string => typeof value === "string" && value.startsWith("data:image/")).slice(0, 5)
    : [];
  if (offerText.length < 10 && images.length > 0) {
    const extracted = await adapters.inspectImages(images);
    offerText = extracted.offerText;
    enriched = { ...extracted.structured, ...input, offerText };
    if (offerText.length < 10 && !hasOfferFields(enriched)) {
      const details = extracted.errors.slice(0, 2).join("；");
      throw new OfferAgentInputError(`未能从截图中提取到有效 Offer 信息${details ? `（${details}）` : ""}`);
    }
  }
  if (offerText.length >= 10) {
    return { snapshot: parseOfferText(offerText, enriched), offerText };
  }
  if (hasOfferFields(enriched)) {
    return { snapshot: normalizeOfferSnapshot(paramsToSnapshot(enriched)), offerText };
  }
  throw new OfferAgentInputError("请提供 offerId、Offer 原文/截图，或公司、岗位和薪资等关键字段");
}

async function reconcileLatestReport(
  repositories: Pick<DataRepositories, "offers" | "offerReports">,
  userId: string,
  offerRow: Record<string, unknown> | undefined,
  reportInput: Record<string, unknown>,
): Promise<number | null> {
  const latestReportId = numberValue(offerRow?.latest_report_id);
  if (latestReportId <= 0) return null;
  const latest = await repositories.offerReports.get(latestReportId, userId);
  return offerReportReadBackMatches(latest, reportInput, latestReportId) ? latestReportId : null;
}

async function persistOfferReportInput(
  principal: ExecutionPrincipal,
  reportInput: Record<string, unknown>,
  repositories: Pick<DataRepositories, "offers" | "offerReports">,
  linkedOffer?: Record<string, unknown>,
): Promise<SaveOfferReportResult> {
  const reconciledReportId = await reconcileLatestReport(
    repositories,
    principal.userId,
    linkedOffer,
    reportInput,
  );
  const id = reconciledReportId || await repositories.offerReports.insert(reportInput, principal.userId);
  const [readBack, offerReadBack] = await Promise.all([
    repositories.offerReports.get(id, principal.userId),
    reportInput.offer_id ? repositories.offers.get(Number(reportInput.offer_id), principal.userId) : Promise.resolve(undefined),
  ]);
  const readBackVerified = offerReportReadBackMatches(readBack, reportInput, id);
  const linkedOfferReadBackVerified = reportInput.offer_id ? offerLatestReportMatches(offerReadBack, id) : true;
  if (!readBackVerified || !linkedOfferReadBackVerified) {
    throw new Error("Offer 评估报告持久化后读回校验失败");
  }
  return { id, readBackVerified: true, linkedOfferReadBackVerified: true };
}

function defaultAdapters(): OfferAgentAdapters {
  const repositories = getDataRepositories();
  return {
    repositories,
    async inspectImages(images) {
      const result = await inspectDocumentImages(images, { preferredDocumentType: "offer" });
      const structured = objectValue(result.structured);
      return {
        offerText: usableOfferText(structured.offerText || result.extractedText),
        structured,
        errors: result.errors || (result.reason ? [result.reason] : []),
      };
    },
    getMemoryContext(principal, snapshot) {
      return assembleAgentMemoryContext({
        userId: principal.userId,
        task: "offer_evaluation",
        agentId: "offer",
        query: `${snapshot.company} ${snapshot.role} ${snapshot.location || ""} salary compensation offer preference`,
        budgetChars: 1000,
        semanticTopK: 5,
      });
    },
  };
}

function parseOfferText(text: string, params: Record<string, unknown>): OfferSnapshot {
  const salaryMatch = text.match(/(\d+(?:\.\d+)?)\s*[kK]\s*(?:\*|x|×)?\s*(1[2-6])?/);
  const salaryWanMatch = text.match(/月薪\s*(\d+(?:\.\d+)?)\s*万/);
  const monthsMatch = text.match(/(1[2-6])\s*(?:薪|个月)/);
  const bonusMatch = text.match(/年终(?:奖)?\s*(\d+(?:\.\d+)?)\s*(?:个月|月)/);
  const fundMatch = text.match(/公积金\s*(\d{1,2})\s*%/);
  const probationMatch = text.match(/试用期\s*(\d)\s*(?:个月|月)/);
  return normalizeOfferSnapshot({
    ...paramsToSnapshot(params),
    company: stringValue(params.company) || extractCompany(text) || "未知公司",
    role: stringValue(params.role) || extractRole(text) || "未知岗位",
    location: stringValue(params.location) || text.match(/(?:地点|城市|base)[:：]\s*([^\n，,]+)/i)?.[1]?.trim() || "",
    monthlySalary: numberValue(params.monthlySalary, salaryMatch ? Number(salaryMatch[1]) : salaryWanMatch ? Number(salaryWanMatch[1]) * 10 : 0),
    monthsPerYear: numberValue(params.monthsPerYear, salaryMatch?.[2] ? Number(salaryMatch[2]) : monthsMatch ? Number(monthsMatch[1]) : 12),
    annualBonus: numberValue(params.annualBonus, bonusMatch ? Number(bonusMatch[1]) : 0),
    housingFundRate: numberValue(params.housingFundRate, fundMatch ? Number(fundMatch[1]) : 7),
    probationMonths: numberValue(params.probationMonths, probationMatch ? Number(probationMatch[1]) : 3),
    otherBenefits: stringValue(params.otherBenefits) || text.slice(0, 1000),
    options: stringValue(params.options) || text.match(/(?:期权|RSU|股票)[:：]?\s*([^\n]+)/i)?.[1]?.trim() || "",
    employmentForm: enumValue(params.employmentForm, ["direct_hire", "dispatch", "outsourcing", "intern", "contractor", "unknown"], /外包/.test(text) ? "outsourcing" : /派遣/.test(text) ? "dispatch" : "unknown") as OfferSnapshot["employmentForm"],
    overtimePolicy: enumValue(params.overtimePolicy, ["none", "occasional", "common", "intense", "unknown"], /大小周|996|高强度/.test(text) ? "intense" : "unknown") as OfferSnapshot["overtimePolicy"],
    bonusGuarantee: enumValue(params.bonusGuarantee, ["guaranteed", "partial", "uncertain", "none", "unknown"], /保底|保证/.test(text) ? "guaranteed" : "unknown") as OfferSnapshot["bonusGuarantee"],
  });
}

function paramsToSnapshot(params: Record<string, unknown>): OfferSnapshot {
  return {
    company: stringValue(params.company) || "未知公司",
    role: stringValue(params.role) || "未知岗位",
    location: stringValue(params.location),
    level: stringValue(params.level),
    monthlySalary: numberValue(params.monthlySalary),
    monthsPerYear: numberValue(params.monthsPerYear, 12),
    annualBonus: numberValue(params.annualBonus),
    hasSocialInsurance: params.hasSocialInsurance !== false,
    socialInsuranceBaseType: enumValue(params.socialInsuranceBaseType, ["full_salary", "minimum_base", "unknown"], "unknown") as OfferSnapshot["socialInsuranceBaseType"],
    socialInsuranceBaseK: optionalNumber(params.socialInsuranceBaseK),
    housingFundRate: numberValue(params.housingFundRate, 7),
    probationMonths: numberValue(params.probationMonths, 3),
    otherBenefits: stringValue(params.otherBenefits),
    options: stringValue(params.options),
    employmentForm: enumValue(params.employmentForm, ["direct_hire", "dispatch", "outsourcing", "intern", "contractor", "unknown"], "unknown") as OfferSnapshot["employmentForm"],
    employerName: stringValue(params.employerName),
    contractMonths: optionalNumber(params.contractMonths),
    overtimePolicy: enumValue(params.overtimePolicy, ["none", "occasional", "common", "intense", "unknown"], "unknown") as OfferSnapshot["overtimePolicy"],
    bonusGuarantee: enumValue(params.bonusGuarantee, ["guaranteed", "partial", "uncertain", "none", "unknown"], "unknown") as OfferSnapshot["bonusGuarantee"],
    equityType: stringValue(params.equityType),
    equityVesting: stringValue(params.equityVesting),
    commuteMinutes: optionalNumber(params.commuteMinutes),
    cityCostLevel: enumValue(params.cityCostLevel, ["low", "medium", "high", "very_high", "unknown"], "unknown") as OfferSnapshot["cityCostLevel"],
    jobNature: stringValue(params.jobNature),
    applicationId: optionalNumber(params.applicationId),
  };
}

function rowToSnapshot(row: Record<string, unknown>): OfferSnapshot {
  return normalizeOfferSnapshot({
    offerId: numberValue(row.id),
    company: stringValue(row.company),
    role: stringValue(row.role),
    location: stringValue(row.location),
    level: stringValue(row.level),
    monthlySalary: numberValue(row.monthly_salary),
    monthsPerYear: numberValue(row.months_per_year, 12),
    annualBonus: numberValue(row.annual_bonus),
    hasSocialInsurance: row.has_social_insurance !== 0 && row.has_social_insurance !== false,
    housingFundRate: numberValue(row.housing_fund_rate, 7),
    probationMonths: numberValue(row.probation_months, 3),
    startDate: stringValue(row.start_date),
    otherBenefits: stringValue(row.other_benefits),
    options: stringValue(row.options),
    employmentForm: stringValue(row.employment_form) as OfferSnapshot["employmentForm"],
    employerName: stringValue(row.employer_name),
    contractMonths: optionalNumber(row.contract_months),
    overtimePolicy: stringValue(row.overtime_policy) as OfferSnapshot["overtimePolicy"],
    bonusGuarantee: stringValue(row.bonus_guarantee) as OfferSnapshot["bonusGuarantee"],
    equityType: stringValue(row.equity_type),
    equityVesting: stringValue(row.equity_vesting),
    commuteMinutes: optionalNumber(row.commute_minutes),
    cityCostLevel: stringValue(row.city_cost_level) as OfferSnapshot["cityCostLevel"],
    jobNature: stringValue(row.job_nature),
    applicationId: optionalNumber(row.application_id),
  });
}

function snapshotToRow(snapshot: OfferSnapshot): Record<string, unknown> {
  return {
    company: snapshot.company,
    role: snapshot.role,
    monthly_salary: snapshot.monthlySalary,
    months_per_year: snapshot.monthsPerYear,
    annual_bonus: snapshot.annualBonus || 0,
    has_social_insurance: snapshot.hasSocialInsurance,
    housing_fund_rate: snapshot.housingFundRate,
    options: snapshot.options || null,
    probation_months: snapshot.probationMonths,
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
  };
}

function reportToRow(report: OfferEvaluationReport): Record<string, unknown> {
  return {
    title: `${report.company} Offer 评估报告`,
    report_type: "single",
    model_version: report.modelVersion,
    offer_id: report.offerId,
    overall_score: report.overallScore,
    verdict: report.verdict,
    summary: report.summary,
    offer_snapshot_json: report.offerSnapshot,
    modules_json: report.modules,
    red_flags_json: report.redFlags,
    missing_info_json: report.missingInfo,
    negotiation_levers_json: report.negotiationLevers,
    hr_questions_json: report.hrQuestions,
    assumptions_json: report.assumptions,
    take_home_json: report.takeHomeEstimate || {},
    offers_json: [report.offerSnapshot],
    report_markdown: reportToMarkdown(report),
    num_offers: 1,
  };
}

function reportToMarkdown(report: OfferEvaluationReport): string {
  return [
    `# ${report.company} Offer 评估报告`,
    "",
    `综合评分：${report.overallScore}/5`,
    `结论：${report.summary}`,
    "",
    "## 主要风险",
    ...(report.redFlags.length ? report.redFlags.map((value) => `- ${value}`) : ["- 暂无明显红旗"]),
    "",
    "## 缺失信息",
    ...(report.missingInfo.length ? report.missingInfo.map((value) => `- ${value}`) : ["- 暂无"]),
  ].join("\n");
}

function hasOfferFields(value: Record<string, unknown>): boolean {
  return Boolean(stringValue(value.company) || stringValue(value.role) || numberValue(value.monthlySalary) > 0);
}

function usableOfferText(value: unknown): string {
  const text = stringValue(value).replace(/【缺失】/g, "").trim();
  return text.length >= 10 ? text : "";
}

function extractCompany(text: string): string {
  return text.match(/(?:公司|company)[:：]\s*([^\n，,。；;]+)/i)?.[1]?.trim()
    || text.match(/([^\n，,。；;]{2,40}?(?:有限责任公司|股份有限公司|科技有限公司|有限公司|公司))/)?.[1]?.trim()
    || text.match(/([^\n，,。；;]{2,40}?)(?:的)?(?:Offer|offer)/)?.[1]?.trim()
    || "";
}

function extractRole(text: string): string {
  return text.match(/(?:岗位|职位|role|title)[:：]\s*([^\n，,。；;]+)/i)?.[1]?.trim()
    || text.match(/(?:岗位|职位|职务|offer|Offer)\s*(?:是|为|:|：)?\s*([^\n，,。；;]{2,40})/)?.[1]?.trim()
    || "";
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: unknown): number | undefined {
  const parsed = numberValue(value);
  return parsed > 0 ? parsed : undefined;
}

function enumValue(value: unknown, allowed: readonly string[], fallback: string): string {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return objectValue(parsed);
  } catch {
    return {};
  }
}

function parseJsonStrings(value: unknown): string[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseJsonArray(value: unknown): unknown[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
