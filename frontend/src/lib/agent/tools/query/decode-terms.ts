import type { ToolDefinition, ToolResult } from "../types";

interface DecodedTerm {
  term: string;
  meaning: string;
  severity: string;
}

const SEVERITY_EMOJI: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🟡", low: "⚪" };

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const phrase = params.phrase as string;
  if (!phrase || !phrase.trim()) {
    return { success: false, data: null, error: "请提供要解码的短语", recoverable: false, retryHint: "请提供具体的 JD 短语或词语，不能为空" };
  }

  const res = await fetch("/api/agent/decode-terms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phrase }),
  });
  if (!res.ok) return { success: false, data: null, error: `黑话解码失败: HTTP ${res.status}`, recoverable: true, retryHint: "黑话解码服务暂时不可用，请直接基于词典知识回答" };
  const json = await res.json();
  if (!json.success) return { success: false, data: null, error: json.error || "黑话解码失败", recoverable: true, retryHint: "查询未命中，请尝试搜索相关关键词或直接建议用户自行判断" };
  return { success: true, data: json.data || [] };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `解码失败: ${result.error}`;
  const matches = result.data as DecodedTerm[];
  if (!matches.length) return "未匹配到已知招聘黑话。请直接回答：该短语在已知黑话词典中未收录，建议用户自行判断。";
  const raw = matches.map((m) =>
    `- ${SEVERITY_EMOJI[m.severity] || "⚪"} "${m.term}" → ${m.meaning} (严重度: ${m.severity})`
  ).join("\n");
  return raw;
}

export const decodeBlackMarketTerms: ToolDefinition = {
  name: "decode_black_market_terms",
  description: "解释 JD 中的招聘黑话真实含义。当用户问'XX是什么意思''JD里写的YY代表什么'时调用此工具。例如'亲自带'=可能有长期无偿加班风险。",
  parameters: {
    phrase: { type: "string", required: true, description: "JD 中需要解码的词语或短语" },
  },
  category: "query",
  handler,
  formatResult,
};
