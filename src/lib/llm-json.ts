/**
 * LLM JSON 解析收口（eng review S2-3）：全仓 7 份「剥 ```json 围栏 → JSON.parse →
 * 兜底正则取 {}」样板合一。返回 null 表示解析失败，由调用方决定抛错还是降级。
 */
export function extractLlmJsonText(text: string): string | null {
  const normalized = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    JSON.parse(normalized);
    return normalized;
  } catch {
    const match = normalized.match(/\{[\s\S]*\}/);
    return match ? match[0] : null;
  }
}

/** 宽松解析：成功返回对象，失败返回 null（不抛）。 */
export function parseLlmJsonObject(text: string): Record<string, unknown> | null {
  const jsonText = extractLlmJsonText(text);
  if (jsonText === null) return null;
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
