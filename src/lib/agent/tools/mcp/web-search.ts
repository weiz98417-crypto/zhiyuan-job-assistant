import type { ToolDefinition } from "@/lib/agent/tools/types";
import { searchWeb } from "@/lib/server/external-agent-service";

/* ── Tool definition ── */
export const webSearch: ToolDefinition = {
  name: "web_search",
  description: "万能网络搜索，用于查询公司信息、薪资行情、政策法规等求职相关信息。同时调用AI知识库和维基百科。",
  category: "query",
  parameters: {
    query: { type: "string", required: true, description: "搜索关键词" },
  },
  handler: async (params, context) => {
    try {
      const result = await searchWeb(String(params.query || ""), context?.signal);
      return {
        success: true,
        data: result.text,
        errorCategory: "ok",
        llmSummary: result.text,
        rawData: result,
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "搜索失败",
        errorCategory: "transient",
        recoverable: true,
      };
    }
  },
  formatResult: (result) => {
    if (!result.success) return `搜索失败: ${result.error}`;
    return String(result.data).slice(0, 1200);
  },
};
