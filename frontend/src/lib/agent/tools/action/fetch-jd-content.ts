import type { ToolDefinition, ToolResult } from "../types";

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const { url } = params;
  if (typeof url !== "string") {
    return { success: false, data: null, error: "url is required" };
  }
  const res = await fetch("/api/fetch-jd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const json = await res.json();
  return { success: json.success, data: json.data, error: json.error };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `获取 JD 失败: ${result.error}`;
  const d = result.data as { title?: string; text?: string } | null;
  return d ? `获取到 JD: ${d.title} (${d.text?.length || 0} 字符)` : "获取完成";
}

export const fetchJDContent: ToolDefinition = {
  name: "fetch_jd_content",
  description: "通过 URL 获取 JD 的完整文本内容",
  parameters: {
    url: { type: "string", required: true, description: "职位链接 URL" },
  },
  category: "action",
  handler,
  formatResult,
};
