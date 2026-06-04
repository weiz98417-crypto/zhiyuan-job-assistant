import type { AgentSessionState, OfferAgentSessionState } from "@/types";

const MATERIAL_FACT_PATTERNS = [
  { label: "薪资", pattern: /(\d+(?:\.\d+)?\s*[kK]|月薪|年包|薪资|base|bonus|年终|奖金)/i },
  { label: "城市", pattern: /(城市|地点|base|办公地|通勤|搬到|上海|北京|深圳|广州|杭州|成都|南京|苏州)/i },
  { label: "社保公积金", pattern: /(社保|五险|公积金|缴纳基数|住房公积金)/i },
  { label: "试用期", pattern: /(试用期|转正|probation)/i },
  { label: "用工形式", pattern: /(外包|派遣|合同|第三方|直签|用工主体)/i },
  { label: "加班", pattern: /(加班|大小周|996|007|双休|单休|工作时长)/i },
];

const CHANGE_HINT = /(改|变|更新|补充|新增|其实|刚确认|HR说|重新说|不是|调整|换成|多了|少了|另外)/;

export function detectOfferMaterialChange(text: string): string | null {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;

  const matched = MATERIAL_FACT_PATTERNS
    .filter((item) => item.pattern.test(trimmed))
    .map((item) => item.label);
  if (!matched.length) return null;
  if (!CHANGE_HINT.test(trimmed) && !/(offer|Offer|OFFER|录取|待遇)/.test(trimmed)) return null;

  return `用户补充或修改了 Offer 关键事实：${Array.from(new Set(matched)).join("、")}`;
}

export function markOfferStateStaleFromText(
  agentState: AgentSessionState | undefined,
  text: string,
): AgentSessionState | undefined {
  const offerState = agentState?.offer;
  if (!offerState?.activeOfferReportId) return agentState;

  const reason = detectOfferMaterialChange(text);
  if (!reason) return agentState;

  const nextOffer: OfferAgentSessionState = {
    ...offerState,
    staleReportReason: reason,
    updatedAt: new Date().toISOString(),
  };

  return {
    ...(agentState || {}),
    offer: nextOffer,
  };
}
