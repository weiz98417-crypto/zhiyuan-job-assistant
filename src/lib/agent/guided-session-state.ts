import type { AgentTaskType } from "@/lib/agent/task-contract";

export type GuidedSessionStatus =
  | "active"
  | "waiting_user"
  | "waiting_tool"
  | "completed"
  | "cancelled"
  | "failed";

export interface GuidedSessionState {
  taskId: string;
  taskType: AgentTaskType;
  agentId: string;
  status: GuidedSessionStatus;
  phase?: string;
  expectedInput?: string;
  allowedNextIntents?: AgentTaskType[];
  allowedTools?: string[];
  startedAt: string;
  lastUpdatedAt: string;
  exitConditions?: string[];
  summary?: string;
  source?: "agent_state" | "interview_state" | "reference_resume_save" | "image_clarification" | "career_positioning";
  documentType?: string;
  imageRoute?: string;
  imageQuality?: string;
  imageConfidence?: number;
  sourceText?: string;
  sourceTextLength?: number;
}

type AgentStateLike = {
  guidedSession?: unknown;
  referenceResumeSave?: unknown;
};

type InterviewStateLike = {
  sessionId?: number;
  status?: "active" | "paused" | "completed" | "abandoned";
  currentQuestionId?: string;
  planSnapshot?: {
    snapshotId: string;
    createdAt: string;
    jdSnapshot?: {
      company?: string;
      role?: string;
    };
  };
};

const ACTIVE_STATUSES = new Set<GuidedSessionStatus>(["active", "waiting_user", "waiting_tool"]);

export const GUIDED_TASK_TYPES = new Set<AgentTaskType>([
  "career_positioning_guidance",
  "interview_coaching",
  "reference_resume_save",
  "jd_evaluation",
  "offer_evaluation",
  "resume_edit",
]);

const TASK_AGENT_ID: Record<AgentTaskType, string> = {
  career_positioning_guidance: "profile",
  resume_query: "resume",
  resume_edit: "resume",
  jd_evaluation: "evaluate",
  offer_evaluation: "offer",
  interview_coaching: "interview",
  profile_update: "profile",
  reference_resume_save: "resume",
  file_export: "general",
  job_search: "general",
};

const TASK_LABEL_ZH: Record<AgentTaskType, string> = {
  career_positioning_guidance: "自我定位",
  resume_query: "简历查询",
  resume_edit: "简历修改",
  jd_evaluation: "JD 评估",
  offer_evaluation: "Offer 评估",
  interview_coaching: "模拟面试",
  profile_update: "画像更新",
  reference_resume_save: "优秀简历沉淀",
  file_export: "文件导出",
  job_search: "岗位发现",
};

export function taskAgentId(taskType: AgentTaskType): string {
  return TASK_AGENT_ID[taskType] || "general";
}

export function taskLabelZh(taskType: string | null | undefined): string {
  if (!taskType) return "未识别任务";
  return TASK_LABEL_ZH[taskType as AgentTaskType] || taskType;
}

export function isGuidedTaskType(taskType: AgentTaskType | null | undefined): taskType is AgentTaskType {
  return Boolean(taskType && GUIDED_TASK_TYPES.has(taskType));
}

export function isGuidedSessionActive(session: GuidedSessionState | null | undefined): session is GuidedSessionState {
  return Boolean(session && ACTIVE_STATUSES.has(session.status));
}

export function readGuidedSession(agentState: AgentStateLike | undefined): GuidedSessionState | null {
  const raw = agentState?.guidedSession;
  if (!raw || typeof raw !== "object") return null;
  const session = raw as Partial<GuidedSessionState>;
  if (!session.taskType || !session.agentId || !session.status) return null;
  return {
    taskId: session.taskId || createGuidedTaskId(session.taskType),
    taskType: session.taskType,
    agentId: session.agentId,
    status: session.status,
    phase: session.phase,
    expectedInput: session.expectedInput,
    allowedNextIntents: session.allowedNextIntents,
    allowedTools: session.allowedTools,
    startedAt: session.startedAt || new Date().toISOString(),
    lastUpdatedAt: session.lastUpdatedAt || new Date().toISOString(),
    exitConditions: session.exitConditions,
    summary: session.summary,
    source: session.source || "agent_state",
    documentType: session.documentType,
    imageRoute: session.imageRoute,
    imageQuality: session.imageQuality,
    imageConfidence: session.imageConfidence,
    sourceText: session.sourceText,
    sourceTextLength: session.sourceTextLength,
  };
}

export function implicitInterviewGuidedSession(
  interviewState: InterviewStateLike | undefined,
): GuidedSessionState | null {
  if (!interviewState?.planSnapshot || interviewState.status === "completed" || interviewState.status === "abandoned") {
    return null;
  }
  const now = new Date().toISOString();
  return {
    taskId: `interview-${interviewState.sessionId || interviewState.planSnapshot.snapshotId}`,
    taskType: "interview_coaching",
    agentId: "interview",
    status: interviewState.status === "paused" ? "waiting_user" : "active",
    phase: interviewState.currentQuestionId ? "answering_question" : "asking_question",
    expectedInput: interviewState.currentQuestionId ? "回答当前面试题、要求追问，或要求下一题" : "等待下一道面试题",
    startedAt: interviewState.planSnapshot.createdAt,
    lastUpdatedAt: now,
    exitConditions: ["用户明确结束/暂停面试", "面试复盘完成"],
    summary: `${interviewState.planSnapshot.jdSnapshot?.company || "未知公司"} ${interviewState.planSnapshot.jdSnapshot?.role || "未知岗位"} 模拟面试`,
    source: "interview_state",
  };
}

export function resolveActiveGuidedSession(input: {
  agentState?: AgentStateLike;
  interviewState?: InterviewStateLike;
}): GuidedSessionState | null {
  const explicit = readGuidedSession(input.agentState);
  if (isGuidedSessionActive(explicit)) return explicit;
  const interview = implicitInterviewGuidedSession(input.interviewState);
  if (isGuidedSessionActive(interview)) return interview;
  const referenceResumeSave = implicitReferenceResumeSaveGuidedSession(input.agentState);
  if (isGuidedSessionActive(referenceResumeSave)) return referenceResumeSave;
  return null;
}

function implicitReferenceResumeSaveGuidedSession(agentState: AgentStateLike | undefined): GuidedSessionState | null {
  const raw = agentState?.referenceResumeSave;
  if (!raw || typeof raw !== "object") return null;
  const pending = (raw as { pending?: unknown }).pending;
  if (!pending || typeof pending !== "object") return null;
  const now = new Date().toISOString();
  return {
    taskId: "reference-resume-save-pending",
    taskType: "reference_resume_save",
    agentId: "resume",
    status: "waiting_user",
    phase: "role_category_confirmation",
    expectedInput: "确认优秀简历要保存到哪个岗位类别，例如 AI产品经理、AI运营、AI售前",
    startedAt: now,
    lastUpdatedAt: now,
    exitConditions: ["用户确认岗位类别并保存成功", "用户取消保存", "用户确认切换任务"],
    summary: "等待确认优秀简历岗位类别",
    source: "reference_resume_save",
  };
}

export function startOrContinueGuidedSession(input: {
  existing?: GuidedSessionState | null;
  taskType: AgentTaskType;
  agentId?: string;
  phase?: string;
  expectedInput?: string;
  allowedTools?: string[];
  summary?: string;
  documentType?: string;
  imageRoute?: string;
  imageQuality?: string;
  imageConfidence?: number;
  sourceText?: string;
  now?: string;
  source?: GuidedSessionState["source"];
}): GuidedSessionState {
  const now = input.now || new Date().toISOString();
  const sameTask = input.existing?.taskType === input.taskType;
  return {
    taskId: sameTask && input.existing ? input.existing.taskId : createGuidedTaskId(input.taskType),
    taskType: input.taskType,
    agentId: input.agentId || input.existing?.agentId || taskAgentId(input.taskType),
    status: "waiting_user",
    phase: input.phase || input.existing?.phase || defaultGuidedPhase(input.taskType),
    expectedInput: input.expectedInput || input.existing?.expectedInput || defaultExpectedInput(input.taskType),
    allowedNextIntents: input.existing?.allowedNextIntents,
    allowedTools: input.allowedTools || input.existing?.allowedTools,
    startedAt: sameTask && input.existing ? input.existing.startedAt : now,
    lastUpdatedAt: now,
    exitConditions: input.existing?.exitConditions || defaultExitConditions(input.taskType),
    summary: input.summary || input.existing?.summary || taskLabelZh(input.taskType),
    source: input.source || input.existing?.source || "agent_state",
    documentType: input.documentType || input.existing?.documentType,
    imageRoute: input.imageRoute || input.existing?.imageRoute,
    imageQuality: input.imageQuality || input.existing?.imageQuality,
    imageConfidence: input.imageConfidence ?? input.existing?.imageConfidence,
    sourceText: input.sourceText || input.existing?.sourceText,
    sourceTextLength: input.sourceText?.length ?? input.existing?.sourceTextLength,
  };
}

export function finishGuidedSession(
  session: GuidedSessionState | null | undefined,
  status: Extract<GuidedSessionStatus, "completed" | "cancelled" | "failed">,
  summary?: string,
): GuidedSessionState | undefined {
  if (!session) return undefined;
  return {
    ...session,
    status,
    lastUpdatedAt: new Date().toISOString(),
    summary: summary || session.summary,
  };
}

export function buildGuidedSessionRuntimeDirective(input: {
  activeTask?: GuidedSessionState | null;
  requiresSwitchConfirmation?: boolean;
  clarificationQuestion?: string;
}): string {
  const activeTask = input.activeTask;
  if (!activeTask) return "";
  const sourceExcerpt = activeTask.sourceText?.trim()
    ? `\n- 已识别材料全文：\n${activeTask.sourceText.slice(0, 50000)}`
    : "";
  const switchLine = input.requiresSwitchConfirmation
    ? `\n- 用户这轮疑似要切换任务。你必须先问一个确认问题，不要调用新任务工具。确认问题：${input.clarificationQuestion || "你要暂停当前任务并切换吗？"}`
    : "";
  return `\n\n## 当前引导任务锁
- 任务：${taskLabelZh(activeTask.taskType)} (${activeTask.taskType})
- 负责 agent：${activeTask.agentId}
- 阶段：${activeTask.phase || "未记录"}
- 期待用户输入：${activeTask.expectedInput || "继续当前引导"}
- 规则：这轮必须继续当前任务，除非用户明确确认取消或切换；短回复、编号回答、“继续/下一题/不知道/那你给”都视为当前任务的输入。${sourceExcerpt}${switchLine}`;
}

export function isExplicitGuidedTaskCancel(content: string): boolean {
  const text = content.trim();
  return /(取消|结束|退出|停止|先不做|不做了|暂停).{0,8}(当前|这个|自我定位|面试|引导|任务)?/.test(text);
}

export function isConfirmedGuidedTaskSwitch(content: string): boolean {
  const text = content.trim();
  return /(确认|确定|是的|对).{0,8}(切换|换到|改做|暂停当前|先做)|(切换|换到|改做).{0,8}(吧|确认|确定|offer|Offer|JD|jd|简历|面试|自我定位)/.test(text);
}

export function inferRequestedTaskFromText(content: string): AgentTaskType | null {
  const text = content.trim();
  if (!text) return null;
  if (
    (/(换一批|再来一批|下一批|岗位发现|职位搜索|找岗位|找职位|搜岗位|搜职位|搜索岗位|搜索职位|扫一批\s*JD|扫描\s*JD)/i.test(text)
      || /(找|搜|搜索|推荐|发现|扫描|扫).{0,16}(岗位|职位|工作|JD|jd|招聘|机会)/i.test(text))
    && !/(评估|分析|看看|看下|评价|打分|匹配).{0,16}(JD|jd|职位|岗位|招聘|这个)/i.test(text)
  ) return "job_search";
  if (/(评估|分析|看看|看下).{0,16}(offer|录用|薪资|合同|待遇)|\boffer\b/i.test(text)) return "offer_evaluation";
  if (/(评估|分析|看看|看下).{0,16}(JD|jd|职位|岗位|招聘|job description)|\bjd\b/i.test(text)) return "jd_evaluation";
  if (/(模拟|练习|准备|继续).{0,10}(面试)|下一题|追问/.test(text)) return "interview_coaching";
  if (/(优秀|参考|标杆).{0,16}(简历|resume|cv).{0,16}(保存|沉淀|加入)|(保存|沉淀|加入).{0,16}(优秀|参考|标杆).{0,16}(简历|resume|cv)/i.test(text)) {
    return "reference_resume_save";
  }
  if (
    /(简历|履历|resume|cv)/i.test(text) &&
    /(我现在的|当前|现在|已有|我的|读取|读一下|打开|展示|看一下|看看|查看|查询|给我看|是什么|内容|写了什么|长什么样|有哪些|在哪)/i.test(text) &&
    !/(优化|修改|改写|润色|重写|生成|创建|保存|写入|应用|用这个|撤销|回滚|导入|同步|替换)/i.test(text)
  ) return "resume_query";
  if (/(优化|修改|改|润色|保存).{0,12}(简历|resume|cv)|(简历|resume|cv).{0,12}(优化|修改|润色|保存)/i.test(text)) return "resume_edit";
  if (/(自我定位|职业方向|方向探索|找方向|迷茫)/.test(text)) return "career_positioning_guidance";
  return null;
}

export function isAmbiguousGuidedFollowUp(content: string): boolean {
  const text = content.trim();
  if (!text) return true;
  if (text.length <= 24 && /^(好|好的|可以|继续|下一题|不知道|我不知道|那你给|你给|嗯|对|不对|是|不是|1|2|3|4|5|[A-Da-d])[。.!！\s]*$/.test(text)) {
    return true;
  }
  return text.length <= 80 && /^(\d+[\.\、])/.test(text);
}

export function inferTaskFromImageClarificationReply(
  content: string,
  activeTask?: GuidedSessionState | null,
): AgentTaskType | null {
  if (!isGuidedSessionActive(activeTask)) return null;
  if (activeTask.source !== "image_clarification" && activeTask.imageRoute !== "clarify_intent") return null;
  const text = content.trim();
  if (!text) return null;
  const wantsEvaluation = /(评估|分析|看看|看下|评价|测评|匹配|投不投|要不要投|算分)/i.test(text);
  const wantsResumeSave = /(保存|导入|写入|同步|存到).{0,12}(简历|画像|优秀简历|参考简历)?/i.test(text);
  if (!wantsEvaluation && !wantsResumeSave) return null;

  if (activeTask.documentType === "jd") return "jd_evaluation";
  if (activeTask.documentType === "offer") return "offer_evaluation";
  if (activeTask.documentType === "resume") {
    return wantsResumeSave ? "resume_edit" : "resume_edit";
  }
  return null;
}

export function getGuidedSwitchDecision(input: {
  content: string;
  activeTask?: GuidedSessionState | null;
  requestedTaskType?: AgentTaskType | null;
}): {
  shouldAskConfirmation: boolean;
  requestedTaskType: AgentTaskType | null;
  clarificationQuestion?: string;
  reason?: string;
} {
  const activeTask = input.activeTask;
  if (!isGuidedSessionActive(activeTask)) {
    return { shouldAskConfirmation: false, requestedTaskType: input.requestedTaskType || null };
  }
  const requestedTaskType = input.requestedTaskType || inferRequestedTaskFromText(input.content);
  if (!requestedTaskType || requestedTaskType === activeTask.taskType || isAmbiguousGuidedFollowUp(input.content)) {
    return { shouldAskConfirmation: false, requestedTaskType };
  }
  if (isConfirmedGuidedTaskSwitch(input.content)) {
    return { shouldAskConfirmation: false, requestedTaskType };
  }
  return {
    shouldAskConfirmation: true,
    requestedTaskType,
    clarificationQuestion: `你现在还在「${taskLabelZh(activeTask.taskType)}」流程中。要暂停它并切换到「${taskLabelZh(requestedTaskType)}」吗？请回复“确认切换到${taskLabelZh(requestedTaskType)}”或“继续${taskLabelZh(activeTask.taskType)}”。`,
    reason: `active guided task ${activeTask.taskType} requires switch confirmation before ${requestedTaskType}`,
  };
}

function createGuidedTaskId(taskType: AgentTaskType): string {
  return `${taskType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultGuidedPhase(taskType: AgentTaskType): string {
  if (taskType === "career_positioning_guidance") return "career_direction_discovery";
  if (taskType === "interview_coaching") return "one_question_loop";
  if (taskType === "reference_resume_save") return "role_category_confirmation";
  if (taskType === "resume_edit") return "resume_optimization";
  if (taskType === "job_search") return "job_discovery_confirmation";
  return "active";
}

function defaultExpectedInput(taskType: AgentTaskType): string {
  if (taskType === "career_positioning_guidance") return "回答当前自我定位问题，或明确取消/切换任务";
  if (taskType === "interview_coaching") return "回答当前面试题、要求示范回答，或进入下一题";
  if (taskType === "reference_resume_save") return "确认优秀简历要保存到哪个岗位类别";
  if (taskType === "resume_edit") return "选择优化方案、确认创建修改提案，或说明要继续调整的地方";
  if (taskType === "job_search") return "确认岗位发现条件，或补充岗位关键词、城市和数量上限";
  return "继续当前任务";
}

function defaultExitConditions(taskType: AgentTaskType): string[] {
  if (taskType === "career_positioning_guidance") return ["用户确认定位卡并写入画像", "用户明确取消", "用户确认切换任务"];
  if (taskType === "interview_coaching") return ["用户要求结束面试", "面试复盘完成", "用户确认切换任务"];
  if (taskType === "reference_resume_save") return ["优秀简历保存并读回校验完成", "用户取消保存", "用户确认切换任务"];
  if (taskType === "resume_edit") return ["修改提案应用并读回校验完成", "用户取消修改", "用户确认切换任务"];
  if (taskType === "job_search") return ["岗位发现条件已确认", "scan 创建并读回校验完成", "用户取消岗位发现"];
  return ["任务完成", "用户取消", "用户确认切换任务"];
}
