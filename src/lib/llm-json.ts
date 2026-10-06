/**
 * LLM JSON 解析收口（eng review S2-3）：全仓「剥 ```json 围栏 → JSON.parse →
 * 兜底正则取 {}」样板合一（2026-10C spec 32 起为唯一合法解析入口）。
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
 *  LLM max_tokens 截断的 JSON（尾部被切、连闭合 `}` 都没有）从首个 `{`
 *  起取候选，按「回退到最后完整成员」与「深度推断补闭合符」两级修复；修不了才 null。
 *  对象路径失败后走数组路径（spec 32：标签内截断数组的等价修复）。 */
function repairedJsonText(text: string): string | null {
  const objectText = repairedObjectJsonText(text);
  if (objectText !== null) return objectText;
  return repairedArrayJsonText(text);
}

function repairedObjectJsonText(text: string): string | null {
  const direct = extractLlmJsonText(text);
  if (direct !== null) {
    try {
      JSON.parse(direct);
      return direct;
    } catch {
      // fall through to repair
    }
  }
  const start = text.indexOf("{");
  if (start === -1) return null;
  const candidate = text.slice(start).replace(/\r\n/g, "\n").trimEnd();
  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    // fall through to repair
  }
  // 修复 A：尾部可能是被切断的新成员——回退到最后一个完整 `}`
  const lastBrace = candidate.lastIndexOf("}");
  if (lastBrace > 0) {
    const repaired = candidate.slice(0, lastBrace + 1);
    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      // fall through to repair B
    }
  }
  // 修复 B：按字符串感知的括号深度推断缺失的闭合序列（inString 先补 `"`，再 LIFO 补 `}`/`]`）
  const closing = closingFor(candidate);
  if (closing) {
    const repaired = candidate + closing;
    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      // give up
    }
  }
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
  const jsonText = repairedJsonText(text);
  if (jsonText === null) return null;
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** 同 parseLlmJsonObject，但容忍任意顶层 JSON 值（数组等，如 <<FOLLOWUPS>> 标签包裹的
 *  列表、无视 response_format 返回的顶层数组）；失败 null（spec 32 前置增量，既有签名不变）。 */
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
