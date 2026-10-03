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

/** 宽松解析：成功返回对象，失败返回 null（不抛）。
 *  含截断修复：LLM max_tokens 截断的 JSON（尾部被切、连闭合 `}` 都没有）从首个 `{`
 *  起取候选，按「回退到最后完整成员」与「深度推断补闭合符」两级修复；修不了才 null。 */
export function parseLlmJsonObject(text: string): Record<string, unknown> | null {
  const direct = tryParse(extractLlmJsonText(text));
  if (direct) return direct;
  const start = text.indexOf("{");
  if (start === -1) return null;
  const candidate = text.slice(start).replace(/\r\n/g, "\n").trimEnd();
  const directCandidate = tryParse(candidate);
  if (directCandidate) return directCandidate;
  // 修复 A：尾部可能是被切断的新成员——回退到最后一个完整 `}`
  const lastBrace = candidate.lastIndexOf("}");
  if (lastBrace > 0) {
    const repaired = tryParse(candidate.slice(0, lastBrace + 1));
    if (repaired) return repaired;
  }
  // 修复 B：按字符串感知的括号深度推断缺失的闭合序列（inString 先补 `"`，再 LIFO 补 `}`/`]`）
  const closing = closingFor(candidate);
  if (closing) {
    const repaired = tryParse(candidate + closing);
    if (repaired) return repaired;
  }
  return null;
}

function tryParse(jsonText: string | null): Record<string, unknown> | null {
  if (jsonText === null) return null;
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** 按已闭合内容推断还缺什么闭合符（忽略字符串内的括号——对 LLM 截断场景足够）。 */
function closingFor(text: string): string {
  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  for (const ch of text) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let closing = "";
  if (inString) closing += '"';
  while (stack.length > 0) closing += stack.pop();
  return closing;
}
