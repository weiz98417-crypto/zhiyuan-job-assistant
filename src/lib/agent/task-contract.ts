export type AgentTaskType =
  | "resume_edit"
  | "jd_evaluation"
  | "offer_evaluation"
  | "interview_coaching"
  | "profile_update"
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
  file_export: [
    "export generated",
    "file exists",
    "file size is non-zero",
  ],
};

const DEFAULT_VALIDATORS: Record<AgentTaskType, string[]> = {
  resume_edit: ["base_hash", "document_field", "read_back_match", "no_placeholder_content"],
  jd_evaluation: ["source_content_present", "report_blocks_present", "read_back_match"],
  offer_evaluation: ["source_content_present", "offer_modules_present", "read_back_match"],
  interview_coaching: ["context_binding", "single_question"],
  profile_update: ["signal_quality", "source_evidence", "read_back_match"],
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
