import type { AgentTaskContract, AgentTaskType } from "@/lib/agent/task-contract";
import type { ToolDefinition, ToolResult } from "@/lib/agent/tools/types";
import { getActionToolRisk } from "@/lib/agent/tools/action-tool-risk";

export type ToolEffect =
  | "read"
  | "guide"
  | "write"
  | "high_risk_write"
  | "export"
  | "admin"
  | "internal";

export type TaskContractPolicy =
  | "guidance"
  | "read_only"
  | "verified_write"
  | "high_risk_verified_write"
  | "export_verified"
  | "admin_verified";

export type ToolDocumentType =
  | "jd"
  | "offer"
  | "resume"
  | "profile"
  | "memory"
  | "report"
  | "file"
  | "session"
  | "unknown";

export type ToolTaskType = AgentTaskType | "general_chat" | "job_search" | "system_diagnostics";

export interface ToolGovernance {
  name: string;
  effect: ToolEffect;
  allowedTaskTypes: ToolTaskType[];
  agentAllowlist: string[];
  documentTypes?: ToolDocumentType[];
  requiresUserConfirmation: boolean;
  requiresReadBack: boolean;
  successContract: string;
  conflictPriority: number;
  userVisibleNameZh: string;
}

export interface ToolGovernanceAuditIssue {
  toolName: string;
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface ToolRouteConflictIssue {
  taskType: ToolTaskType;
  documentType: ToolDocumentType | "any";
  conflictPriority: number;
  tools: string[];
  message: string;
}

export interface ToolGovernanceDecision {
  allowed: boolean;
  reason?: string;
  effect: ToolEffect;
  contractPolicy?: TaskContractPolicy;
  governance?: ToolGovernance;
}

export interface LegacyToolGovernanceCompatibility {
  toolName: string;
  fallbackEffect: ToolEffect;
  defaultDenied: boolean;
  warning: string;
  removalChecklist: string[];
}

export const LEGACY_TOOL_GOVERNANCE_REMOVAL_CHECKLIST = [
  "Add explicit ToolGovernance metadata to TOOL_GOVERNANCE_REGISTRY.",
  "Bind the tool to allowed task types and agent allowlist.",
  "Declare read-back/verifier requirements for write, export, or admin effects.",
  "Add a regression eval for the intended route and success contract.",
];

const ALL_TASKS: ToolTaskType[] = [
  "career_positioning_guidance",
  "resume_query",
  "resume_edit",
  "jd_evaluation",
  "offer_evaluation",
  "interview_coaching",
  "profile_update",
  "reference_resume_save",
  "file_export",
  "general_chat",
  "job_search",
  "system_diagnostics",
];

const READ_CONTEXT_TASKS: ToolTaskType[] = [
  "career_positioning_guidance",
  "resume_query",
  "resume_edit",
  "jd_evaluation",
  "offer_evaluation",
  "interview_coaching",
  "profile_update",
  "reference_resume_save",
  "file_export",
  "general_chat",
  "job_search",
];

const ALL_AGENTS = ["general", "evaluate", "offer", "resume", "interview", "profile", "orchestrator"];

function meta(input: Omit<ToolGovernance, "conflictPriority"> & { conflictPriority?: number }): ToolGovernance {
  return { conflictPriority: 50, ...input };
}

export const TOOL_GOVERNANCE_REGISTRY: Record<string, ToolGovernance> = {
  analyze_jd_risks: meta({
    name: "analyze_jd_risks",
    effect: "read",
    allowedTaskTypes: ["jd_evaluation", "general_chat"],
    agentAllowlist: ["evaluate", "general"],
    documentTypes: ["jd"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Return JD risk analysis without persistence.",
    userVisibleNameZh: "JD 风险分析",
  }),
  apply_resume_edit_proposal: meta({
    name: "apply_resume_edit_proposal",
    effect: "high_risk_write",
    allowedTaskTypes: ["resume_edit"],
    agentAllowlist: ["resume"],
    documentTypes: ["resume"],
    requiresUserConfirmation: true,
    requiresReadBack: true,
    successContract: "Apply approved resume draft and verify read-back hash.",
    userVisibleNameZh: "应用简历修改",
  }),
  check_ats_compatibility: meta({
    name: "check_ats_compatibility",
    effect: "read",
    allowedTaskTypes: ["resume_query", "resume_edit", "general_chat"],
    agentAllowlist: ["resume", "general"],
    documentTypes: ["resume"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Analyze ATS compatibility without durable writes.",
    userVisibleNameZh: "ATS 兼容性检查",
  }),
  check_health: meta({
    name: "check_health",
    effect: "read",
    allowedTaskTypes: ["system_diagnostics", "general_chat"],
    agentAllowlist: ALL_AGENTS,
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Return diagnostic status only.",
    userVisibleNameZh: "系统健康检查",
  }),
  check_pipeline_health: meta({
    name: "check_pipeline_health",
    effect: "read",
    allowedTaskTypes: READ_CONTEXT_TASKS,
    agentAllowlist: ALL_AGENTS,
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Read pipeline health only.",
    userVisibleNameZh: "投递健康检查",
  }),
  compare_offers_deep: meta({
    name: "compare_offers_deep",
    effect: "read",
    allowedTaskTypes: ["offer_evaluation", "general_chat"],
    agentAllowlist: ["offer", "general"],
    documentTypes: ["offer"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Compare offers without mutating saved offers.",
    userVisibleNameZh: "Offer 深度对比",
  }),
  create_resume_edit_proposal: meta({
    name: "create_resume_edit_proposal",
    effect: "high_risk_write",
    allowedTaskTypes: ["resume_edit"],
    agentAllowlist: ["resume"],
    documentTypes: ["resume"],
    requiresUserConfirmation: false,
    requiresReadBack: true,
    successContract: "Create a pending resume edit proposal and verify proposal record.",
    userVisibleNameZh: "创建简历修改草稿",
  }),
  decode_black_market_terms: meta({
    name: "decode_black_market_terms",
    effect: "read",
    allowedTaskTypes: ["jd_evaluation", "offer_evaluation", "general_chat"],
    agentAllowlist: ["evaluate", "offer", "general"],
    documentTypes: ["jd", "offer"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Decode risky terms without persistence.",
    userVisibleNameZh: "行业黑话识别",
  }),
  detect_skill_gaps: meta({
    name: "detect_skill_gaps",
    effect: "read",
    allowedTaskTypes: ["resume_query", "resume_edit", "jd_evaluation", "profile_update", "general_chat"],
    agentAllowlist: ["resume", "evaluate", "profile", "general"],
    documentTypes: ["resume", "profile", "jd"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Detect gaps without writing profile signals.",
    userVisibleNameZh: "技能差距分析",
  }),
  discard_resume_edit_proposal: meta({
    name: "discard_resume_edit_proposal",
    effect: "high_risk_write",
    allowedTaskTypes: ["resume_edit"],
    agentAllowlist: ["resume"],
    documentTypes: ["resume"],
    requiresUserConfirmation: true,
    requiresReadBack: true,
    successContract: "Discard proposal and verify status changed.",
    userVisibleNameZh: "放弃简历草稿",
  }),
  download_report_pdf: meta({
    name: "download_report_pdf",
    effect: "export",
    allowedTaskTypes: ["file_export", "jd_evaluation", "offer_evaluation"],
    agentAllowlist: ["evaluate", "offer", "general"],
    documentTypes: ["report", "file"],
    requiresUserConfirmation: false,
    requiresReadBack: true,
    successContract: "Generate PDF and verify file/download artifact.",
    userVisibleNameZh: "下载报告 PDF",
  }),
  evaluate_jd: meta({
    name: "evaluate_jd",
    effect: "read",
    allowedTaskTypes: ["jd_evaluation", "resume_edit", "general_chat"],
    agentAllowlist: ["evaluate", "resume", "general"],
    documentTypes: ["jd"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Legacy JD analysis without persistence.",
    userVisibleNameZh: "JD 初步评估",
  }),
  evaluate_jd_full: meta({
    name: "evaluate_jd_full",
    effect: "high_risk_write",
    allowedTaskTypes: ["jd_evaluation"],
    agentAllowlist: ["evaluate", "general"],
    documentTypes: ["jd", "report"],
    requiresUserConfirmation: false,
    requiresReadBack: true,
    successContract: "Run A-G JD evaluation, persist report/JD, and verify read-back.",
    userVisibleNameZh: "完整 JD 评估",
    conflictPriority: 90,
  }),
  evaluate_offer: meta({
    name: "evaluate_offer",
    effect: "high_risk_write",
    allowedTaskTypes: ["offer_evaluation"],
    agentAllowlist: ["offer", "general"],
    documentTypes: ["offer", "report"],
    requiresUserConfirmation: false,
    requiresReadBack: true,
    successContract: "Evaluate Offer, persist report/offer artifacts, and verify read-back.",
    userVisibleNameZh: "Offer 评估",
    conflictPriority: 90,
  }),
  export_file: meta({
    name: "export_file",
    effect: "export",
    allowedTaskTypes: ["file_export", "jd_evaluation", "offer_evaluation", "resume_edit"],
    agentAllowlist: ["evaluate", "offer", "resume", "general"],
    documentTypes: ["file", "report", "resume"],
    requiresUserConfirmation: false,
    requiresReadBack: true,
    successContract: "Export file and verify existence, size, and hash.",
    userVisibleNameZh: "导出文件",
  }),
  fetch_jd_content: meta({
    name: "fetch_jd_content",
    effect: "read",
    allowedTaskTypes: ["jd_evaluation", "interview_coaching", "general_chat"],
    agentAllowlist: ["evaluate", "interview", "general"],
    documentTypes: ["jd"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Fetch JD content for downstream evaluation.",
    userVisibleNameZh: "抓取 JD 链接",
  }),
  generate_cv: meta({
    name: "generate_cv",
    effect: "guide",
    allowedTaskTypes: ["resume_edit", "general_chat"],
    agentAllowlist: ["resume", "general"],
    documentTypes: ["resume"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Generate CV draft only; durable save requires resume write tools.",
    userVisibleNameZh: "生成简历草稿",
  }),
  generate_interview_questions: meta({
    name: "generate_interview_questions",
    effect: "guide",
    allowedTaskTypes: ["interview_coaching"],
    agentAllowlist: ["interview"],
    documentTypes: ["jd", "resume", "session"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Generate exactly one interview question when session policy requires it.",
    userVisibleNameZh: "生成面试题",
  }),
  generate_offer_hr_question_list: meta({
    name: "generate_offer_hr_question_list",
    effect: "guide",
    allowedTaskTypes: ["offer_evaluation", "general_chat"],
    agentAllowlist: ["offer", "general"],
    documentTypes: ["offer"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Generate HR question list without mutating offer report.",
    userVisibleNameZh: "生成 HR 问题清单",
  }),
  generate_offer_negotiation_strategy: meta({
    name: "generate_offer_negotiation_strategy",
    effect: "guide",
    allowedTaskTypes: ["offer_evaluation", "general_chat"],
    agentAllowlist: ["offer", "general"],
    documentTypes: ["offer"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Generate negotiation strategy without mutating offer report.",
    userVisibleNameZh: "生成谈判策略",
  }),
  get_directions: meta({
    name: "get_directions",
    effect: "read",
    allowedTaskTypes: ["general_chat", "interview_coaching", "job_search"],
    agentAllowlist: ["general", "interview"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Read map directions only.",
    userVisibleNameZh: "路线规划",
  }),
  get_pipeline_status: meta({
    name: "get_pipeline_status",
    effect: "read",
    allowedTaskTypes: READ_CONTEXT_TASKS,
    agentAllowlist: ALL_AGENTS,
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Read pipeline status only.",
    userVisibleNameZh: "投递状态",
  }),
  get_profile: meta({
    name: "get_profile",
    effect: "read",
    allowedTaskTypes: READ_CONTEXT_TASKS,
    agentAllowlist: ALL_AGENTS,
    documentTypes: ["profile"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Read career profile only.",
    userVisibleNameZh: "读取求职画像",
  }),
  get_profile_insights: meta({
    name: "get_profile_insights",
    effect: "read",
    allowedTaskTypes: ["career_positioning_guidance", "profile_update", "resume_edit", "jd_evaluation", "general_chat"],
    agentAllowlist: ["profile", "resume", "evaluate", "general"],
    documentTypes: ["profile"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Read profile insights only.",
    userVisibleNameZh: "画像洞察",
  }),
  get_recent_activity: meta({
    name: "get_recent_activity",
    effect: "read",
    allowedTaskTypes: READ_CONTEXT_TASKS,
    agentAllowlist: ALL_AGENTS,
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Read recent activity only.",
    userVisibleNameZh: "最近活动",
  }),
  get_recent_jd_context: meta({
    name: "get_recent_jd_context",
    effect: "read",
    allowedTaskTypes: ["jd_evaluation", "interview_coaching", "resume_edit", "general_chat"],
    agentAllowlist: ["evaluate", "interview", "resume", "general"],
    documentTypes: ["jd"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Read recent JD context only.",
    userVisibleNameZh: "读取最近 JD",
  }),
  get_recommendations: meta({
    name: "get_recommendations",
    effect: "read",
    allowedTaskTypes: ["career_positioning_guidance", "profile_update", "general_chat"],
    agentAllowlist: ["profile", "general"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Read recommendation data only.",
    userVisibleNameZh: "方向推荐",
  }),
  get_reference_detail: meta({
    name: "get_reference_detail",
    effect: "read",
    allowedTaskTypes: ["resume_query", "resume_edit", "interview_coaching", "reference_resume_save", "general_chat"],
    agentAllowlist: ["resume", "interview", "general"],
    documentTypes: ["resume"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Read reference resume detail only.",
    userVisibleNameZh: "读取参考简历",
  }),
  get_report_detail: meta({
    name: "get_report_detail",
    effect: "read",
    allowedTaskTypes: ["jd_evaluation", "offer_evaluation", "interview_coaching", "file_export", "general_chat"],
    agentAllowlist: ["evaluate", "offer", "interview", "general"],
    documentTypes: ["report", "jd", "offer"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Read saved report detail only.",
    userVisibleNameZh: "读取评估报告",
  }),
  get_weather: meta({
    name: "get_weather",
    effect: "read",
    allowedTaskTypes: ["general_chat", "interview_coaching", "job_search"],
    agentAllowlist: ["general", "interview"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Read weather only.",
    userVisibleNameZh: "天气查询",
  }),
  import_resume: meta({
    name: "import_resume",
    effect: "guide",
    allowedTaskTypes: ["resume_edit", "reference_resume_save", "general_chat"],
    agentAllowlist: ["resume", "general"],
    documentTypes: ["resume"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Parse resume content without saving canonical CV.",
    userVisibleNameZh: "解析简历",
  }),
  mine_profile: meta({
    name: "mine_profile",
    effect: "high_risk_write",
    allowedTaskTypes: ["career_positioning_guidance", "profile_update"],
    agentAllowlist: ["profile"],
    documentTypes: ["profile"],
    requiresUserConfirmation: false,
    requiresReadBack: true,
    successContract: "Guide profile mining; durable completion must pass profile write verification.",
    userVisibleNameZh: "画像挖掘",
  }),
  optimize_resume_section: meta({
    name: "optimize_resume_section",
    effect: "guide",
    allowedTaskTypes: ["resume_edit", "general_chat"],
    agentAllowlist: ["resume", "general"],
    documentTypes: ["resume"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Generate resume optimization draft without durable save.",
    userVisibleNameZh: "优化简历段落",
  }),
  prepare_interview_full: meta({
    name: "prepare_interview_full",
    effect: "write",
    allowedTaskTypes: ["interview_coaching"],
    agentAllowlist: ["interview"],
    documentTypes: ["jd", "resume", "session"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Prepare interview context without rebinding active materials silently.",
    userVisibleNameZh: "准备模拟面试",
  }),
  read_file: meta({
    name: "read_file",
    effect: "read",
    allowedTaskTypes: READ_CONTEXT_TASKS,
    agentAllowlist: ALL_AGENTS,
    documentTypes: ["resume", "jd", "offer", "report", "file"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Read user-accessible local app file only.",
    userVisibleNameZh: "读取文件",
  }),
  read_offer_report: meta({
    name: "read_offer_report",
    effect: "read",
    allowedTaskTypes: ["offer_evaluation", "file_export", "general_chat"],
    agentAllowlist: ["offer", "general"],
    documentTypes: ["offer", "report"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Read saved offer report only.",
    userVisibleNameZh: "读取 Offer 报告",
  }),
  rollback_resume_edit_proposal: meta({
    name: "rollback_resume_edit_proposal",
    effect: "high_risk_write",
    allowedTaskTypes: ["resume_edit"],
    agentAllowlist: ["resume"],
    documentTypes: ["resume"],
    requiresUserConfirmation: true,
    requiresReadBack: true,
    successContract: "Rollback applied proposal and verify restored content.",
    userVisibleNameZh: "回滚简历修改",
  }),
  save_reference_resume: meta({
    name: "save_reference_resume",
    effect: "high_risk_write",
    allowedTaskTypes: ["reference_resume_save"],
    agentAllowlist: ["resume", "general"],
    documentTypes: ["resume", "memory"],
    requiresUserConfirmation: true,
    requiresReadBack: true,
    successContract: "Persist excellent resume with confirmed category and verify read-back.",
    userVisibleNameZh: "保存优秀简历",
  }),
  save_resume_section: meta({
    name: "save_resume_section",
    effect: "high_risk_write",
    allowedTaskTypes: ["resume_edit"],
    agentAllowlist: ["resume"],
    documentTypes: ["resume"],
    requiresUserConfirmation: true,
    requiresReadBack: true,
    successContract: "Route legacy save through verified proposal/read-back.",
    userVisibleNameZh: "保存简历段落",
  }),
  scan_portals: meta({
    name: "scan_portals",
    effect: "high_risk_write",
    allowedTaskTypes: ["job_search", "general_chat"],
    agentAllowlist: ["general"],
    documentTypes: ["jd"],
    requiresUserConfirmation: true,
    requiresReadBack: true,
    successContract: "Record scan/job discovery state only after confirmation.",
    userVisibleNameZh: "开始岗位发现",
  }),
  score_interview_answer: meta({
    name: "score_interview_answer",
    effect: "guide",
    allowedTaskTypes: ["interview_coaching"],
    agentAllowlist: ["interview"],
    documentTypes: ["session", "memory"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Score answer against active session; optional memory writeback must not block score delivery.",
    userVisibleNameZh: "面试回答评分",
  }),
  search_applications: meta({
    name: "search_applications",
    effect: "read",
    allowedTaskTypes: READ_CONTEXT_TASKS,
    agentAllowlist: ALL_AGENTS,
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Read application records only.",
    userVisibleNameZh: "查询投递记录",
  }),
  get_application_context: meta({
    name: "get_application_context",
    effect: "read",
    allowedTaskTypes: READ_CONTEXT_TASKS,
    agentAllowlist: ALL_AGENTS,
    documentTypes: ["jd", "report", "session"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Read application context, events, and next actions only.",
    userVisibleNameZh: "读取投递上下文",
  }),
  track_application: meta({
    name: "track_application",
    effect: "write",
    allowedTaskTypes: ["jd_evaluation", "job_search", "general_chat"],
    agentAllowlist: ["general", "evaluate"],
    documentTypes: ["jd", "report"],
    requiresUserConfirmation: false,
    requiresReadBack: true,
    successContract: "Create or update an application and return read-back application plus event evidence.",
    userVisibleNameZh: "加入投递追踪",
    conflictPriority: 82,
  }),
  update_application_status: meta({
    name: "update_application_status",
    effect: "write",
    allowedTaskTypes: ["jd_evaluation", "job_search", "interview_coaching", "offer_evaluation", "general_chat"],
    agentAllowlist: ["general", "evaluate", "interview", "offer"],
    documentTypes: ["jd", "offer", "report", "session"],
    requiresUserConfirmation: false,
    requiresReadBack: true,
    successContract: "Update one unambiguous application status and return read-back application plus transition event evidence.",
    userVisibleNameZh: "更新投递状态",
    conflictPriority: 86,
  }),
  search_jobs: meta({
    name: "search_jobs",
    effect: "read",
    allowedTaskTypes: ["job_search", "general_chat"],
    agentAllowlist: ["general"],
    documentTypes: ["jd"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Search external jobs without saving discovered records.",
    userVisibleNameZh: "岗位发现",
  }),
  search_place: meta({
    name: "search_place",
    effect: "read",
    allowedTaskTypes: ["general_chat", "interview_coaching", "job_search"],
    agentAllowlist: ["general", "interview"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Read place information only.",
    userVisibleNameZh: "地点搜索",
  }),
  self_positioning: meta({
    name: "self_positioning",
    effect: "guide",
    allowedTaskTypes: ["career_positioning_guidance", "profile_update", "general_chat"],
    agentAllowlist: ["profile", "general"],
    documentTypes: ["profile"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Load positioning guidance and ask the next question; no profile write required.",
    userVisibleNameZh: "自我定位引导",
    conflictPriority: 90,
  }),
  start_interview_session: meta({
    name: "start_interview_session",
    effect: "high_risk_write",
    allowedTaskTypes: ["interview_coaching"],
    agentAllowlist: ["interview"],
    documentTypes: ["session"],
    requiresUserConfirmation: false,
    requiresReadBack: true,
    successContract: "Start/update interview session and verify state.",
    userVisibleNameZh: "开始面试会话",
  }),
  update_report_metadata: meta({
    name: "update_report_metadata",
    effect: "high_risk_write",
    allowedTaskTypes: ["jd_evaluation", "offer_evaluation"],
    agentAllowlist: ["evaluate", "offer"],
    documentTypes: ["report"],
    requiresUserConfirmation: false,
    requiresReadBack: true,
    successContract: "Update report metadata and verify read-back state.",
    userVisibleNameZh: "更新报告信息",
  }),
  web_search: meta({
    name: "web_search",
    effect: "read",
    allowedTaskTypes: ["general_chat", "job_search", "interview_coaching", "jd_evaluation", "offer_evaluation"],
    agentAllowlist: ["general", "interview", "evaluate", "offer"],
    requiresUserConfirmation: false,
    requiresReadBack: false,
    successContract: "Read external web search results only.",
    userVisibleNameZh: "联网搜索",
  }),
};

export const TASK_CONTRACT_POLICY: Record<AgentTaskType, TaskContractPolicy> = {
  career_positioning_guidance: "guidance",
  resume_query: "read_only",
  resume_edit: "high_risk_verified_write",
  jd_evaluation: "high_risk_verified_write",
  offer_evaluation: "high_risk_verified_write",
  interview_coaching: "verified_write",
  profile_update: "high_risk_verified_write",
  reference_resume_save: "high_risk_verified_write",
  file_export: "export_verified",
  job_search: "verified_write",
};

export function getTaskContractPolicy(taskType: AgentTaskType): TaskContractPolicy {
  return TASK_CONTRACT_POLICY[taskType];
}

export function getToolGovernance(toolName: string): ToolGovernance | undefined {
  return TOOL_GOVERNANCE_REGISTRY[toolName];
}

export function isMissingToolGovernanceDefaultDenied(): boolean {
  return (
    process.env.AGENT_TOOL_GOVERNANCE_STRICT === "1" ||
    process.env.NODE_ENV === "test" ||
    process.env.NODE_ENV === "development"
  );
}

export function getLegacyToolGovernanceCompatibility(toolName: string): LegacyToolGovernanceCompatibility {
  const fallbackEffect = riskToEffect(toolName);
  return {
    toolName,
    fallbackEffect,
    defaultDenied: isMissingToolGovernanceDefaultDenied(),
    warning: `工具 ${toolName} 缺少治理元数据，已进入 legacy compatibility 路径。请补齐治理元数据后移除兼容路径。`,
    removalChecklist: LEGACY_TOOL_GOVERNANCE_REMOVAL_CHECKLIST,
  };
}

export function listToolGovernanceForTask(taskType: ToolTaskType): ToolGovernance[] {
  return Object.values(TOOL_GOVERNANCE_REGISTRY)
    .filter((item) => item.allowedTaskTypes.includes(taskType))
    .sort((a, b) => b.conflictPriority - a.conflictPriority || a.name.localeCompare(b.name));
}

export function listToolNamesForTask(taskType: ToolTaskType): string[] {
  return listToolGovernanceForTask(taskType).map((item) => item.name);
}

export function resolveToolEffectForCall(toolName: string, params: Record<string, unknown>): ToolEffect {
  if (toolName === "mine_profile") {
    const action = typeof params.action === "string" ? params.action : "start";
    if (action === "start" || action === "stage_prompt") return "guide";
    if (action === "answer") return "guide";
  }
  return getToolGovernance(toolName)?.effect || riskToEffect(toolName);
}

function riskToEffect(toolName: string): ToolEffect {
  const risk = getActionToolRisk(toolName);
  if (!risk) return "read";
  if (risk.risk === "read-only") return "read";
  if (risk.risk === "low-risk-write") return "write";
  return "high_risk_write";
}

export function isEffectAllowedByPolicy(effect: ToolEffect, policy: TaskContractPolicy): boolean {
  if (effect === "internal") return true;
  if (policy === "guidance") return effect === "read" || effect === "guide";
  if (policy === "read_only") return effect === "read" || effect === "guide";
  if (policy === "verified_write") return effect === "read" || effect === "guide" || effect === "write" || effect === "high_risk_write";
  if (policy === "high_risk_verified_write") return effect !== "admin";
  if (policy === "export_verified") return effect === "read" || effect === "guide" || effect === "export";
  if (policy === "admin_verified") return effect === "read" || effect === "admin";
  return false;
}

export function evaluateToolGovernance(input: {
  toolName: string;
  params?: Record<string, unknown>;
  taskContract?: AgentTaskContract | null;
  agentId?: string;
}): ToolGovernanceDecision {
  const governance = getToolGovernance(input.toolName);
  const effect = resolveToolEffectForCall(input.toolName, input.params || {});
  const contract = input.taskContract || null;
  const policy = contract ? getTaskContractPolicy(contract.taskType) : undefined;

  if (!governance) {
    const compatibility = getLegacyToolGovernanceCompatibility(input.toolName);
    const defaultDenied = compatibility.defaultDenied || Boolean(contract);
    return {
      allowed: !defaultDenied,
      effect,
      contractPolicy: policy,
      reason: defaultDenied ? `工具 ${input.toolName} 缺少治理元数据，已按默认拒绝策略阻止执行。` : compatibility.warning,
    };
  }

  if (
    contract?.routing?.requiresClarification &&
    (effect === "write" || effect === "high_risk_write" || effect === "export" || effect === "admin")
  ) {
    const question = contract.routing.clarificationQuestion || contract.routing.blockedReason || "当前任务需要先确认用户意图。";
    return {
      allowed: false,
      effect,
      contractPolicy: policy,
      governance,
      reason: `当前任务还在澄清/确认阶段，不能调用 ${input.toolName}。请先只问用户一个确认问题：${question}`,
    };
  }

  if (contract && !governance.allowedTaskTypes.includes(contract.taskType)) {
    return {
      allowed: false,
      effect,
      contractPolicy: policy,
      governance,
      reason: `工具 ${input.toolName} 不属于当前任务 ${contract.taskType} 的允许工具。`,
    };
  }

  if (contract && policy && !isEffectAllowedByPolicy(effect, policy)) {
    return {
      allowed: false,
      effect,
      contractPolicy: policy,
      governance,
      reason: `当前任务是 ${policy}，不能调用 ${effect} 工具 ${input.toolName}。`,
    };
  }

  if (input.agentId && governance.agentAllowlist.length > 0 && !governance.agentAllowlist.includes(input.agentId)) {
    return {
      allowed: false,
      effect,
      contractPolicy: policy,
      governance,
      reason: `工具 ${input.toolName} 不允许由 ${input.agentId} agent 调用。`,
    };
  }

  if (
    input.toolName === "save_reference_resume" &&
    governance.requiresUserConfirmation &&
    typeof input.params?.role_category !== "string" &&
    typeof input.params?.roleCategory !== "string"
  ) {
    return {
      allowed: false,
      effect,
      contractPolicy: policy,
      governance,
      reason: "保存优秀简历前必须先确认岗位类别，例如 AI产品经理、AI运营、AI售前。",
    };
  }

  return { allowed: true, effect, contractPolicy: policy, governance };
}

export function enforceToolGovernance(input: {
  toolName: string;
  params?: Record<string, unknown>;
  taskContract?: AgentTaskContract | null;
  agentId?: string;
}): ToolResult | null {
  const decision = evaluateToolGovernance(input);
  if (decision.allowed) return null;
  const message = decision.reason || `工具 ${input.toolName} 被治理策略阻止。`;
  return {
    success: false,
    data: {
      toolName: input.toolName,
      effect: decision.effect,
      contractPolicy: decision.contractPolicy,
      taskType: input.taskContract?.taskType,
      blockedBy: "tool_governance",
    },
    error: message,
    errorCategory: "need_user_input",
    recoverable: false,
    llmSummary: `${message} 请不要改用其它大工具绕过；如果缺少确认，只问用户一个确认问题。`,
    uiPayload: {
      governanceBlocked: true,
      reason: message,
      effect: decision.effect,
      contractPolicy: decision.contractPolicy,
      taskType: input.taskContract?.taskType,
    },
  };
}

export function auditToolGovernance(tools: Array<Pick<ToolDefinition, "name" | "category">>): ToolGovernanceAuditIssue[] {
  const issues: ToolGovernanceAuditIssue[] = [];
  for (const tool of tools) {
    const governance = getToolGovernance(tool.name);
    if (!governance) {
      issues.push({
        toolName: tool.name,
        severity: "error",
        code: "governance.missing",
        message: `Tool ${tool.name} is registered without governance metadata.`,
      });
      continue;
    }
    if (governance.allowedTaskTypes.length === 0) {
      issues.push({
        toolName: tool.name,
        severity: "error",
        code: "governance.no_allowed_tasks",
        message: `Tool ${tool.name} has no allowed task types.`,
      });
    }
    if (governance.agentAllowlist.length === 0) {
      issues.push({
        toolName: tool.name,
        severity: "warning",
        code: "governance.no_agent_allowlist",
        message: `Tool ${tool.name} has no agent allowlist.`,
      });
    }
    if ((governance.effect === "write" || governance.effect === "high_risk_write" || governance.effect === "export" || governance.effect === "admin") && !governance.successContract.trim()) {
      issues.push({
        toolName: tool.name,
        severity: "error",
        code: "governance.no_success_contract",
        message: `Tool ${tool.name} mutates or exports state without a success contract.`,
      });
    }
    if ((governance.effect === "high_risk_write" || governance.effect === "admin") && !governance.requiresReadBack) {
      issues.push({
        toolName: tool.name,
        severity: "error",
        code: "governance.no_readback",
        message: `Tool ${tool.name} is high risk/admin but does not require read-back verification.`,
      });
    }
  }
  return issues;
}

export function auditToolRouteConflicts(records: ToolGovernance[] = Object.values(TOOL_GOVERNANCE_REGISTRY)): ToolRouteConflictIssue[] {
  const buckets = new Map<string, { taskType: ToolTaskType; documentType: ToolDocumentType | "any"; conflictPriority: number; tools: string[] }>();
  for (const record of records) {
    if (record.conflictPriority < 80) continue;
    if (record.effect === "read") continue;
    const documentTypes = record.documentTypes?.length ? record.documentTypes : ["any" as const];
    for (const taskType of record.allowedTaskTypes) {
      for (const documentType of documentTypes) {
        const key = `${taskType}:${documentType}:${record.conflictPriority}`;
        const bucket = buckets.get(key) || { taskType, documentType, conflictPriority: record.conflictPriority, tools: [] };
        bucket.tools.push(record.name);
        buckets.set(key, bucket);
      }
    }
  }
  return Array.from(buckets.values())
    .filter((bucket) => bucket.tools.length > 1)
    .map((bucket) => ({
      ...bucket,
      tools: bucket.tools.sort(),
      message: `Competing high-priority route for ${bucket.taskType}/${bucket.documentType}: ${bucket.tools.sort().join(", ")}`,
    }));
}
