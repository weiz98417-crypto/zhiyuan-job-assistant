import type { ToolDefinition, ToolResult } from "../types";

interface EvalJDFullParams {
  jd_text?: string;
  jd_url?: string;
}

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const { jd_text, jd_url } = params as EvalJDFullParams;
  let jdText = jd_text || "";

  // Delegate to evaluate-pipeline endpoint (single call instead of 3)
  const res = await fetch("/api/agent/evaluate-pipeline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jd_text: jdText, jd_url }),
  });
  if (!res.ok) return { success: false, data: null, error: `评估管道失败: HTTP ${res.status}`, recoverable: true, retryHint: "评估 API 暂时不可用，请稍后重试或尝试提供更短的 JD 文本" };

  // Parse SSE stream to get final result
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let finalData: Record<string, unknown> = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === "done" && event.data) finalData = event.data;
        if (event.type === "error") return { success: false, data: null, error: event.error as string, recoverable: true, retryHint: "评估流返回错误，请稍后重试" };
      } catch { /* skip */ }
    }
  }

  return { success: true, data: finalData };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `评估失败: ${result.error}`;
  const d = result.data as Record<string, unknown>;
  const risks = (d.risks as Array<{ signal: string; excerpt?: string; severity: string }>) || [];
  const riskSummary = risks.length > 0
    ? risks.map((r) => {
        const badge = r.severity === "critical" ? "🔴 严重" : r.severity === "high" ? "🟠 高风险" : "🟡 中风险";
        const excerpt = r.excerpt ? ` —— 原文: "${r.excerpt}"` : "";
        return `  - <span class="risk-badge risk-${r.severity}">${badge}</span> **${r.signal}**${excerpt}`;
      }).join("\n")
    : "  🟢 未检测到明显风险信号";

  return `## ${d.company} — ${d.role}\n\n**总分: ${d.overallScore}/5** | ${d.archetype || ""}\n\n### 🛡️ 风险检测\n${riskSummary}\n\n> ⚠️ 风险等级使用 <span class="risk-badge risk-critical"> / <span class="risk-badge risk-high"> 标签包裹，请保持此格式输出。每个风险信号用 **加粗** 标注，让用户一眼看到。`;
}

export const evaluateJDFull: ToolDefinition = {
  name: "evaluate_jd_full",
  description: "对 JD 进行完整评估：风险信号检测 + A-G 7 维评分 + 生成结构化报告 + 写入追踪数据库。当用户说'评估这个JD''看看这个职位'时调用此工具。",
  parameters: {
    jd_text: { type: "string", required: false, description: "JD 完整文本，至少 50 字符" },
    jd_url: { type: "string", required: false, description: "JD 链接 URL，工具会自动抓取内容" },
  },
  category: "action",
  handler,
  formatResult,
};
