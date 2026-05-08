import type { ToolDefinition } from "@/lib/agent/tools/types";

export const searchJobs: ToolDefinition = {
  name: "search_jobs",
  description: "搜索职位信息（Boss直聘、拉勾、猎聘等）",
  category: "query",
  parameters: {
    keyword: { type: "string", required: true, description: "职位关键词，如'AI产品经理'" },
    city: { type: "string", required: false, description: "城市，如'北京'" },
  },
  handler: async (params) => {
    try {
      const q = params.city ? `${params.city} ${params.keyword} 招聘` : `${params.keyword} 招聘`;
      const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q as string)}&format=json&no_html=1`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { success: false, data: null, error: `搜索失败: ${res.status}` };
      const data = await res.json();
      const parts: string[] = [];
      if (data.Abstract) parts.push(data.Abstract);
      if (data.RelatedTopics?.length) {
        for (const t of data.RelatedTopics.slice(0, 5)) {
          if (t.Text) parts.push(`- ${t.Text.slice(0, 150)}`);
        }
      }
      return { success: true, data: parts.join("\n") || `未找到相关职位` };
    } catch (err) {
      return { success: false, data: null, error: `搜索失败: ${err instanceof Error ? err.message : "未知错误"}` };
    }
  },
  formatResult: (result) => {
    if (!result.success) return `职位搜索失败: ${result.error}`;
    return String(result.data).slice(0, 800);
  },
};
