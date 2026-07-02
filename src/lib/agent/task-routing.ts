import type { ImageDocumentType, ImageIntakeResult } from "@/lib/agent/image-intake";
import type { AgentTaskType } from "@/lib/agent/task-contract";
import type { AgentMemoryTask } from "@/lib/agent/memory-policy";
import type { TaskContractPolicy } from "@/lib/agent/tool-governance";
import { getTaskContractPolicy, listToolNamesForTask } from "@/lib/agent/tool-governance";
import { routeImageIntake, type ImageIntakeRoutingDecision } from "@/lib/agent/image-intake-router";
import {
  getGuidedSwitchDecision,
  inferTaskFromImageClarificationReply,
  inferRequestedTaskFromText,
  isAmbiguousGuidedFollowUp,
  isExplicitGuidedTaskCancel,
  isGuidedSessionActive,
  taskLabelZh,
  type GuidedSessionState,
} from "@/lib/agent/guided-session-state";

export interface AgentTaskRouteDecision {
  taskType: AgentTaskType | null;
  contractPolicy: TaskContractPolicy | null;
  allowedTools: string[];
  memoryTask: AgentMemoryTask | "general_chat" | null;
  requiresClarification: boolean;
  clarificationQuestion?: string;
  blockedReason?: string;
  imageDecision?: ImageIntakeRoutingDecision;
  auditSummary: string;
}

export function isReferenceResumeSaveIntent(content: string): boolean {
  return /(保存|存|沉淀|加入|放到).{0,20}(优秀|参考|标杆|样例|范例).{0,20}(简历|履历|resume|cv)|(优秀|参考|标杆|样例|范例).{0,20}(简历|履历|resume|cv).{0,20}(保存|存|沉淀|加入|放到)/i.test(content);
}

export function isSelfPositioningIntent(content: string): boolean {
  return /(自我定位|帮我定位|定位一下|找方向|职业方向|方向探索|迷茫|不知道.{0,12}(适合|方向|做什么)|不清楚.{0,12}(适合|方向|做什么))/i.test(content);
}

export function isProfileWriteIntent(content: string): boolean {
  return /(更新|保存|写入|记录|沉淀|提取|同步|刷新|完善|加入|修改|生成|建立|做).{0,16}(求职画像|职业画像|个人画像|画像|profile)|(求职画像|职业画像|个人画像|画像|profile).{0,16}(更新|保存|写入|记录|沉淀|提取|同步|刷新|完善|加入|修改|生成|建立)/i.test(content);
}

export function isResumeEditIntent(content: string): boolean {
  return /(优化|修改|改写|润色|重写|生成|创建|保存|写入|应用|用这个|撤销|回滚|导入|同步|替换).{0,16}(简历|履历|resume|cv)|(简历|履历|resume|cv).{0,16}(优化|修改|改写|润色|重写|生成|创建|保存|写入|应用|用这个|撤销|回滚|导入|同步|替换)/i.test(content);
}

export function isResumeReadOnlyIntent(content: string): boolean {
  const text = content.trim();
  if (!/(简历|履历|resume|cv)/i.test(text)) return false;
  if (isResumeEditIntent(text) || isReferenceResumeSaveIntent(text)) return false;
  return /(我现在的|当前|现在|已有|我的).{0,12}(简历|履历|resume|cv).{0,16}(是什么|内容|写了什么|长什么样|有哪些|在哪|给我看|展示|读取|读一下|打开|查询)?|(读取|读一下|打开|展示|看一下|看看|查看|查询|给我看).{0,16}(我|当前|现在|已有|我的)?(简历|履历|resume|cv)|(简历|履历|resume|cv).{0,16}(是什么|内容|写了什么|长什么样|有哪些|在哪|查询)/i.test(text);
}

function isNonSemanticInput(content: string): boolean {
  const text = content.trim();
  return text.length > 0 && text.length <= 8 && /^[\p{P}\p{S}\s]+$/u.test(text);
}

function nonSemanticClarificationQuestion(content: string, taskLabel: string): string {
  return `我只看到“${content.trim()}”，还不能判断你的具体意图。你是想继续「${taskLabel}」、补充材料，还是做别的操作？请直接说明。`;
}

export function inferAgentTaskType(input: {
  agentId: string;
  content: string;
  imageIntake?: ImageIntakeResult | null;
  preferredDocumentType?: ImageDocumentType;
  activeTask?: GuidedSessionState | null;
}): AgentTaskType | null {
  return routeAgentTask(input).taskType;
}

export function routeAgentTask(input: {
  agentId: string;
  content: string;
  imageIntake?: ImageIntakeResult | null;
  preferredDocumentType?: ImageDocumentType;
  activeTask?: GuidedSessionState | null;
}): AgentTaskRouteDecision {
  const { agentId, content, imageIntake, preferredDocumentType, activeTask } = input;
  const imageDecision = imageIntake ? routeImageIntake(content, imageIntake) : undefined;
  const fromImage = taskTypeFromImageDecision(imageDecision, content);
  const fromImageClarification = inferTaskFromImageClarificationReply(content, activeTask);
  const requestedTaskType = fromImage || fromImageClarification || inferRequestedTaskFromText(content);
  const nonSemanticInput = isNonSemanticInput(content);

  if (isGuidedSessionActive(activeTask)) {
    if (nonSemanticInput && !requestedTaskType) {
      return buildRouteDecision({
        taskType: activeTask.taskType,
        imageDecision,
        requiresClarification: true,
        clarificationQuestion: nonSemanticClarificationQuestion(content, taskLabelZh(activeTask.taskType)),
        blockedReason: `non-semantic input cannot continue active guided task ${activeTask.taskType}`,
        auditSummary: `guided:${activeTask.taskType}:non_semantic_input`,
      });
    }
    if (fromImageClarification && fromImageClarification !== activeTask.taskType) {
      return buildRouteDecision({
        taskType: fromImageClarification,
        imageDecision,
        auditSummary: `guided:image_clarification:confirmed:${activeTask.documentType || fromImageClarification}`,
      });
    }
    const switchDecision = getGuidedSwitchDecision({
      content,
      activeTask,
      requestedTaskType,
    });
    if (switchDecision.shouldAskConfirmation) {
      return buildRouteDecision({
        taskType: activeTask.taskType,
        imageDecision,
        requiresClarification: true,
        clarificationQuestion: switchDecision.clarificationQuestion,
        blockedReason: switchDecision.reason,
        auditSummary: `guided:${activeTask.taskType}:switch_confirmation:${switchDecision.requestedTaskType}`,
      });
    }
    if (switchDecision.requestedTaskType && switchDecision.requestedTaskType !== activeTask.taskType) {
      return buildRouteDecision({
        taskType: switchDecision.requestedTaskType,
        imageDecision,
        auditSummary: `guided:${activeTask.taskType}:confirmed_switch:${switchDecision.requestedTaskType}`,
      });
    }
    if (
      !isExplicitGuidedTaskCancel(content) &&
      (isAmbiguousGuidedFollowUp(content) || !requestedTaskType || requestedTaskType === activeTask.taskType)
    ) {
      return buildRouteDecision({
        taskType: activeTask.taskType,
        imageDecision,
        auditSummary: `guided:${activeTask.taskType}:locked`,
      });
    }
  }

  if (imageDecision?.route === "clarify_intent" || imageDecision?.route === "retry_image") {
    const imageTaskType = imageDecision.documentType === "resume"
      ? (requestedTaskType || "resume_query")
      : taskTypeFromImageDocumentType(imageDecision.documentType) || requestedTaskType;
    return buildRouteDecision({
      taskType: imageTaskType,
      imageDecision,
      requiresClarification: true,
      clarificationQuestion: imageDecision.clarificationQuestion || imageDecision.retryHint,
      blockedReason: imageDecision.reason,
      auditSummary: `image:${imageDecision.route}:${imageDecision.documentType}`,
    });
  }
  if (fromImage) {
    return buildRouteDecision({
      taskType: fromImage,
      imageDecision,
      auditSummary: `image:${imageDecision?.route || "document"}:${fromImage}`,
    });
  }

  const documentType = imageIntake?.documentType || preferredDocumentType;

  if (nonSemanticInput && (agentId === "evaluate" || documentType === "jd")) {
    return buildRouteDecision({
      taskType: "jd_evaluation",
      requiresClarification: true,
      clarificationQuestion: nonSemanticClarificationQuestion(content, "JD 评估"),
      blockedReason: "non-semantic input cannot start JD evaluation",
      auditSummary: "agent:evaluate:non_semantic_input",
    });
  }
  if (nonSemanticInput && (agentId === "offer" || documentType === "offer")) {
    return buildRouteDecision({
      taskType: "offer_evaluation",
      requiresClarification: true,
      clarificationQuestion: nonSemanticClarificationQuestion(content, "Offer 评估"),
      blockedReason: "non-semantic input cannot start Offer evaluation",
      auditSummary: "agent:offer:non_semantic_input",
    });
  }

  if (agentId === "evaluate" || documentType === "jd") return buildRouteDecision({ taskType: "jd_evaluation", auditSummary: "agent:evaluate" });
  if (agentId === "offer" || documentType === "offer") return buildRouteDecision({ taskType: "offer_evaluation", auditSummary: "agent:offer" });
  if (agentId === "interview") return buildRouteDecision({ taskType: "interview_coaching", auditSummary: "agent:interview" });
  if (isReferenceResumeSaveIntent(content)) return buildRouteDecision({ taskType: "reference_resume_save", auditSummary: "intent:reference_resume_save" });
  if (agentId === "profile") {
    if (isSelfPositioningIntent(content)) return buildRouteDecision({ taskType: "career_positioning_guidance", auditSummary: "intent:self_positioning" });
    return buildRouteDecision({
      taskType: isProfileWriteIntent(content) ? "profile_update" : null,
      auditSummary: isProfileWriteIntent(content) ? "intent:profile_write" : "agent:profile:chat",
    });
  }
  if (agentId === "resume" || documentType === "resume") {
    const taskType = /\b(pdf|download|export|markdown|md|导出|下载)\b/i.test(content)
      ? "file_export"
      : isResumeEditIntent(content)
        ? "resume_edit"
        : "resume_query";
    return buildRouteDecision({
      taskType,
      auditSummary: taskType === "resume_edit" ? "agent:resume:edit" : "agent:resume:read_only",
    });
  }
  return buildRouteDecision({ taskType: null, auditSummary: "general:no_contract" });
}

function taskTypeFromImageDecision(
  imageDecision: ImageIntakeRoutingDecision | undefined,
  content: string,
): AgentTaskType | null {
  if (!imageDecision) return null;
  if (imageDecision.route === "evaluate_jd") return "jd_evaluation";
  if (imageDecision.route === "evaluate_offer") return "offer_evaluation";
  if (imageDecision.route === "resume_preview") {
    return isReferenceResumeSaveIntent(content)
      ? "reference_resume_save"
      : isResumeEditIntent(content)
        ? "resume_edit"
        : "resume_query";
  }
  return null;
}

function taskTypeFromImageDocumentType(documentType: ImageDocumentType | undefined): AgentTaskType | null {
  if (documentType === "jd") return "jd_evaluation";
  if (documentType === "offer") return "offer_evaluation";
  if (documentType === "resume") return "resume_query";
  return null;
}

function buildRouteDecision(input: {
  taskType: AgentTaskType | null;
  imageDecision?: ImageIntakeRoutingDecision;
  requiresClarification?: boolean;
  clarificationQuestion?: string;
  blockedReason?: string;
  auditSummary: string;
}): AgentTaskRouteDecision {
  const contractPolicy = input.taskType ? getTaskContractPolicy(input.taskType) : null;
  return {
    taskType: input.taskType,
    contractPolicy,
    allowedTools: input.taskType ? listToolNamesForTask(input.taskType) : [],
    memoryTask: mapAgentTaskToMemoryTask(input.taskType),
    requiresClarification: input.requiresClarification || false,
    clarificationQuestion: input.clarificationQuestion,
    blockedReason: input.blockedReason,
    imageDecision: input.imageDecision,
    auditSummary: input.auditSummary,
  };
}

export function mapAgentTaskToMemoryTask(taskType: AgentTaskType | null): AgentMemoryTask | "general_chat" | null {
  if (!taskType) return null;
  const map: Record<AgentTaskType, AgentMemoryTask | "general_chat"> = {
    career_positioning_guidance: "profile_growth",
    resume_query: "general_chat",
    resume_edit: "resume_optimization",
    jd_evaluation: "jd_evaluation",
    offer_evaluation: "offer_evaluation",
    interview_coaching: "interview_coaching",
    profile_update: "profile_growth",
    reference_resume_save: "reference_resume_save",
    file_export: "general_chat",
  };
  return map[taskType];
}
