import { scanJDRisks } from "@/lib/server/jd-risk-service";
import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";

interface RiskSignal {
  signal: string;
  excerpt: string;
  severity: "critical" | "high" | "medium" | "low";
}

const SEVERITY_WEIGHT: Record<string, number> = { critical: 10, high: 4, medium: 2, low: 1 };

async function handler(
  params: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  const jdText = params.jd_text as string;
  if (!jdText || jdText.trim().length < 20) {
    return { success: false, data: null, error: "JD 文本不足 20 字符（无法分析风险）", recoverable: false, retryHint: "请提供完整的 JD 文本或 URL，至少 20 字符以上" };
  }

  if (context) {
    return { success: true, data: scanJDRisks(jdText) };
  }

  const res = await fetch("/api/agent/scan-risks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jd_text: jdText }),
  });
  if (!res.ok) return { success: false, data: null, error: `风险扫描失败: HTTP ${res.status}`, recoverable: true, retryHint: "风险扫描 API 暂时不可用，请稍后重试或提供更短的 JD 文本片段" };
  const json = await res.json();
  return { success: true, data: json.data || [] };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `风险扫描失败: ${result.error}`;
  const signals = result.data as RiskSignal[];
  if (!signals.length) return "🟢 未检测到明显风险信号";

  const totalWeight = signals.reduce((sum, s) => sum + (SEVERITY_WEIGHT[s.severity] || 0), 0);
  const isCritical = signals.some((s) => s.severity === "critical");
  const level = isCritical ? "🔴 严重"
    : totalWeight >= 6 ? "🔴 高风险"
    : totalWeight >= 2 ? "🟡 中风险"
    : "🟢 低风险";

  const badgeClass = (s: string) => `risk-badge risk-${s}`;
  const badgeLabel: Record<string, string> = { critical: "🔴 严重", high: "🟠 高风险", medium: "🟡 中风险", low: "⚪ 低风险" };
  const rows = signals.map((s) =>
    `| <span class="${badgeClass(s.severity)}">${badgeLabel[s.severity] || s.severity}</span> **${s.signal}** | ${s.excerpt} |`
  ).join("\n");

  return `## 🛡️ 风险检测报告\n\n**风险总分: ${totalWeight} → 综合等级: ${level}**\n\n| 风险信号 | JD 原文 |\n|------|--------|\n${rows}`;
}

export const analyzeJDRisks: ToolDefinition = {
  name: "analyze_jd_risks",
  description: "快速扫描 JD 文本中的风险信号：招聘黑话解码、骗术模式识别、用工形式检测。当用户问'这个JD有没有坑''这句话什么意思'时调用此工具。",
  parameters: {
    jd_text: { type: "string", required: false, description: "要扫描的 JD 文本或片段（与 reportNum 二选一）" },
    reportNum: { type: "number", required: false, description: "已评估报告编号，自动从中获取 JD 文本" },
  },
  category: "action",
  handler,
  formatResult,
};
