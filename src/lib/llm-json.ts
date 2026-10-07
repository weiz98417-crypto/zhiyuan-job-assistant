/**
 * LLM JSON 解析收口（eng review S2-3）：全仓「剥 ```json 围栏 → JSON.parse →
 * 兜底正则取 {}」样板的唯一合法解析入口（spec 32：8 处 route 样板 + 判官/生成链等
 * 服务内调用统一走此，禁止调用点再自造 parse+正则兜底）。
 * 返回 null 表示解析失败，由调用方决定抛错还是降级。
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

/** 内部：从 LLM 文本中取出一份「能成功 JSON.parse」的 JSON 文本，含截断修复：
 *  LLM max_tokens 截断的 JSON（尾部被切、连闭合符都没有）取候选后按
 *  「回退到最后完整成员」与「字符串感知深度补闭合符」两级修复；修不了才 null。
 *  对象路径失败后走数组路径（spec 32：标签内截断数组的等价修复）。 */
function repairedJsonText(text: string): string | null {
  return repairedObjectJsonText(text) ?? repairedArrayJsonText(text);
}

function repairedObjectJsonText(text: string): string | null {
  const direct = extractLlmJsonText(text);
  if (direct !== null && parses(direct)) return direct;
  const start = text.indexOf("{");
  if (start === -1) return null;
  const candidate = text.slice(start).replace(/\r\n/g, "\n").trimEnd();
  if (parses(candidate)) return candidate;
  // 修复 A：尾部可能是被切断的新成员——回退到最后一个完整 `}`
  const lastBrace = candidate.lastIndexOf("}");
  if (lastBrace > 0) {
    const repaired = candidate.slice(0, lastBrace + 1);
    if (parses(repaired)) return repaired;
  }
  // 修复 B：按字符串感知的括号深度推断缺失的闭合序列（inString 先补 `"`，再 LIFO 补 `}`/`]`）
  const closing = closingFor(candidate);
  if (closing && parses(candidate + closing)) return candidate + closing;
  return null;
}

/** 数组候选的截断修复：结构与对象版对齐——「干净的结构性闭合」优先，
 *  截断在字符串内部时回退到最后一个完整成员边界（最后一个 `","`）。 */
function repairedArrayJsonText(text: string): string | null {
  const start = text.indexOf("[");
  if (start === -1) return null;
  const candidate = text.slice(start).replace(/\r\n/g, "\n").trimEnd();
  if (parses(candidate)) return candidate;
  const closing = closingFor(candidate);
  if (closing && !closing.startsWith('"') && parses(candidate + closing)) return candidate + closing;
  const boundary = candidate.lastIndexOf('","');
  if (boundary > 0) {
    const repaired = candidate.slice(0, boundary + 1) + "]";
    if (parses(repaired)) return repaired;
  }
  const lastComma = candidate.lastIndexOf(",");
  if (lastComma > 0) {
    const repaired = candidate.slice(0, lastComma) + "]";
    if (parses(repaired)) return repaired;
  }
  if (closing && parses(candidate + closing)) return candidate + closing;
  return null;
}

function parses(jsonText: string): boolean {
  try {
    JSON.parse(jsonText);
    return true;
  } catch {
    return false;
  }
}

/** 宽松解析：成功返回对象，失败返回 null（不抛）。 */
export function parseLlmJsonObject(text: string): Record<string, unknown> | null {
  const value = parseLlmJsonValue(text);
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** 同 parseLlmJsonObject，但容忍任意顶层 JSON 值（数组等，如 <<FOLLOWUPS>> 标签包裹的
 *  列表、无视 response_format 返回的顶层数组）；失败 null（spec 32 增量）。 */
export function parseLlmJsonValue(text: string): unknown | null {
  const jsonText = repairedJsonText(text);
  if (jsonText === null) return null;
  try {
    return JSON.parse(jsonText) as unknown;
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
