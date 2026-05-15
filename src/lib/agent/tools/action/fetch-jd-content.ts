import type { ToolDefinition, ToolResult } from "../types";

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const { url } = params;
  if (typeof url !== "string") {
    return { success: false, data: null, error: "url is required" };
  }
  const timeout = Number(params.timeout) || 30000;
  const retry = Number(params.retry) || 0;
  const doFetch = async () => fetch("/api/fetch-jd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(timeout),
  });
  let lastErr: Error | null = null;
  for (let i = 0; i <= retry; i++) {
    try {
      const res = await doFetch();
      const json = await res.json();
      return { success: json.success, data: json.data, error: json.error, errorCategory: json.success ? "ok" : "permanent" };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error("unknown");
    }
  }
  return { success: false, data: null, error: `获取 JD 失败（重试${retry}次后仍失败）: ${lastErr?.message || "超时"}`, errorCategory: "transient" };
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
    timeout: { type: "number", required: false, description: "超时毫秒，默认 30000" },
    retry: { type: "number", required: false, description: "失败重试次数，默认 0" },
  },
  category: "action",
  handler,
  formatResult,
};
