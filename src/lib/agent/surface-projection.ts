import type { AgentMessage } from "@/types";

export type SurfaceAudience =
  | "model_context"
  | "user_activity"
  | "user_transcript"
  | "approval"
  | "hidden_node"
  | "admin_evidence"
  | "eval_evidence";

export type UserSafeToolViewKind = "card" | "status" | "silent";

export interface UserSafeToolView {
  kind: UserSafeToolViewKind;
  toolName: string;
  status: "success" | "failed" | "running";
  label: string;
  summary: string;
  uiPayload?: Record<string, unknown>;
  artifact?: {
    id?: string | number;
    version?: string | number;
    hash?: string;
    stale?: boolean;
  };
}

export interface AgentSurfaceEvent {
  audience: SurfaceAudience;
  itemId: string;
  cursor?: number;
  lifecycle: "started" | "delta" | "completed" | "interrupted" | "failed" | "hidden";
  content?: string;
  summary?: string;
  toolView?: UserSafeToolView;
}

const TOOL_LABELS: Record<string, string> = {
  read_file: "已读取文件",
  get_reference_detail: "已读取参考简历",
  search_applications: "已查询投递记录",
  get_recent_activity: "已获取活动",
  get_pipeline_status: "已获取 Pipeline 状态",
  get_recommendations: "已获取推荐",
  check_pipeline_health: "已完成健康检查",
  get_profile_insights: "已完成画像分析",
  detect_skill_gaps: "已完成技能分析",
  check_ats_compatibility: "已完成 ATS 检查",
  decode_black_market_terms: "已完成黑话解码",
  analyze_jd_risks: "已完成风险扫描",
  web_search: "已完成搜索",
  get_profile: "已读取求职画像",
  evaluate_jd: "已准备 JD 评估",
  evaluate_jd_full: "JD 评估已完成",
  recognize_document_image: "已完成图片识别",
  export_file: "已生成导出文件",
  download_report_pdf: "已生成报告文件",
};

const SAFE_PAYLOAD_TYPES = new Set([
  "application_context",
  "application_status_updated",
  "application_tracked",
  "file_content",
  "file_download",
  "jd_report",
  "image_intake",
  "interview_questions",
  "interview_session",
  "interview_score",
  "job_discovery_batch",
  "job_discovery_confirmation",
  "job_discovery_detail",
  "job_discovery_error",
  "job_discovery_run",
  "offer_comparison",
  "offer_evaluation",
  "offer_evaluation_error",
  "offer_hr_question_list",
  "offer_negotiation_strategy",
  "offer_report",
  "profile_view_card",
  "profile_update",
  "recent_jd_context",
  "reference_resume",
  "report_blocks",
  "report_metadata_updated",
  "resume_document",
  "resume_draft",
  "resume_edit_proposal",
  "resume_edit_proposal_applied",
  "resume_edit_proposal_discarded",
  "resume_edit_proposal_rolled_back",
  "run_gate",
  "role_preference",
  "export_artifact",
  "download",
]);

const SAFE_PAYLOAD_FIELDS: Record<string, readonly string[]> = {
  application_context: ["data", "application", "candidates", "nextActions", "event", "readBackVerified"],
  application_status_updated: ["data", "application", "candidates", "nextActions", "event", "readBackVerified"],
  application_tracked: ["data", "application", "candidates", "nextActions", "event", "readBackVerified"],
  file_content: ["path", "content", "truncated", "source", "section", "versionId", "activeVersion", "totalChars", "status"],
  file_download: ["downloadUrl", "filename", "size", "sha256", "readBackVerified", "artifactId", "version", "hash"],
  jd_report: ["reportId", "reportNum", "company", "role", "overallScore", "archetype", "date", "readBackVerified"],
  image_intake: ["status", "route", "reason", "confidence", "clarificationQuestion", "retryHint", "imagesCount", "perImage"],
  interview_questions: ["questions", "company", "role", "mode", "sessionId", "readBackVerified"],
  interview_session: ["sessionId", "company", "role", "mode", "status", "currentQuestion", "answered", "readBackVerified"],
  interview_score: ["sessionId", "score", "feedback", "dimensions", "readBackVerified"],
  job_discovery_batch: ["jobs", "offset", "nextOffset", "source", "hasMore"],
  job_discovery_confirmation: ["criteria", "profileDerived", "primaryAction"],
  job_discovery_detail: ["jobs", "offset", "nextOffset", "source", "hasMore"],
  job_discovery_error: ["error", "criteria", "retryHint"],
  job_discovery_run: ["scanId", "status", "companiesDone", "companiesTotal", "jobsFound", "jobsNew", "criteria", "recoveredExistingScan", "readBackVerified", "readBackEvidence"],
  offer_comparison: ["offers", "winner", "dimensions", "summary", "readBackVerified"],
  offer_evaluation: ["reportId", "offerId", "company", "role", "overallScore", "verdict", "readBackVerified", "readBackError", "redFlags", "missingInfo", "memoryContext"],
  offer_evaluation_error: ["phase", "offerId", "reportId", "readBackVerified", "readBackError", "missingInfo", "clarificationQuestion"],
  offer_hr_question_list: ["reportId", "questions", "readBackVerified"],
  offer_negotiation_strategy: ["reportId", "strategy", "readBackVerified"],
  offer_report: ["reportId", "offerId", "company", "role", "overallScore", "verdict", "readBackVerified", "readBackError", "redFlags", "missingInfo", "memoryContext"],
  profile_view_card: ["title", "cvSections", "goals", "refResumes", "dnaSummary", "memoryContext"],
  profile_update: ["profileId", "roleCategory", "sections", "name", "readBackVerified", "version", "hash"],
  recent_jd_context: ["jdId", "company", "role", "sourceUrl", "version", "hash", "readBackVerified"],
  reference_resume: ["id", "name", "tags", "sections", "version", "hash", "readBackVerified"],
  report_blocks: ["company", "role", "overallScore", "archetype", "date", "reportNum", "blocks", "labels", "readBackVerified"],
  report_metadata_updated: ["reportId", "reportNum", "company", "role", "readBackVerified", "version", "hash"],
  resume_document: ["artifactId", "documentId", "version", "versionId", "activeVersion", "hash", "contentHash", "section", "sections", "totalChars", "status", "readBackVerified"],
  resume_draft: ["artifactId", "variantId", "version", "hash", "section", "sectionId", "title", "summary", "status", "readBackVerified"],
  resume_edit_proposal: ["id", "artifactId", "variantId", "section", "sectionId", "sectionTitle", "originalContent", "proposedContent", "reason", "riskFlags", "baseVersion", "baseHash", "proposedHash", "status", "stale", "readBackVerified", "readBackError", "version", "hash"],
  resume_edit_proposal_applied: ["id", "artifactId", "section", "sectionId", "sectionTitle", "originalContent", "proposedContent", "reason", "riskFlags", "baseVersion", "baseHash", "proposedHash", "status", "stale", "readBackVerified", "readBackError", "version", "hash"],
  resume_edit_proposal_discarded: ["id", "artifactId", "section", "sectionId", "sectionTitle", "reason", "status", "stale", "readBackVerified", "readBackError", "version", "hash"],
  resume_edit_proposal_rolled_back: ["id", "artifactId", "section", "sectionId", "sectionTitle", "originalContent", "proposedContent", "reason", "status", "stale", "readBackVerified", "readBackError", "version", "hash"],
  run_gate: ["gateId", "runId", "toolName", "risk", "scopeHash", "status", "request", "resolvedAt"],
  role_preference: ["role", "reason", "evidence", "confidence", "status", "readBackVerified"],
  export_artifact: ["artifactId", "downloadUrl", "filename", "size", "sha256", "readBackVerified", "version", "hash"],
  download: ["artifactId", "downloadUrl", "filename", "size", "sha256", "readBackVerified", "version", "hash"],
};

const SAFE_NESTED_FIELDS = new Set([
  "id", "type", "name", "title", "label", "value", "status", "source", "sourceName", "sourceUrl", "url", "path",
  "content", "summary", "description", "reason", "message", "error", "retryHint", "clarificationQuestion", "question", "feedback",
  "company", "role", "location", "mode", "category", "kind", "context", "storyHint", "weaknessNote", "documentType",
  "version", "versionId", "activeVersion", "baseVersion", "hash", "contentHash", "baseHash", "proposedHash", "stale",
  "readBackVerified", "readBackError", "createdAt", "updatedAt", "date", "phase", "route", "confidence", "score", "overallScore", "verdict", "archetype",
  "section", "sectionId", "sectionTitle", "sections", "originalContent", "proposedContent", "riskFlags", "warnings", "tags",
  "artifactId", "variantId", "documentId", "reportId", "reportNum", "offerId", "jdId", "scanId", "sessionId",
  "filename", "downloadUrl", "size", "sha256", "truncated", "totalChars", "offset", "nextOffset", "hasMore",
  "companies", "companiesDone", "companiesTotal", "jobsFound", "jobsNew", "maxResults", "titlePositive", "titleNegative",
  "jobs", "offers", "questions", "dimensions", "redFlags", "missingInfo", "strategy", "winner", "blocks", "labels",
  "criteria", "profileDerived", "primaryAction", "actions", "nextActions", "event", "application", "candidates", "data",
  "cvSections", "goals", "refResumes", "dnaSummary", "memoryContext", "structuredCount", "semanticCount", "recoveredExistingScan",
  "readBackEvidence", "index", "imagesCount", "perImage", "extractedTextLength", "returned", "open", "matchConfidence", "verificationStatus",
  "request", "userVisibleName", "args", "proposalId", "gateId", "runId", "toolName", "risk", "scopeHash", "decision", "resolvedAt",
]);

const HIDDEN_KEY = /^(raw|data|result|params?|arguments?|prompt|system|stack|trace|llm|internal|toolContext|sourceText)$/i;
const HIDDEN_KEY_FRAGMENT = /(prompt|internal|secret|credential|authorization|token|password|raw|stack|trace)/i;
const SENSITIVE_TEXT = /(chain[- ]?of[- ]?thought|思维链|system prompt|系统提示词|api[_ -]?key|password|authorization|secret|开始阶段|自我定位引导完成|职业方向探索)/i;
const SENSITIVE_VALUE = /(?:bearer\s+[a-z0-9._-]{12,}|sk-[a-z0-9_-]{12,}|postgres(?:ql)?:\/\/[^\s]+|-----begin [^-]+ key-----|[a-z0-9+/]{180,}={0,2})/i;

export function projectToolResultForUser(input: {
  toolName?: string;
  success?: boolean;
  uiPayload?: Record<string, unknown>;
}): UserSafeToolView {
  const toolName = safeToolName(input.toolName);
  const success = input.success !== false;
  const label = TOOL_LABELS[toolName] || (success ? "已完成处理" : "处理未完成");
  const status = success ? "success" : "failed";
  const payloadType = typeof input.uiPayload?.type === "string" ? input.uiPayload.type : "";

  if (input.uiPayload && SAFE_PAYLOAD_TYPES.has(payloadType)) {
    const uiPayload = sanitizePayload(input.uiPayload);
    if (uiPayload) {
      return {
        kind: "card",
        toolName,
        status,
        label,
        summary: success ? label : `${label}，请稍后重试`,
        uiPayload,
        artifact: extractArtifactReference(uiPayload),
      };
    }
  }

  if (TOOL_LABELS[toolName]) {
    return {
      kind: "status",
      toolName,
      status,
      label: success ? label : "工具调用未完成",
      summary: success ? label : "这一步未完成，原始工具结果已隐藏。",
    };
  }

  return {
    kind: "silent",
    toolName,
    status,
    label,
    summary: "",
  };
}

export function sanitizeSafeReasoningSummary(summary: unknown, fallback = "正在处理"): string {
  if (typeof summary !== "string") return fallback;
  const normalized = summary.replace(/\s+/g, " ").trim();
  if (
    !normalized
    || SENSITIVE_TEXT.test(normalized)
    || SENSITIVE_VALUE.test(normalized)
    || /(?:bearer\s+[a-z0-9._-]+|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|1[3-9]\d{9})/i.test(normalized)
    || !/(正在|已|等待|需要|检查|分析|读取|搜索|生成|核对|处理|理解|准备|比较|验证|恢复|压缩|识别|评估|保存|导出|创建|更新|确认|processing|analyzing|checking|reading|searching|generating|verifying|waiting|recovering|updating|exporting|creating|understanding|preparing)/i.test(normalized)
  ) return fallback;
  return normalized.slice(0, 160);
}

export function adaptLegacyAgentMessage(message: AgentMessage): AgentMessage | null {
  if (message.role !== "tool") return message;
  const raw = isRecord(message.toolResult) ? message.toolResult : {};
  const safeView = projectToolResultForUser({
    toolName: message.toolName,
    success: typeof raw.success === "boolean" ? raw.success : raw.status !== "failed",
    uiPayload: isRecord(raw.uiPayload) ? raw.uiPayload : undefined,
  });
  if (safeView.kind === "silent") return null;
  return {
    ...message,
    content: safeView.summary,
    toolResult: safeView,
  };
}

export function projectAgentMessages(messages: AgentMessage[]): AgentMessage[] {
  const projected = messages.flatMap((message) => {
    if (message.role === "assistant" && !message.content.trim()) return [];
    const adapted = adaptLegacyAgentMessage(message);
    return adapted ? [adapted] : [];
  });
  const latestProposalIndex = new Map<string, number>();
  projected.forEach((message, index) => {
    const key = resumeProposalProjectionKey(message);
    if (key) latestProposalIndex.set(key, index);
  });
  return projected.filter((message, index) => {
    const key = resumeProposalProjectionKey(message);
    return !key || latestProposalIndex.get(key) === index;
  });
}

function resumeProposalProjectionKey(message: AgentMessage): string | null {
  if (message.role !== "tool" || !isRecord(message.toolResult)) return null;
  const directPayload = isRecord(message.toolResult.uiPayload) ? message.toolResult.uiPayload : null;
  const safeView = isRecord(message.toolResult.safeView) ? message.toolResult.safeView : null;
  const payload = directPayload || (safeView && isRecord(safeView.uiPayload) ? safeView.uiPayload : null);
  const type = typeof payload?.type === "string" ? payload.type : "";
  if (!type.startsWith("resume_edit_proposal")) return null;
  const id = typeof payload?.id === "string" || typeof payload?.id === "number" ? String(payload.id) : "";
  return id ? `resume_edit_proposal:${id}` : null;
}

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> | null {
  const type = typeof payload.type === "string" ? payload.type : "";
  const allowedFields = SAFE_PAYLOAD_FIELDS[type];
  if (!allowedFields) return null;
  const output: Record<string, unknown> = { type };
  for (const key of allowedFields) {
    const safeValue = sanitizeValue(payload[key], key, 0, true);
    if (safeValue !== undefined) output[key] = safeValue;
  }
  return output;
}

function sanitizeValue(value: unknown, key = "", depth = 0, topLevel = false): unknown {
  if (depth > 4 || HIDDEN_KEY.test(key) || HIDDEN_KEY_FRAGMENT.test(key)) return undefined;
  if (!topLevel && !SAFE_NESTED_FIELDS.has(key)) return undefined;
  if (typeof value === "string") {
    if (SENSITIVE_TEXT.test(value) || SENSITIVE_VALUE.test(value)) return "已隐藏内部内容";
    return value.slice(0, 4000);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeArrayItem(item, depth + 1)).filter((item) => item !== undefined);
  }
  if (isRecord(value)) {
    const nested: Record<string, unknown> = {};
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      const safeValue = sanitizeValue(nestedValue, nestedKey, depth + 1);
      if (safeValue !== undefined) nested[nestedKey] = safeValue;
    }
    return nested;
  }
  return undefined;
}

function sanitizeArrayItem(value: unknown, depth: number): unknown {
  if (typeof value === "string") return SENSITIVE_TEXT.test(value) || SENSITIVE_VALUE.test(value) ? "已隐藏内部内容" : value.slice(0, 4000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeArrayItem(item, depth + 1)).filter((item) => item !== undefined);
  if (!isRecord(value) || depth > 4) return undefined;
  const nested: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const safeValue = sanitizeValue(nestedValue, key, depth + 1);
    if (safeValue !== undefined) nested[key] = safeValue;
  }
  return nested;
}

export function projectSessionRowForUser<T extends Record<string, unknown>>(row: T): T {
  const next: Record<string, unknown> = { ...row };
  if ("messages_json" in next) {
    const messages = parseAgentMessages(next.messages_json);
    next.messages_json = JSON.stringify(projectAgentMessages(messages));
  }
  if ("messages" in next) {
    const messages = parseAgentMessages(next.messages);
    next.messages = projectAgentMessages(messages);
  }
  return next as T;
}

export function projectSessionMutationForPersistence<T extends Record<string, unknown>>(input: T): T {
  if (!("messages" in input)) return { ...input };
  return {
    ...input,
    messages: projectAgentMessages(parseAgentMessages(input.messages)),
  };
}

function parseAgentMessages(value: unknown): AgentMessage[] {
  const parsed = typeof value === "string"
    ? (() => {
        try { return JSON.parse(value); } catch { return []; }
      })()
    : value;
  return Array.isArray(parsed) ? parsed.filter(isAgentMessage) : [];
}

function isAgentMessage(value: unknown): value is AgentMessage {
  return isRecord(value)
    && (value.role === "user" || value.role === "assistant" || value.role === "tool")
    && typeof value.content === "string"
    && typeof value.timestamp === "string";
}

function extractArtifactReference(payload: Record<string, unknown>): UserSafeToolView["artifact"] {
  const id = payload.artifactId ?? payload.reportId ?? payload.reportNum ?? payload.id;
  const version = payload.version ?? payload.versionId ?? payload.activeVersion;
  const hash = typeof payload.hash === "string" ? payload.hash : typeof payload.contentHash === "string" ? payload.contentHash : undefined;
  const stale = typeof payload.stale === "boolean" ? payload.stale : undefined;
  if (id === undefined && version === undefined && !hash && stale === undefined) return undefined;
  return { id: typeof id === "string" || typeof id === "number" ? id : undefined, version: typeof version === "string" || typeof version === "number" ? version : undefined, hash, stale };
}

function safeToolName(value: unknown): string {
  return typeof value === "string" ? value.replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 80) : "tool";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
