import { stableContentHash, type VerifiedActionResult } from "@/lib/agent/verified-action";

export type AgentTaskType =
  | "resume_edit"
  | "jd_evaluation"
  | "offer_evaluation"
  | "interview_coaching"
  | "profile_update"
  | "reference_resume_save"
  | "file_export";

export interface AgentTaskContract {
  taskType: AgentTaskType;
  target: string;
  requiresUserApproval: boolean;
  baseVersion?: string;
  baseHash?: string;
  successCriteria: string[];
  validators: string[];
  createdAt: string;
}

export interface AgentTaskBaseSnapshot {
  baseVersion?: string;
  baseHash?: string;
}

export interface ToolCriteriaSignals {
  toolName: string;
  toolSuccess: boolean;
  data?: unknown;
  uiPayload?: Record<string, unknown>;
  verifiedAction?: VerifiedActionResult | null;
  readBackVerified?: boolean;
}

export interface TaskContractGateResult {
  canClaimSuccess: boolean;
  completedCriteria: string[];
  unmetCriteria: string[];
  safeMessage?: string;
}

const DEFAULT_SUCCESS_CRITERIA: Record<AgentTaskType, string[]> = {
  resume_edit: [
    "draft generated",
    "user approved draft",
    "target section read-back hash matches applied content",
    "content validator passes",
    "version snapshot created",
  ],
  jd_evaluation: [
    "source content extracted or fetched",
    "A-G evaluation generated",
    "report persisted",
    "saved report read-back verification passes",
  ],
  offer_evaluation: [
    "offer content extracted or fetched",
    "offer modules generated",
    "offer/report persisted",
    "saved offer/report read-back verification passes",
  ],
  interview_coaching: [
    "JD/resume context bound",
    "one question generated",
    "session state updated without losing context",
  ],
  profile_update: [
    "candidate signals extracted",
    "signal validator passes",
    "profile or memory write read-back verification passes",
  ],
  reference_resume_save: [
    "source resume content present",
    "role category confirmed",
    "reference resume persisted",
    "reference resume read-back verification passes",
  ],
  file_export: [
    "export generated",
    "file exists",
    "file size is non-zero",
    "file hash verified",
  ],
};

const DEFAULT_VALIDATORS: Record<AgentTaskType, string[]> = {
  resume_edit: ["base_hash", "document_field", "read_back_match", "no_placeholder_content"],
  jd_evaluation: ["source_content_present", "report_blocks_present", "read_back_match"],
  offer_evaluation: ["source_content_present", "offer_modules_present", "read_back_match"],
  interview_coaching: ["context_binding", "single_question"],
  profile_update: ["signal_quality", "source_evidence", "read_back_match"],
  reference_resume_save: ["source_resume_present", "role_category", "read_back_match"],
  file_export: ["file_exists", "file_size", "file_hash"],
};

export function createAgentTaskContract(input: {
  taskType: AgentTaskType;
  target: string;
  requiresUserApproval?: boolean;
  baseVersion?: string;
  baseHash?: string;
  successCriteria?: string[];
  validators?: string[];
}): AgentTaskContract {
  return {
    taskType: input.taskType,
    target: input.target,
    requiresUserApproval: input.requiresUserApproval ?? input.taskType === "resume_edit",
    baseVersion: input.baseVersion,
    baseHash: input.baseHash,
    successCriteria: input.successCriteria || DEFAULT_SUCCESS_CRITERIA[input.taskType],
    validators: input.validators || DEFAULT_VALIDATORS[input.taskType],
    createdAt: new Date().toISOString(),
  };
}

export function createResumeBaseSnapshot(cvData: unknown): AgentTaskBaseSnapshot {
  if (!cvData || typeof cvData !== "object") return {};
  const record = cvData as Record<string, unknown>;
  const activeVersion = typeof record.activeVersion === "string" ? record.activeVersion : undefined;
  const versions = record.versions && typeof record.versions === "object"
    ? record.versions as Record<string, unknown>
    : {};
  const activeData = activeVersion ? versions[activeVersion] : undefined;
  const hashSource = activeData || cvData;
  return {
    baseVersion: activeVersion,
    baseHash: stableContentHash(hashSource),
  };
}

export function unmetSuccessCriteria(
  contract: AgentTaskContract,
  completedCriteria: string[],
): string[] {
  const completed = new Set(completedCriteria);
  return contract.successCriteria.filter((criterion) => !completed.has(criterion));
}

export function canClaimTaskSuccess(
  contract: AgentTaskContract,
  completedCriteria: string[],
): boolean {
  return unmetSuccessCriteria(contract, completedCriteria).length === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasNonEmptyString(value: unknown, minLength = 1): boolean {
  return typeof value === "string" && value.trim().length >= minLength;
}

function hasReportBlocks(data: unknown): boolean {
  if (!isRecord(data) || !isRecord(data.blocks)) return false;
  const blocks = data.blocks as Record<string, unknown>;
  return ["a", "b", "c", "d", "e", "f", "g"].every((key) => {
    const block = blocks[key] ?? blocks[key.toUpperCase()];
    if (typeof block === "string") return block.trim().length > 0;
    if (!isRecord(block)) return false;
    return hasNonEmptyString(block.content) || typeof block.score === "number";
  });
}

function hasOfferModules(data: unknown, uiPayload?: Record<string, unknown>): boolean {
  const payloadModules = Array.isArray(uiPayload?.modules) && uiPayload.modules.length > 0;
  if (payloadModules) return true;
  if (!isRecord(data)) return false;
  return Array.isArray(data.modules) && data.modules.length > 0;
}

function hasVerifiedReadBack(verifiedAction?: VerifiedActionResult | null): boolean {
  return Boolean(verifiedAction?.success && verifiedAction.readBack?.ok);
}

function validatorsPassed(verifiedAction?: VerifiedActionResult | null): boolean {
  if (!verifiedAction?.success) return false;
  const validators = verifiedAction.evidence?.validators || [];
  return validators.length === 0 || validators.every((check) => check.ok);
}

export function inferCompletedCriteriaFromToolResult(
  contract: AgentTaskContract,
  signals: ToolCriteriaSignals,
): string[] {
  if (!signals.toolSuccess) return [];
  const completed = new Set<string>();
  const data = isRecord(signals.data) ? signals.data : {};
  const uiPayload = signals.uiPayload || {};
  const verifiedReadBack = hasVerifiedReadBack(signals.verifiedAction);

  if (contract.taskType === "resume_edit") {
    if (signals.toolName === "optimize_resume_section" || signals.toolName === "create_resume_edit_proposal" || signals.toolName === "apply_resume_edit_proposal" || signals.toolName === "save_resume_section") {
      completed.add("draft generated");
    }
    if (signals.toolName === "apply_resume_edit_proposal") {
      completed.add("user approved draft");
    }
    if (verifiedReadBack && signals.toolName === "apply_resume_edit_proposal") {
      completed.add("target section read-back hash matches applied content");
    }
    if (validatorsPassed(signals.verifiedAction)) {
      completed.add("content validator passes");
    }
    if (
      signals.verifiedAction?.evidence?.versionId !== undefined ||
      signals.toolName === "create_resume_edit_proposal" ||
      signals.toolName === "apply_resume_edit_proposal" ||
      (verifiedReadBack && signals.verifiedAction?.evidence?.readBackHash)
    ) {
      completed.add("version snapshot created");
    }
  }

  if (contract.taskType === "jd_evaluation" && signals.toolName === "evaluate_jd_full") {
    if (hasNonEmptyString(data.jdText, 30) || hasReportBlocks(data)) {
      completed.add("source content extracted or fetched");
    }
    if (hasReportBlocks(data)) {
      completed.add("A-G evaluation generated");
    }
    if (typeof data.reportNum === "number" && data.reportNum > 0) {
      completed.add("report persisted");
    }
    if (signals.readBackVerified === true || data.reportReadBackVerified === true) {
      completed.add("saved report read-back verification passes");
    }
  }

  if (contract.taskType === "offer_evaluation" && signals.toolName === "evaluate_offer") {
    completed.add("offer content extracted or fetched");
    if (hasOfferModules(signals.data, uiPayload)) {
      completed.add("offer modules generated");
    }
    if (typeof data.id === "number" || typeof uiPayload.reportId === "number") {
      completed.add("offer/report persisted");
    }
    if (signals.readBackVerified === true || uiPayload.readBackVerified === true) {
      completed.add("saved offer/report read-back verification passes");
    }
  }

  if (contract.taskType === "reference_resume_save" && signals.toolName === "save_reference_resume") {
    if (typeof data.id === "number" || typeof uiPayload.id === "number") {
      completed.add("reference resume persisted");
    }
    if (hasNonEmptyString(data.roleCategory) || hasNonEmptyString(uiPayload.roleCategory)) {
      completed.add("role category confirmed");
    }
    if (Array.isArray(data.sections) || Array.isArray(uiPayload.sections) || hasNonEmptyString(data.name) || hasNonEmptyString(uiPayload.name)) {
      completed.add("source resume content present");
    }
    if (verifiedReadBack || signals.readBackVerified === true || uiPayload.readBackVerified === true || data.readBackVerified === true) {
      completed.add("reference resume read-back verification passes");
    }
  }

  if (contract.taskType === "interview_coaching" && signals.toolName === "generate_interview_questions") {
    completed.add("one question generated");
  }

  if (contract.taskType === "file_export" && (signals.toolName === "export_file" || signals.toolName === "download_report_pdf")) {
    const readBackVerified = signals.readBackVerified === true || data.readBackVerified === true || uiPayload.readBackVerified === true;
    const size = typeof data.size === "number" ? data.size : Number(uiPayload.size || 0);
    const hash = typeof data.sha256 === "string" ? data.sha256 : typeof uiPayload.sha256 === "string" ? uiPayload.sha256 : "";
    const filename = data.filename || uiPayload.filename || data.downloadUrl || uiPayload.downloadUrl;
    if (readBackVerified) completed.add("export generated");
    if (readBackVerified && filename) completed.add("file exists");
    if (readBackVerified && size > 0) completed.add("file size is non-zero");
    if (readBackVerified && hash.trim().length > 0) completed.add("file hash verified");
  }

  return contract.successCriteria.filter((criterion) => completed.has(criterion));
}

export function buildContractUnmetAssistantMessage(
  contract: AgentTaskContract,
  unmetCriteria: string[],
): string {
  const unmet = unmetCriteria.slice(0, 3).join("、");
  if (contract.taskType === "resume_edit") {
    return `这次我没有把修改结果写入简历，因为运行时校验还没全部通过：${unmet}。我已经阻止了“已保存”的成功提示，避免把不完整或未验证的内容写进简历。`;
  }
  if (contract.taskType === "jd_evaluation") {
    return `这次 JD 评估没有完成可靠落库校验：${unmet}。请重新发送 JD 文本/原图，或稍后重试，我不会把这次结果当作已完成报告。`;
  }
  if (contract.taskType === "reference_resume_save") {
    return `这次优秀简历没有完成可靠读回校验：${unmet}。我不会把它当作已沉淀的长期记忆，请稍后重试或重新上传简历。`;
  }
  if (contract.taskType === "offer_evaluation") {
    return `这次 Offer 评估没有完成可靠落库校验：${unmet}。请重新发送 Offer 文本/截图，或稍后重试，我不会把这次结果当作已完成报告。`;
  }
  return `这次任务还没有满足成功条件：${unmet}。我不会把它标记为已完成，请补充信息或稍后重试。`;
}

export function evaluateTaskContractCompletion(
  contract: AgentTaskContract,
  completedCriteria: string[],
): TaskContractGateResult {
  const deduped = Array.from(new Set(completedCriteria));
  const unmetCriteria = unmetSuccessCriteria(contract, deduped);
  const canClaimSuccess = unmetCriteria.length === 0;
  return {
    canClaimSuccess,
    completedCriteria: deduped.filter((criterion) => contract.successCriteria.includes(criterion)),
    unmetCriteria,
    safeMessage: canClaimSuccess ? undefined : buildContractUnmetAssistantMessage(contract, unmetCriteria),
  };
}
