import { createHash } from "crypto";
import { offerBonusGuaranteeFromText, offerSocialInsuranceFromText } from "@/lib/offer-conditions";
import type { AgentRunSnapshot } from "@/lib/agent/runtime/durable-agent-run";
import type { ExecutionConversationMessage } from "@/lib/agent/runtime/execution-session-service";
import type { RunAttachmentMaterial } from "@/lib/agent/runtime/run-attachment-material";

export interface ReadOnlyOfferFacts {
  userId: string;
  runId: string;
  sourceId: string;
  sourceHash: string;
  sourceQuote: string;
  sourceKind: "user_text" | "offer_attachment";
  attachmentHash?: string;
  facts: {
    monthlySalary: number | null;
    salaryCurrency: "CNY" | "USD" | null;
    salaryMonths: number | null;
    bonusMonths: number | null;
    bonusGuarantee: "guaranteed" | "uncertain" | "unknown";
    socialInsurance: boolean | null;
    providentFundRate: number | null;
    probationMonths: number | null;
  };
}

export function requestsReadOnlyOfferFacts(text: string): boolean {
  return /offer|录用通知/i.test(text)
    && /(?:只|仅)(?:需|需要)?(?:做|帮我|给我)?(?:整理|提取|梳理)[^\n。；;]{0,40}(?:事实|信息|条件|内容)|(?:整理|提取|梳理)[^\n。；;]{0,30}(?:offer|录用通知)[^\n。；;]{0,20}事实/i.test(text);
}

export function projectReadOnlyOfferFacts(input: {
  run: AgentRunSnapshot;
  messages: ExecutionConversationMessage[];
  attachment: RunAttachmentMaterial | null;
}): ReadOnlyOfferFacts | null {
  const attachment = input.attachment;
  if (attachment && (attachment.userId !== input.run.userId || attachment.runId !== input.run.id)) {
    throw new Error("Read-only Offer source owner mismatch");
  }
  const runMessages = input.messages.filter((message) => (
    message.role === "user" && message.id?.startsWith("run:" + input.run.id + ":input:")
  ));
  const sourceKind = attachment?.intake.documentType === "offer" && attachment.intake.extractedText.trim()
    ? "offer_attachment" : "user_text";
  const sourceQuote = [
    ...(sourceKind === "offer_attachment" ? [attachment!.intake.extractedText] : []),
    ...runMessages.map((message) => message.content),
  ].join("\n");
  const monthlyQuote = lastFieldQuote(sourceQuote, /月薪|薪资|工资|薪水/);
  const monthlyMatch = fieldIsUnconfirmed(monthlyQuote) ? undefined
    : [...monthlyQuote.matchAll(/月薪\s*(?:改为|修改为|更正为|变更为|实际为|为)?\s*[：:]?\s*[￥¥$]?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k|千|万|元)?\s*(人民币|美元|CNY|RMB|USD|元)?(?!\s*[-~—–～至到]\s*\d|[\dA-Za-z,.千百亿万￥¥$元\-~—–～至到])/gi)].at(-1);
  const monthlyAmount = monthlyMatch
    ? Number(monthlyMatch[1].replace(/,/g, "")) * (/k|千/i.test(monthlyMatch[2] || "") ? 1_000 : monthlyMatch[2] === "万" ? 10_000 : 1)
    : null;
  const monthlySalary = monthlyAmount !== null && Number.isFinite(monthlyAmount) && Math.abs(monthlyAmount) <= Number.MAX_SAFE_INTEGER ? monthlyAmount : null;
  const salaryCurrency = monthlyMatch && /美元|USD|\$/i.test(monthlyMatch[0]) ? "USD"
    : monthlyMatch && (/人民币|CNY|RMB|[￥¥]/i.test(monthlyMatch[0]) || monthlyMatch[2] === "元" || monthlyMatch[3] === "元") ? "CNY" : null;
  const salaryMonthsQuote = lastFieldQuote(sourceQuote, /\d\s*薪|薪资月数|工资月数|几薪/);
  const salaryMonths = /\d+(?:\.\d+)?\s*[-~—–～至到]\s*\d+(?:\.\d+)?\s*薪/.test(salaryMonthsQuote)
    ? null : lastNumber(salaryMonthsQuote, /(\d+(?:\.\d+)?)\s*薪/g);
  const bonusQuote = lastFieldQuote(sourceQuote, /年终|奖金/);
  const bonusMonths = lastNumber(bonusQuote, /(?:年终奖|奖金)\s*[：:]?\s*(\d+(?:\.\d+)?)\s*(?:个)?月/g);
  const providentFundRate = lastNumber(lastFieldQuote(sourceQuote, /公积金/), /公积金\s*[：:]?\s*(\d+(?:\.\d+)?)\s*%/g);
  const probationMonths = lastNumber(lastFieldQuote(sourceQuote, /试用期/), /试用期\s*[：:]?\s*(\d+(?:\.\d+)?)\s*(?:个)?月/g);
  const socialQuote = lastFieldQuote(sourceQuote, /社保|五险/);
  const socialInsurance = fieldIsUnconfirmed(socialQuote) ? null : offerSocialInsuranceFromText(socialQuote, undefined);
  if (sourceKind !== "offer_attachment" && [monthlySalary, salaryMonths, bonusMonths, providentFundRate, probationMonths, socialInsurance].every((value) => value === null)) {
    return null;
  }
  const sourceHash = createHash("sha256").update(sourceQuote).digest("hex");
  return {
    userId: input.run.userId,
    runId: input.run.id,
    sourceId: "run:" + input.run.id + ":offer-facts:" + sourceHash.slice(0, 24),
    sourceHash,
    sourceQuote,
    sourceKind,
    ...(sourceKind === "offer_attachment" ? { attachmentHash: attachment!.sourceHash } : {}),
    facts: {
      monthlySalary,
      salaryCurrency,
      salaryMonths,
      bonusMonths,
      bonusGuarantee: fieldIsUnconfirmed(bonusQuote) ? "unknown" : offerBonusGuaranteeFromText(bonusQuote),
      socialInsurance,
      providentFundRate,
      probationMonths,
    },
  };
}

export function renderReadOnlyOfferFacts(material: ReadOnlyOfferFacts): string {
  const facts = material.facts;
  const bonusLabel = facts.bonusGuarantee === "guaranteed" ? "保证发放"
    : facts.bonusGuarantee === "uncertain" ? "非保证发放" : "是否保证发放未明确";
  return [
    "这份 Offer 的原文事实：",
    "- 月薪：" + (facts.monthlySalary === null ? "未明确" : facts.monthlySalary + (facts.salaryCurrency === "CNY" ? "元" : facts.salaryCurrency === "USD" ? "美元" : "（币种未明确）")),
    "- 薪资月数：" + (facts.salaryMonths === null ? "未明确" : facts.salaryMonths + "薪"),
    "- 奖金：" + (facts.bonusMonths === null ? "未明确" : facts.bonusMonths + "个月；" + bonusLabel),
    "- 社保：" + (facts.socialInsurance === null ? "未明确" : facts.socialInsurance ? "提供" : "不提供"),
    "- 公积金：" + (facts.providentFundRate === null ? "未明确" : facts.providentFundRate + "%"),
    "- 试用期：" + (facts.probationMonths === null ? "未明确" : facts.probationMonths + "个月"),
    "以上仅来自你提供的材料；未知条件未补成事实，未写入 Offer 报告、投递状态或个人资料。",
    "",
    "来源原文：",
    ...material.sourceQuote.split("\n").map((line) => "> " + line),
  ].join("\n");
}

function lastNumber(text: string, pattern: RegExp): number | null {
  if (fieldIsUnconfirmed(text)) return null;
  const match = [...text.matchAll(pattern)].at(-1);
  const amount = match ? Number(match[1]) : null;
  return amount !== null && Number.isFinite(amount) && Math.abs(amount) <= Number.MAX_SAFE_INTEGER ? amount : null;
}

function lastFieldQuote(text: string, field: RegExp): string {
  let selected = "";
  let exampleScope = false;
  for (const line of text.split("\n")) {
    for (const clause of line.split(/[，。；;]|(?<!\d),|,(?!\d)/)) {
      if (/(?:实际|真实|原文|已确定)(?:的)?(?:条件|薪资|数据|数值|月薪|公积金|試用期)?[为是：:]/.test(clause)) exampleScope = false;
      if (/假设|示例|举例|例如|例子/.test(clause)) exampleScope = true;
      if (field.test(clause)) selected = exampleScope ? "假设：" + clause : clause;
    }
  }
  return selected;
}

function fieldIsUnconfirmed(text: string): boolean {
  return /假设|示例|例子|举例|例如|撤回|作废|待定|未明确|未确定|尚未确认|暂不确定|暂时不确定|未知|不是/.test(text);
}
