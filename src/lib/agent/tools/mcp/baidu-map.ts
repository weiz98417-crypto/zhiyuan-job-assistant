import type { ToolDefinition } from "@/lib/agent/tools/types";
import {
  getTravelDirections,
  getWeatherForecast,
  searchPlaceInformation,
} from "@/lib/server/external-agent-service";

export const getWeather: ToolDefinition = {
  name: "get_weather",
  description: "查询城市天气（面试日天气、出行准备）",
  category: "query",
  parameters: {
    city: { type: "string", required: true, description: "城市名称，如'北京'、'上海'、'长沙'" },
  },
  handler: async (params, context) => {
    try {
      const result = await getWeatherForecast(String(params.city || ""), context?.signal);
      return { success: true, data: result, errorCategory: "ok", llmSummary: result, rawData: { city: params.city, text: result } };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "天气查询失败",
        errorCategory: "transient",
        recoverable: true,
        retryHint: `可改用 web_search 搜索“${String(params.city || "")}天气”`,
      };
    }
  },
  formatResult: (result) => {
    if (!result.success) return `天气查询失败: ${result.error}`;
    return String(result.data).slice(0, 600);
  },
};

export const searchPlace: ToolDefinition = {
  name: "search_place",
  description: "搜索地点/公司地址，查询位置信息",
  category: "query",
  parameters: {
    keyword: { type: "string", required: true, description: "地点关键词" },
    city: { type: "string", required: false, description: "所在城市" },
  },
  handler: async (params, context) => {
    try {
      const result = await searchPlaceInformation(
        String(params.keyword || ""),
        typeof params.city === "string" ? params.city : undefined,
        context?.signal,
      );
      return { success: true, data: result, errorCategory: "ok", llmSummary: result, rawData: { text: result } };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "地点搜索失败",
        errorCategory: "transient",
        recoverable: true,
      };
    }
  },
  formatResult: (result) => {
    if (!result.success) return `地点搜索失败: ${result.error}`;
    return String(result.data).slice(0, 600);
  },
};

export const getDirections: ToolDefinition = {
  name: "get_directions",
  description: "查询通勤/出行路线（面试路线规划）",
  category: "query",
  parameters: {
    origin: { type: "string", required: true, description: "起点地址" },
    destination: { type: "string", required: true, description: "终点地址" },
    mode: { type: "string", required: false, description: "出行方式：driving/transit/walking，默认transit" },
  },
  handler: async (params, context) => {
    try {
      const mode = typeof params.mode === "string" ? params.mode : "transit";
      const result = await getTravelDirections(
        String(params.origin || ""),
        String(params.destination || ""),
        mode,
        context?.signal,
      );
      return { success: true, data: result, errorCategory: "ok", llmSummary: result, rawData: { mode, text: result } };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "路线查询失败",
        errorCategory: "transient",
        recoverable: true,
        retryHint: "可改用 web_search，或建议用户使用高德地图/百度地图确认实时路线",
      };
    }
  },
  formatResult: (result) => {
    if (!result.success) return `路线查询失败: ${result.error}`;
    return String(result.data).slice(0, 600);
  },
};
