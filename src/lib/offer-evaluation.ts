import type {
  Offer,
  OfferEvaluationModule,
  OfferEvaluationReport,
  OfferRiskLevel,
  OfferSnapshot,
  OfferVerdict,
} from "@/types";

export const OFFER_MODEL_VERSION = "cn-single-offer-v1";

const MODULE_WEIGHTS: Record<string, number> = {
  completeness: 8,
  cash: 20,
  tax: 10,
  benefits: 12,
  contract: 15,
  workload: 12,
  bonus_equity: 8,
  city: 5,
  growth: 10,
  stability: 10,
};

function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.max(1, Math.min(5, Math.round(score * 10) / 10));
}

function riskLevel(score: number): OfferRiskLevel {
  if (score >= 4.3) return "low";
  if (score >= 3.6) return "medium";
  if (score >= 2.8) return "high";
  return "critical";
}

function normalizeText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function toNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeMonthlySalaryK(value: unknown): number {
  const n = toNumber(value, 0);
  if (!n) return 0;
  return n >= 1000 ? Math.round((n / 1000) * 10) / 10 : n;
}

function estimateNetIncome(offer: OfferSnapshot): OfferEvaluationReport["takeHomeEstimate"] {
  const monthlyGross = offer.monthlySalary * 1000;
  const socialBase = offer.hasSocialInsurance ? monthlyGross : monthlyGross * 0.3;
  const housingRate = (offer.housingFundRate || 0) / 100;
  const socialRate = offer.hasSocialInsurance ? 0.105 : 0;
  const monthlyDeduction = socialBase * (socialRate + housingRate);
  const annualGross = monthlyGross * (offer.monthsPerYear + (offer.annualBonus || 0));
  const netMonthly = Math.max(0, monthlyGross - monthlyDeduction);
  const netAnnual = Math.max(0, annualGross - monthlyDeduction * 12);
  return {
    monthlyNetMin: Math.round(netMonthly * 0.92 / 1000) / 1,
    monthlyNetMax: Math.round(netMonthly * 0.98 / 1000) / 1,
    annualNetMin: Math.round(netAnnual * 0.92 / 1000) / 1,
    annualNetMax: Math.round(netAnnual * 0.98 / 1000) / 1,
    assumptions: [
      "按税前月薪估算到手",
      offer.hasSocialInsurance ? "按社保公积金缴纳估算" : "按最低社保假设估算",
      "未考虑专项附加扣除差异",
    ],
  };
}

function baseSnapshot(input: Offer | OfferSnapshot): OfferSnapshot {
  const maybeOffer = input as Offer & OfferSnapshot;
  return {
    offerId: maybeOffer.id ?? maybeOffer.offerId,
    company: maybeOffer.company || "未知公司",
    role: maybeOffer.role || "未知岗位",
    location: maybeOffer.location || "",
    level: maybeOffer.level || "",
    monthlySalary: normalizeMonthlySalaryK(maybeOffer.monthlySalary),
    monthsPerYear: toNumber(maybeOffer.monthsPerYear, 12) || 12,
    annualBonus: toNumber(maybeOffer.annualBonus, 0),
    hasSocialInsurance: maybeOffer.hasSocialInsurance !== false,
    socialInsuranceBaseType: maybeOffer.socialInsuranceBaseType || "unknown",
    socialInsuranceBaseK: toNumber(maybeOffer.socialInsuranceBaseK, 0) || undefined,
    housingFundRate: toNumber(maybeOffer.housingFundRate, 7) || 7,
    probationMonths: toNumber(maybeOffer.probationMonths, 3) || 3,
    startDate: normalizeText(maybeOffer.startDate),
    otherBenefits: normalizeText(maybeOffer.otherBenefits),
    options: normalizeText(maybeOffer.options),
    employmentForm: maybeOffer.employmentForm || "unknown",
    employerName: normalizeText(maybeOffer.employerName),
    contractMonths: toNumber(maybeOffer.contractMonths, 0) || undefined,
    overtimePolicy: maybeOffer.overtimePolicy || "unknown",
    bonusGuarantee: maybeOffer.bonusGuarantee || "unknown",
    equityType: normalizeText(maybeOffer.equityType),
    equityVesting: normalizeText(maybeOffer.equityVesting),
    commuteMinutes: toNumber(maybeOffer.commuteMinutes, 0) || undefined,
    cityCostLevel: maybeOffer.cityCostLevel || "unknown",
    jobNature: normalizeText(maybeOffer.jobNature),
    applicationId: maybeOffer.applicationId,
    sourceLabel: maybeOffer.sourceLabel || "",
    evaluatedAt: new Date().toISOString(),
  };
}

function completenessModule(snapshot: OfferSnapshot): OfferEvaluationModule {
  const missingInfo = [];
  if (!snapshot.location) missingInfo.push("城市/办公地点");
  if (!snapshot.employmentForm || snapshot.employmentForm === "unknown") missingInfo.push("用工形式");
  if (!snapshot.contractMonths) missingInfo.push("合同期限");
  if (!snapshot.overtimePolicy || snapshot.overtimePolicy === "unknown") missingInfo.push("加班与补偿方式");
  if (!snapshot.bonusGuarantee || snapshot.bonusGuarantee === "unknown") missingInfo.push("奖金兑现规则");
  if (!snapshot.employerName) missingInfo.push("用工主体名称");
  const required = [snapshot.company, snapshot.role, snapshot.monthlySalary > 0, snapshot.monthsPerYear > 0];
  const filledRequired = required.filter(Boolean).length;
  const optionalCompleteness = Math.max(0, 1 - missingInfo.length / 6);
  const score = clampScore(1.2 + filledRequired * 0.55 + optionalCompleteness * 1.6);
  return {
    id: "completeness",
    label: "信息完整度",
    score,
    weight: MODULE_WEIGHTS.completeness,
    confidence: 0.95,
    evidence: [snapshot.company, snapshot.role].filter(Boolean),
    risks: missingInfo.length ? ["关键信息缺失会影响后续谈判"] : [],
    missingInfo,
    notes: missingInfo.length ? "建议补充关键信息后再做终评" : "基础信息完整",
  };
}

function cashModule(snapshot: OfferSnapshot): OfferEvaluationModule {
  const annual = snapshot.monthlySalary * (snapshot.monthsPerYear + (snapshot.annualBonus || 0));
  const score =
    annual >= 400 ? 5 :
    annual >= 300 ? 4.2 :
    annual >= 220 ? 3.6 :
    annual >= 150 ? 3.0 : 2.2;
  return {
    id: "cash",
    label: "现金收入",
    score: clampScore(score),
    weight: MODULE_WEIGHTS.cash,
    confidence: 0.9,
    evidence: [`税前月薪 ${snapshot.monthlySalary}K`, `${snapshot.monthsPerYear} 薪`, `年终 ${snapshot.annualBonus || 0} 个月`],
    risks: snapshot.annualBonus ? [] : ["总包高度依赖基础月薪"],
    missingInfo: [],
    notes: "按税前现金包判断即时回报",
  };
}

function inferSocialInsuranceBaseType(snapshot: OfferSnapshot): NonNullable<OfferSnapshot["socialInsuranceBaseType"]> {
  if (snapshot.socialInsuranceBaseType && snapshot.socialInsuranceBaseType !== "unknown") {
    return snapshot.socialInsuranceBaseType;
  }

  if (snapshot.socialInsuranceBaseK && snapshot.monthlySalary) {
    return snapshot.socialInsuranceBaseK >= snapshot.monthlySalary * 0.9 ? "full_salary" : "minimum_base";
  }

  const text = `${snapshot.otherBenefits || ""} ${snapshot.sourceLabel || ""}`.toLowerCase();
  if (/full\s*-?\s*(salary|base)|actual\s+salary|全额|足额|按实际工资|按工资全额/.test(text)) {
    return "full_salary";
  }
  if (/minimum\s*-?\s*base|lowest\s*-?\s*base|low\s*-?\s*base|最低|下限|最低基数|低基数/.test(text)) {
    return "minimum_base";
  }
  return "unknown";
}

function taxModule(snapshot: OfferSnapshot): OfferEvaluationModule {
  const baseType = inferSocialInsuranceBaseType(snapshot);
  const fullBase = snapshot.hasSocialInsurance && baseType === "full_salary" && snapshot.housingFundRate >= 10;
  const minimumBase = snapshot.hasSocialInsurance && baseType === "minimum_base";
  const lowFundRate = snapshot.hasSocialInsurance && snapshot.housingFundRate > 0 && snapshot.housingFundRate < 7;
  const risks = [];
  if (!snapshot.hasSocialInsurance) risks.push("社保缺失或按最低基数缴纳");
  if (minimumBase) risks.push("社保/公积金按最低基数或低基数缴纳");
  if (snapshot.hasSocialInsurance && baseType === "unknown") risks.push("社保/公积金缴纳基数未明确");
  if (lowFundRate) risks.push("公积金比例偏低");
  const missingInfo = !snapshot.hasSocialInsurance || baseType === "unknown" ? ["社保缴纳基数"] : [];
  const score = fullBase ? 4.6 : minimumBase ? 3.1 : snapshot.hasSocialInsurance ? 3.6 : 2.6;
  return {
    id: "tax",
    label: "社保与税后",
    score: clampScore(score),
    weight: MODULE_WEIGHTS.tax,
    confidence: fullBase ? 0.84 : baseType === "unknown" ? 0.62 : 0.74,
    evidence: [
      snapshot.hasSocialInsurance ? "缴纳五险一金" : "社保不完整",
      `缴纳基数：${baseType === "full_salary" ? "按实际薪资" : baseType === "minimum_base" ? "最低/低基数" : "未明确"}`,
      `公积金 ${snapshot.housingFundRate}%`,
    ],
    risks,
    missingInfo,
    notes: fullBase ? "社保公积金相对健康" : "需重点确认缴费基数和城市口径",
  };
}

function benefitsModule(snapshot: OfferSnapshot): OfferEvaluationModule {
  const directHire = snapshot.employmentForm === "direct_hire";
  const score = directHire ? 4.5 : snapshot.employmentForm === "intern" ? 3.0 : 2.4;
  const risks = [];
  if (!directHire) risks.push("用工形式存在合规或稳定性风险");
  if (!snapshot.contractMonths) risks.push("合同期限未明确");
  return {
    id: "benefits",
    label: "合同与福利",
    score: clampScore(score),
    weight: MODULE_WEIGHTS.benefits,
    confidence: 0.84,
    evidence: [snapshot.employmentForm || "unknown", snapshot.otherBenefits || "无额外福利描述"],
    risks,
    missingInfo: snapshot.contractMonths ? [] : ["合同期限", "主体公司是否一致"],
    notes: directHire ? "劳动关系更清晰" : "需要重点核对主体和福利落地",
  };
}

function contractModule(snapshot: OfferSnapshot): OfferEvaluationModule {
  const riskDown =
    snapshot.probationMonths > 6 ? 1 :
    snapshot.probationMonths > 3 ? 0.5 : 0;
  const score = clampScore((snapshot.contractMonths ? 4.5 : 3.2) - riskDown);
  const risks = [];
  if (snapshot.probationMonths > 3) risks.push("试用期偏长");
  if (snapshot.contractMonths && snapshot.contractMonths < 12) risks.push("合同期限偏短");
  return {
    id: "contract",
    label: "试用期与合同",
    score,
    weight: MODULE_WEIGHTS.contract,
    confidence: 0.8,
    evidence: [`试用期 ${snapshot.probationMonths} 个月`, snapshot.contractMonths ? `合同 ${snapshot.contractMonths} 个月` : "未提供合同期限"],
    risks,
    missingInfo: snapshot.contractMonths ? [] : ["合同期限"],
    notes: "关注试用期、续签和违约条款",
  };
}

function workloadModule(snapshot: OfferSnapshot): OfferEvaluationModule {
  const policyScore =
    snapshot.overtimePolicy === "none" ? 4.8 :
    snapshot.overtimePolicy === "occasional" ? 4.0 :
    snapshot.overtimePolicy === "common" ? 3.0 :
    snapshot.overtimePolicy === "intense" ? 2.2 : 3.2;
  const commutePenalty = snapshot.commuteMinutes && snapshot.commuteMinutes > 60 ? 0.4 : 0;
  const score = clampScore(policyScore - commutePenalty);
  const risks = [];
  if (snapshot.overtimePolicy === "intense") risks.push("加班强度高");
  if (snapshot.commuteMinutes && snapshot.commuteMinutes > 60) risks.push("通勤压力较大");
  return {
    id: "workload",
    label: "工时与生活",
    score,
    weight: MODULE_WEIGHTS.workload,
    confidence: 0.74,
    evidence: [snapshot.overtimePolicy || "unknown", snapshot.commuteMinutes ? `通勤 ${snapshot.commuteMinutes} 分钟` : "未提供通勤信息"],
    risks,
    missingInfo: snapshot.overtimePolicy === "unknown" ? ["加班与补偿方式"] : [],
    notes: "把工作强度和生活成本一起算",
  };
}

function bonusEquityModule(snapshot: OfferSnapshot): OfferEvaluationModule {
  const equityHasValue = !!snapshot.options || !!snapshot.equityType;
  let score = snapshot.bonusGuarantee === "guaranteed" ? 4.5 : snapshot.bonusGuarantee === "partial" ? 3.7 : 3.0;
  if (equityHasValue) score += 0.3;
  if (snapshot.bonusGuarantee === "none") score -= 0.7;
  const risks = [];
  if (snapshot.bonusGuarantee === "uncertain" || snapshot.bonusGuarantee === "unknown") risks.push("年终/提成兑现不确定");
  if (equityHasValue && !snapshot.equityVesting) risks.push("股权归属与行权条款不清");
  return {
    id: "bonus_equity",
    label: "奖金与股权",
    score: clampScore(score),
    weight: MODULE_WEIGHTS.bonus_equity,
    confidence: 0.7,
    evidence: [snapshot.bonusGuarantee || "unknown", snapshot.options || snapshot.equityType || "无股权信息"],
    risks,
    missingInfo: [
      ...(snapshot.bonusGuarantee === "unknown" ? ["奖金兑现规则"] : []),
      ...(equityHasValue && !snapshot.equityVesting ? ["股权归属/行权安排"] : []),
    ],
    notes: "关注口头承诺是否可落地",
  };
}

function cityModule(snapshot: OfferSnapshot): OfferEvaluationModule {
  const score =
    snapshot.cityCostLevel === "low" ? 4.6 :
    snapshot.cityCostLevel === "medium" ? 4.0 :
    snapshot.cityCostLevel === "high" ? 3.2 :
    snapshot.cityCostLevel === "very_high" ? 2.6 : 3.3;
  const risks = [];
  if (snapshot.cityCostLevel === "very_high") risks.push("城市生活成本高");
  return {
    id: "city",
    label: "城市与通勤",
    score: clampScore(score),
    weight: MODULE_WEIGHTS.city,
    confidence: 0.66,
    evidence: [snapshot.cityCostLevel || "unknown"],
    risks,
    missingInfo: snapshot.cityCostLevel === "unknown" ? ["城市生活成本评估"] : [],
    notes: "只做相对评价，不做绝对生活成本预测",
  };
}

function growthModule(snapshot: OfferSnapshot): OfferEvaluationModule {
  const score =
    snapshot.jobNature?.includes("核心") ? 4.5 :
    snapshot.jobNature?.includes("平台") ? 4.2 :
    snapshot.jobNature ? 3.6 : 3.2;
  return {
    id: "growth",
    label: "成长价值",
    score: clampScore(score),
    weight: MODULE_WEIGHTS.growth,
    confidence: 0.63,
    evidence: [snapshot.jobNature || "未提供业务描述"],
    risks: snapshot.jobNature ? [] : ["岗位成长信息不足"],
    missingInfo: snapshot.jobNature ? [] : ["业务定位", "团队职责"],
    notes: "更看重项目可迁移价值和履历含金量",
  };
}

function stabilityModule(snapshot: OfferSnapshot): OfferEvaluationModule {
  const score =
    snapshot.employmentForm === "direct_hire" ? 4.3 :
    snapshot.employmentForm === "intern" ? 3.5 :
    3.0;
  const risks = [];
  if (snapshot.employmentForm === "dispatch" || snapshot.employmentForm === "outsourcing") risks.push("稳定性与归属感偏弱");
  return {
    id: "stability",
    label: "稳定性",
    score: clampScore(score),
    weight: MODULE_WEIGHTS.stability,
    confidence: 0.7,
    evidence: [snapshot.employmentForm || "unknown", snapshot.employerName || "未提供主体公司"],
    risks,
    missingInfo: snapshot.employerName ? [] : ["用工主体名称"],
    notes: "关注公司阶段、团队 HC 和主体一致性",
  };
}

export function normalizeOfferSnapshot(input: Offer | OfferSnapshot): OfferSnapshot {
  return baseSnapshot(input);
}

export function evaluateOfferSnapshot(input: Offer | OfferSnapshot): OfferEvaluationReport {
  const snapshot = baseSnapshot(input);
  const modules = [
    completenessModule(snapshot),
    cashModule(snapshot),
    taxModule(snapshot),
    benefitsModule(snapshot),
    contractModule(snapshot),
    workloadModule(snapshot),
    bonusEquityModule(snapshot),
    cityModule(snapshot),
    growthModule(snapshot),
    stabilityModule(snapshot),
  ];

  const totalWeight = modules.reduce((sum, m) => sum + m.weight, 0);
  const weightedScore =
    modules.reduce((sum, m) => sum + m.score * m.weight, 0) / Math.max(totalWeight, 1);

  const redFlags = modules.flatMap((m) => m.risks);
  const missingInfo = Array.from(new Set(modules.flatMap((m) => m.missingInfo)));
  const missingPenalty =
    missingInfo.length >= 8 ? 0.6 :
    missingInfo.length >= 5 ? 0.4 :
    missingInfo.length >= 3 ? 0.25 : 0;
  const overallScore = clampScore(weightedScore - missingPenalty);

  const verdict: OfferVerdict =
    overallScore >= 4.3 && redFlags.length === 0 ? "accept" :
    overallScore >= 3.8 ? "accept_after_negotiation" :
    overallScore >= 3.1 ? "proceed_cautiously" :
    "decline";

  const summary = [
    `综合评分 ${overallScore}/5`,
    verdict === "accept" ? "建议接受" : verdict === "accept_after_negotiation" ? "建议谈判后接受" : verdict === "proceed_cautiously" ? "建议谨慎推进" : "不建议直接接受",
    redFlags.length ? `主要风险：${redFlags.slice(0, 3).join("；")}` : "未发现明显硬伤",
  ].join("；");

  const hrQuestions = [
    ...(missingInfo.includes("社保缴纳基数") ? ["社保和公积金按什么基数缴纳？"] : []),
    ...(missingInfo.includes("奖金兑现规则") ? ["年终奖/绩效奖金的发放规则和历史兑现情况是什么？"] : []),
    ...(missingInfo.includes("合同期限") ? ["合同期限和续签规则是怎样的？"] : []),
  ];

  const negotiationLevers = [
    ...(snapshot.housingFundRate < 12 ? ["争取更高公积金比例"] : []),
    ...(snapshot.bonusGuarantee !== "guaranteed" ? ["争取明确奖金保底或书面确认"] : []),
    ...(snapshot.employmentForm && snapshot.employmentForm !== "direct_hire" ? ["确认主体并争取正式劳动关系"] : []),
  ];

  return {
    reportType: "single",
    modelVersion: OFFER_MODEL_VERSION,
    offerId: snapshot.offerId,
    company: snapshot.company,
    role: snapshot.role,
    overallScore,
    verdict,
    summary,
    assumptions: [
      "评分用于求职决策，不等同法律意见",
      "税后和社保仅按常见中国场景估算",
      "未明确字段按保守风险处理",
    ],
    redFlags,
    missingInfo,
    negotiationLevers,
    hrQuestions,
    modules,
    takeHomeEstimate: estimateNetIncome(snapshot),
    offerSnapshot: snapshot,
    createdAt: new Date().toISOString(),
  };
}
