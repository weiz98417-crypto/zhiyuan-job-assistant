import type { ToolDefinition, ToolResult } from "../types";

interface EvalJDFullParams {
  jd_text?: string;
  jd_url?: string;
  images?: string[];
}

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const { jd_text, jd_url, images } = params as EvalJDFullParams;

  // Delegate to streaming evaluate API — handler returns the stream,
  // client-runner reads it and yields events through the generator
  const res = await fetch("/api/evaluate/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jdText: jd_text || "",
      jdUrl: jd_url || "",
      images: images || [],
    }),
  });

  if (!res.ok) {
    return {
      success: false,
      data: null,
      error: `评估管道启动失败: HTTP ${res.status}`,
      recoverable: true,
      retryHint: "评估 API 暂时不可用，请稍后重试",
    };
  }

  // Stream Delegation: return the ReadableStream for client-runner to read
  return {
    success: true,
    data: { _stream: res.body },
    _streaming: true,
  };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `评估失败: ${result.error}`;
  const d = result.data as Record<string, unknown>;
  const risks = (d.risks as Array<{ signal: string; excerpt?: string; severity: string }>) || [];
  const riskSummary = risks.length > 0
    ? risks.map((r) => {
        const badge = r.severity === "critical" ? "🔴 严重" : r.severity === "high" ? "🟠 高风险" : "🟡 中风险";
        return `- ${badge} ${r.signal}`;
      }).join("\n")
    : "🟢 未检测到明显风险信号";

  const blocks = (d.blocks || {}) as Record<string, { content: string; score: number }>;
  const scoreLine = Object.entries(blocks)
    .map(([k, b]) => `${k.toUpperCase()}:${b?.score || "-"}`)
    .join(" ");

  const keywordList = (d.keywords as string[])?.length
    ? `关键词：${(d.keywords as string[]).slice(0, 8).join("、")}`
    : "";

  return `# ${d.company} — ${d.role}

**${d.overallScore}/5** | ${d.archetype || ""} | ${d.date || ""}
${keywordList}
报告编号: ${d.reportNum || "（已保存）"}

## 🛡️ 风险
${riskSummary}

## 各板块评分
${scoreLine}

---
⚠️ 不要调用任何工具（web_search等）。评估已经完成，你只需要基于以上数据直接输出摘要。不要搜索任何信息。

请直接按以下结构输出内容：

🏁 **结论**：<写投/不投/谨慎 + 一句话原因>

🔴 **风险**：<挑最重要的1-3个风险信号，每个一句话解读。无风险则写"未检测到明显风险">

📊 **评分概要**：<每个板块一句话（A-G），格式：A 概览X分: 要点>

💡 **建议**：<3-5条具体建议>

📎 完整 A-G 报告已保存。回复「看完整报告」可在聊天框查看，也可去报告库浏览。`;
}

export const evaluateJDFull: ToolDefinition = {
  name: "evaluate_jd_full",
  description: "对 JD 进行完整评估：风险信号检测 + A-G 7 维评分 + 生成结构化报告 + 写入追踪数据库。当用户说'评估这个JD''看看这个职位'时调用此工具。支持截图上传（images参数传base64数组）。",
  parameters: {
    jd_text: { type: "string", required: false, description: "JD 完整文本，至少 50 字符" },
    jd_url: { type: "string", required: false, description: "JD 链接 URL，工具会自动抓取内容" },
    images: { type: "array", required: false, description: "JD 截图 base64 数组" },
    language: { type: "string", required: false, description: "语言: zh/en，默认 zh" },
    archetype: { type: "string", required: false, description: "覆盖自动检测的 archetype，如 'AI产品经理'" },
  },
  category: "action",
  handler,
  formatResult,
  toolCtxCap: 2000,
};
