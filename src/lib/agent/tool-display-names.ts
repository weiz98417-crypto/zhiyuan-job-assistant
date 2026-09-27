/**
 * Tool name → Chinese display label.
 * Used by ToolResultCard in the chat shell domain cards.
 * 0.11.0-D: emoji 字段按「去 AI 味四禁」移除;图标由渲染层的 Lucide 组件承担。
 */
export interface ToolDisplay {
  label: string;
}

export const TOOL_DISPLAY: Record<string, ToolDisplay> = {
  recognize_document_image: { label: "识别图片" },
  get_application_context: { label: "读取追踪上下文" },
  // Query tools
  search_applications:  { label: "搜索投递记录" },
  get_report_detail:    { label: "查看评估报告" },
  get_profile:          { label: "读取求职画像" },
  get_recent_activity:  { label: "近期活动" },
  get_recent_jd_context:{ label: "读取最近 JD" },
  get_recommendations:  { label: "岗位推荐" },
  get_pipeline_status:  { label: "Pipeline 状态" },
  import_resume:             { label: "导入简历" },
  decode_black_market_terms: { label: "黑话解码" },
  generate_interview_questions: { label: "生成面试题" },
  score_interview_answer:  { label: "评分面试回答" },

  track_application: { label: "加入投递追踪" },
  update_application_status: { label: "更新投递状态" },
  // Action tools
  evaluate_jd:          { label: "评估 JD" },
  evaluate_offer:       { label: "评估 Offer" },
  generate_cv:          { label: "生成简历" },
  scan_portals:         { label: "开始岗位发现" },
  check_health:         { label: "健康检查" },
  fetch_jd_content:     { label: "获取 JD 内容" },
  export_file:          { label: "导出文件" },
  mine_profile:         { label: "挖掘画像" },
  evaluate_jd_full:     { label: "JD 完整评估" },
  analyze_jd_risks:     { label: "JD 风险扫描" },
  self_positioning:     { label: "自我定位引导" },
  prepare_interview_full:{ label: "面试全案准备" },
  compare_offers_deep:  { label: "Offer 深度对比" },
  check_pipeline_health:{ label: "管道健康检查" },
  optimize_resume_section:{ label: "简历优化" },
  fill_application_form:{ label: "填表助手" },
  get_profile_insights: { label: "画像洞察" },
  detect_skill_gaps:    { label: "技能缺口分析" },
  create_resume_edit_proposal: { label: "创建简历修改提案" },
  apply_resume_edit_proposal: { label: "应用简历修改提案" },
  discard_resume_edit_proposal: { label: "废弃简历修改提案" },
  rollback_resume_edit_proposal: { label: "回滚简历修改" },
  save_resume_section:      { label: "保存到简历" },
  save_reference_resume:    { label: "保存优秀简历" },
  check_ats_compatibility:  { label: "ATS 兼容检查" },
  start_interview_session:  { label: "启动模拟面试" },
  download_report_pdf:  { label: "导出报告 PDF" },
  update_report_metadata: { label: "更新报告信息" },

  // MCP tools
  web_search:           { label: "网络搜索" },
  get_weather:          { label: "天气查询" },
  search_place:         { label: "地点搜索" },
  get_directions:       { label: "路线规划" },
  search_jobs:          { label: "岗位发现" },
};

const DEFAULT_DISPLAY: ToolDisplay = { label: "" };

export function getToolDisplay(toolName: string): ToolDisplay {
  const entry = TOOL_DISPLAY[toolName];
  if (entry) return entry;
  return { ...DEFAULT_DISPLAY, label: toolName };
}
