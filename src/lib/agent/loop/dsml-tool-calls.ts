export interface ParsedDsmlToolCall {
  id: string;
  name: string;
  arguments: string;
}

export function extractDsmlToolCalls(text: string): { text: string; toolCalls: ParsedDsmlToolCall[]; detected: boolean } {
  const detected = /DSML|tool[_\s|｜▁]*calls?/i.test(text) && /[<｜]/.test(text);
  if (!detected) return { text, toolCalls: [], detected: false };

  const toolCalls: ParsedDsmlToolCall[] = [];
  const invokePattern = /(?:<|｜)[^>｜]*invoke[^>｜]*(?:name\s*=\s*["']([^"']+)["']|function\s*=\s*["']([^"']+)["'])[^>｜]*(?:>|｜)([\s\S]*?)(?:(?:<\/|｜\/)[^>｜]*invoke[^>｜]*(?:>|｜))/gi;
  for (const match of text.matchAll(invokePattern)) {
    const name = String(match[1] || match[2] || "").trim();
    if (!name) continue;
    const args: Record<string, unknown> = {};
    const body = match[3] || "";
    const parameterPattern = /(?:<|｜)[^>｜]*parameter[^>｜]*name\s*=\s*["']([^"']+)["'][^>｜]*(?:>|｜)([\s\S]*?)(?:(?:<\/|｜\/)[^>｜]*parameter[^>｜]*(?:>|｜))/gi;
    for (const parameter of body.matchAll(parameterPattern)) {
      args[parameter[1]] = parseParameterValue(parameter[2]);
    }
    toolCalls.push({ id: `dsml-${toolCalls.length + 1}`, name, arguments: JSON.stringify(args) });
  }

  if (toolCalls.length === 0) {
    const jsonCandidates = text.match(/\{[\s\S]*?"(?:name|tool_name)"[\s\S]*?\}/g) || [];
    for (const candidate of jsonCandidates) {
      try {
        const parsed = JSON.parse(candidate) as Record<string, unknown>;
        const name = String(parsed.name || parsed.tool_name || "").trim();
        if (!name) continue;
        const args = parsed.arguments ?? parsed.parameters ?? parsed.args ?? {};
        toolCalls.push({
          id: String(parsed.id || `dsml-${toolCalls.length + 1}`),
          name,
          arguments: typeof args === "string" ? args : JSON.stringify(args),
        });
      } catch {
        continue;
      }
    }
  }

  const cleaned = text
    .replace(/(?:<|｜)[^>｜]*(?:DSML|tool[_\s|｜▁]*calls?)[^>｜]*(?:>|｜)[\s\S]*?(?:(?:<\/|｜\/)[^>｜]*(?:DSML|tool[_\s|｜▁]*calls?)[^>｜]*(?:>|｜))/gi, "")
    .replace(/<｜｜DSML｜｜tool_calls>[\s\S]*/gi, "")
    .trim();
  return { text: cleaned, toolCalls, detected: true };
}

function parseParameterValue(value: string): unknown {
  const text = value.trim();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
