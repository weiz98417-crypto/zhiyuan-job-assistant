/**
 * Tool name → Chinese display label + emoji mapping.
 * Used by ToolResultCard and ExecutingIndicator in AgentChat.
 */
export interface ToolDisplay {
  label: string;
  emoji: string;
}

export const TOOL_DISPLAY: Record<string, ToolDisplay> = {
  // Query tools
  search_applications:  { label: "搜索投递记录", emoji: "📋" },
  get_report_detail:    { label: "查看评估报告", emoji: "📊" },
  get_profile:          { label: "读取求职画像", emoji: "👤" },
  get_recent_activity:  { label: "近期活动",     emoji: "🕐" },
  get_recommendations:  { label: "岗位推荐",     emoji: "💼" },
  get_pipeline_status:  { label: "Pipeline 状态", emoji: "📡" },
  import_resume:        { label: "导入简历",     emoji: "📥" },

  // Action tools
  evaluate_jd:          { label: "评估 JD",      emoji: "🔍" },
  evaluate_offer:       { label: "评估 Offer",   emoji: "💰" },
  generate_cv:          { label: "生成简历",     emoji: "📄" },
  scan_portals:         { label: "扫描招聘网站", emoji: "🔎" },
  check_health:         { label: "健康检查",     emoji: "🩺" },
  fetch_jd_content:     { label: "获取 JD 内容", emoji: "📥" },
  export_file:          { label: "导出文件",     emoji: "📦" },
  mine_profile:         { label: "挖掘画像",     emoji: "⛏️" },

  // MCP tools
  web_search:           { label: "网络搜索",     emoji: "🌐" },
  get_weather:          { label: "天气查询",     emoji: "🌤️" },
  search_place:         { label: "地点搜索",     emoji: "📍" },
  get_directions:       { label: "路线规划",     emoji: "🗺️" },
  search_jobs:          { label: "搜索职位",     emoji: "🔎" },
};

const DEFAULT_DISPLAY: ToolDisplay = { label: "", emoji: "🔧" };

export function getToolDisplay(toolName: string): ToolDisplay {
  const entry = TOOL_DISPLAY[toolName];
  if (entry) return entry;
  return { ...DEFAULT_DISPLAY, label: toolName };
}
