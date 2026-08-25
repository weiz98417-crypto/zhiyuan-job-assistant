import { decodeJDRiskTerms } from "@/lib/server/jd-risk-service";
import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";

interface DecodedTerm {
  term: string;
  meaning: string;
  severity: string;
}

const SEVERITY_EMOJI: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🟡", low: "⚪" };

async function handler(
  params: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  const text = [params.text, params.phrase, params.jd_text]
    .find((value) => typeof value === "string" && value.trim()) as string | undefined;
  if (!text || !text.trim()) {
    return {
      success: false,
      data: null,
      error: "请提供要解码的短语或 JD 文本",
      errorCategory: "need_user_input",
      recoverable: false,
      retryHint: "请提供具体的 JD 短语、投递说明或完整 JD 文本，不能为空",
    };
  }

  if (context) {
    const matches = decodeJDRiskTerms(text);
    return {
      success: true,
      data: matches,
      llmSummary: formatResult({ success: true, data: matches }),
    };
  }

  const res = await fetch("/api/agent/decode-terms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) return { success: false, data: null, error: `黑话解码失败: HTTP ${res.status}`, errorCategory: "transient", recoverable: true, retryHint: "黑话解码服务暂时不可用，请直接基于词典知识回答" };
  const json = await res.json();
  if (!json.success) return { success: false, data: null, error: json.error || "黑话解码失败", errorCategory: "transient", recoverable: true, retryHint: "查询未命中，请尝试搜索相关关键词或直接建议用户自行判断" };
  const matches = json.data || [];
  return {
    success: true,
    data: matches,
    llmSummary: formatResult({ success: true, data: matches }),
  };
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
  description: "解释 JD 中的招聘黑话真实含义。必须传入用户提到的原文短语、投递说明或完整 JD 文本；不要空参调用。例如'亲自带'=可能有长期无偿加班风险。",
  matchHints: ["黑话", "解码", "JD有没有坑", "投递说明", "下午茶", "优先邀约", "弹性工作制", "抗压能力强"],
  parameters: {
    text: { type: "string", required: true, description: "要解码的原文，可以是单个短语、投递说明片段或完整 JD 文本" },
    phrase: { type: "string", required: false, description: "单个短语解码（与 jd_text 二选一）" },
    jd_text: { type: "string", required: false, description: "完整 JD 文本，批量解码其中所有黑话（与 phrase 二选一）" },
  },
  category: "query",
  handler,
  formatResult,
};
