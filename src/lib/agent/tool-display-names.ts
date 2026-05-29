/**
 * Tool name → Chinese display label + emoji mapping.
 * Used by ToolResultCard and ExecutingIndicator in AgentChat.
 */
export interface ToolDisplay {
  label: string;
  emoji: string;
}

export const TOOL_DISPLAY: Record<string, ToolDisplay> = {
  recognize_document_image: { label: "识别图片", emoji: "🖼️" },
  // Query tools
  search_applications:  { label: "搜索投递记录", emoji: "📋" },
  get_report_detail:    { label: "查看评估报告", emoji: "📊" },
  get_profile:          { label: "读取求职画像", emoji: "👤" },
  get_recent_activity:  { label: "近期活动",     emoji: "🕐" },
  get_recent_jd_context:{ label: "读取最近 JD",  emoji: "📌" },
  get_recommendations:  { label: "岗位推荐",     emoji: "💼" },
  get_pipeline_status:  { label: "Pipeline 状态", emoji: "📡" },
  import_resume:             { label: "导入简历",     emoji: "📥" },
  decode_black_market_terms: { label: "黑话解码",     emoji: "🔓" },
  generate_interview_questions: { label: "生成面试题", emoji: "📝" },
  score_interview_answer:  { label: "评分面试回答", emoji: "⭐" },

  // Action tools
  evaluate_jd:          { label: "评估 JD",      emoji: "🔍" },
  evaluate_offer:       { label: "评估 Offer",   emoji: "💰" },
  generate_cv:          { label: "生成简历",     emoji: "📄" },
  scan_portals:         { label: "扫描招聘网站", emoji: "🔎" },
  check_health:         { label: "健康检查",     emoji: "🩺" },
  fetch_jd_content:     { label: "获取 JD 内容", emoji: "📥" },
  export_file:          { label: "导出文件",     emoji: "📦" },
  mine_profile:         { label: "挖掘画像",     emoji: "⛏️" },
  evaluate_jd_full:     { label: "JD 完整评估",  emoji: "🛡️" },
  analyze_jd_risks:     { label: "JD 风险扫描",  emoji: "⚠️" },
  self_positioning:     { label: "自我定位引导", emoji: "🧭" },
  prepare_interview_full:{ label: "面试全案准备", emoji: "🎯" },
  compare_offers_deep:  { label: "Offer 深度对比", emoji: "⚖️" },
  check_pipeline_health:{ label: "管道健康检查", emoji: "📋" },
  optimize_resume_section:{ label: "简历优化",   emoji: "✏️" },
  fill_application_form:{ label: "填表助手",     emoji: "📝" },
  get_profile_insights: { label: "画像洞察",     emoji: "📊" },
  detect_skill_gaps:    { label: "技能缺口分析", emoji: "🔍" },
  save_resume_section:      { label: "保存到简历", emoji: "💾" },
  check_ats_compatibility:  { label: "ATS 兼容检查", emoji: "🤖" },
  start_interview_session:  { label: "启动模拟面试", emoji: "🎙️" },
  download_report_pdf:  { label: "导出报告 PDF", emoji: "🖨️" },
  update_report_metadata: { label: "更新报告信息", emoji: "✏️" },

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
