import type { ToolDefinition } from "@/lib/agent/tools/types";
import { searchJobLeads } from "@/lib/server/external-agent-service";

export const searchJobs: ToolDefinition = {
  name: "search_jobs",
  description: "搜索职位信息（Boss直聘、拉勾、猎聘等）",
  category: "query",
  parameters: {
    keyword: { type: "string", required: true, description: "职位关键词，如'AI产品经理'" },
    city: { type: "string", required: false, description: "城市，如'北京'" },
  },
  handler: async (params, context) => {
    try {
      const result = await searchJobLeads(
        String(params.keyword || ""),
        typeof params.city === "string" ? params.city : undefined,
        context?.signal,
      );
      return {
        success: true,
        data: result,
        errorCategory: "ok",
        llmSummary: `${result}\n\n注：以上为公开搜索索引线索，不等同于招聘平台官方实时职位。`,
        rawData: { text: result, sourceKind: "public_search_index" },
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        error: `搜索失败: ${err instanceof Error ? err.message : "未知错误"}`,
        errorCategory: "transient",
        recoverable: true,
      };
    }
  },
  formatResult: (result) => {
    if (!result.success) return `职位搜索失败: ${result.error}`;
    return String(result.data).slice(0, 800);
  },
};
