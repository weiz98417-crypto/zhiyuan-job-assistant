export function nullableOfferNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "" || typeof value === "boolean") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function nullableOfferBoolean(value: unknown): boolean | null {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return null;
}

export function offerSocialInsuranceFromText(text: string, explicitValue: unknown): boolean | null {
  const explicit = nullableOfferBoolean(explicitValue);
  if (explicit !== null) return explicit;
  if (/无社保|没有社保|不缴社保|不交社保|不缴纳社保|不提供五险一金/.test(text)) return false;
  if (/(?:未明确|未确认|不确定|未知)[^\n。；;]{0,15}(?:社保|五险一金)/.test(text)) return null;
  if (/缴纳(?:五险一金|社保)|提供五险一金|有社保/.test(text)) return true;
  return null;
}

export function offerBonusGuaranteeFromText(text: string): "guaranteed" | "uncertain" | "unknown" {
  const uncertainty = "(?:不(?:保证|保底|一定|是保证)|无保证|未保证|非保证|视绩效|浮动|不确定)";
  const bonus = "(?:奖金|年终)";
  const clause = "[^\\n。；;]{0,30}";
  if (new RegExp(bonus + clause + uncertainty + "|" + uncertainty + clause + bonus).test(text)) return "uncertain";
  if (/(?:奖金|年终)[^\n。；;]{0,30}(?:保证|保底)|(?:保证|保底)[^\n。；;]{0,30}(?:奖金|年终)/.test(text)) return "guaranteed";
  return "unknown";
}
