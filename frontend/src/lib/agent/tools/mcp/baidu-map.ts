import type { ToolDefinition } from "@/lib/agent/tools/types";

/** Real weather — uses wttr.in (free, no API key) */
async function fetchWeather(city: string): Promise<string> {
  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const current = data.current_condition?.[0];
    const today = data.weather?.[0];
    if (!current) throw new Error("无天气数据");

    const lines = [
      `**${city}天气**`,
      `当前: ${current.weatherDesc?.[0]?.value || "未知"}，${current.temp_C}°C，体感 ${current.FeelsLikeC}°C，湿度 ${current.humidity}%，风速 ${current.windspeedKmph}km/h`,
    ];
    if (today) {
      lines.push(`今日: ${today.weatherDesc?.[0]?.value || "未知"}，最高 ${today.maxtempC}°C / 最低 ${today.mintempC}°C`);
      if (data.weather?.[1]) {
        const tomorrow = data.weather[1];
        lines.push(`明日: ${tomorrow.weatherDesc?.[0]?.value || "未知"}，最高 ${tomorrow.maxtempC}°C / 最低 ${tomorrow.mintempC}°C`);
      }
    }
    return lines.join("\n");
  } catch (err) {
    return `天气查询失败: ${err instanceof Error ? err.message : "未知错误"}。请尝试用 web_search 搜索"${city}天气"`;
  }
}

/** Route — use DuckDuckGo to search for route info */
async function fetchRoute(origin: string, destination: string, mode?: string): Promise<string> {
  try {
    const query = `${origin} 到 ${destination} ${mode === "driving" ? "驾车" : mode === "walking" ? "步行" : "公交地铁"} 路线`;
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const parts: string[] = [];
    if (data.Abstract) parts.push(data.Abstract);
    if (data.AbstractText) parts.push(data.AbstractText);
    if (data.RelatedTopics?.length) {
      for (const t of data.RelatedTopics.slice(0, 2)) {
        if (t.Text) parts.push(t.Text.slice(0, 200));
      }
    }
    return parts.join("\n") || `未找到${origin}到${destination}的路线信息。建议使用地图App查询。`;
  } catch {
    return `路线查询失败。建议使用高德地图或百度地图App查询${origin}到${destination}的路线。`;
  }
}

export const getWeather: ToolDefinition = {
  name: "get_weather",
  description: "查询城市天气（面试日天气、出行准备）",
  category: "query",
  parameters: {
    city: { type: "string", required: true, description: "城市名称，如'北京'、'上海'、'长沙'" },
  },
  handler: async (params) => {
    const result = await fetchWeather(params.city as string);
    return { success: true, data: result };
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
  handler: async (params) => {
    const q = params.city ? `${params.city} ${params.keyword}` : params.keyword;
    const query = `${q} 地址 位置`;
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query as string)}&format=json&no_html=1`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: null, error: `搜索失败: ${res.status}` };
    const data = await res.json();
    const parts: string[] = [];
    if (data.Abstract) parts.push(data.Abstract);
    if (data.RelatedTopics?.length) {
      for (const t of data.RelatedTopics.slice(0, 3)) {
        if (t.Text) parts.push(t.Text.slice(0, 150));
      }
    }
    return { success: true, data: parts.join("\n") || `未找到"${q}"的位置信息` };
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
  handler: async (params) => {
    const result = await fetchRoute(params.origin as string, params.destination as string, params.mode as string | undefined);
    return { success: true, data: result };
  },
  formatResult: (result) => {
    if (!result.success) return `路线查询失败: ${result.error}`;
    return String(result.data).slice(0, 600);
  },
};
