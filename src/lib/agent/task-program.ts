import type { AgentTaskType } from "@/lib/agent/task-contract";

export type TaskProgramExecutionDepth = "deterministic" | "conversational";

export interface TaskProgram {
  id: AgentTaskType;
  version: "2026-08-30";
  executionDepth: TaskProgramExecutionDepth;
  stages: readonly string[];
  successCriteria: readonly string[];
  validators: readonly string[];
}

export interface TaskProgramBinding {
  id: AgentTaskType;
  version: TaskProgram["version"];
  executionDepth: TaskProgramExecutionDepth;
  stages: string[];
}

const CONVERSATIONAL_STAGES = ["bind_context", "respond", "wait_or_complete"];
const DETERMINISTIC_STAGES = ["preflight", "clarify_or_gate", "execute", "verify_read_back", "persist_artifact", "respond"];

export const TASK_PROGRAM_REGISTRY: Record<AgentTaskType, TaskProgram> = {
  general_chat: program("general_chat", "conversational", CONVERSATIONAL_STAGES, ["answer generated"], ["assistant_response"]),
  career_positioning_guidance: program("career_positioning_guidance", "conversational", CONVERSATIONAL_STAGES, ["guidance framework loaded", "next question or guidance response generated"], ["guidance_response"]),
  resume_query: program("resume_query", "conversational", CONVERSATIONAL_STAGES, ["resume context read", "answer generated"], ["read_only_resume_response"]),
  resume_edit: program("resume_edit", "deterministic", DETERMINISTIC_STAGES, ["draft generated", "user approved draft", "target section read-back hash matches applied content", "content validator passes", "version snapshot created"], ["base_hash", "document_field", "read_back_match", "no_placeholder_content"]),
  jd_evaluation: program("jd_evaluation", "deterministic", DETERMINISTIC_STAGES, ["source content extracted or fetched", "A-G evaluation generated", "report persisted", "saved report read-back verification passes"], ["source_content_present", "report_blocks_present", "read_back_match"]),
  offer_evaluation: program("offer_evaluation", "deterministic", DETERMINISTIC_STAGES, ["offer content extracted or fetched", "offer modules generated", "offer/report persisted", "saved offer/report read-back verification passes"], ["source_content_present", "offer_modules_present", "read_back_match"]),
  interview_coaching: program("interview_coaching", "conversational", CONVERSATIONAL_STAGES, ["JD/resume context bound", "one question generated", "session state updated without losing context"], ["context_binding", "single_question"]),
  profile_update: program("profile_update", "deterministic", DETERMINISTIC_STAGES, ["candidate signals extracted", "signal validator passes", "profile or memory write read-back verification passes"], ["signal_quality", "source_evidence", "read_back_match"]),
  reference_resume_save: program("reference_resume_save", "deterministic", DETERMINISTIC_STAGES, ["source resume content present", "role category confirmed", "reference resume persisted", "reference resume read-back verification passes"], ["source_resume_present", "role_category", "read_back_match"]),
  file_export: program("file_export", "deterministic", ["preflight", "execute", "verify_read_back", "persist_artifact", "respond"], ["export generated", "file exists", "file size is non-zero", "file hash verified"], ["file_exists", "file_size", "file_hash"]),
  job_search: program("job_search", "deterministic", ["preflight", "clarify_or_gate", "execute", "verify_read_back", "respond"], ["job discovery criteria confirmed", "scan creation gated by user confirmation", "scan read-back or opportunity pool response returned"], ["confirmation_required", "scan_read_back", "opportunity_pool_response"]),
};

export function getTaskProgram(taskType: AgentTaskType): TaskProgram {
  return TASK_PROGRAM_REGISTRY[taskType];
}

export function bindTaskProgram(taskType: AgentTaskType): TaskProgramBinding {
  const taskProgram = getTaskProgram(taskType);
  return {
    id: taskProgram.id,
    version: taskProgram.version,
    executionDepth: taskProgram.executionDepth,
    stages: [...taskProgram.stages],
  };
}

/* ── M3: runtime stop-guard ──
 * A deterministic program may not end while any success criterion is unmet.
 * The loop asks the tracker before responding; one program directive nudges
 * the model toward the missing facts, and a second unmet stop is downgraded
 * to an explicit task-incomplete response instead of a success claim. */

export interface TaskProgramStopGuard {
  missingCriteria(completedCriteria: Iterable<string>): string[];
  nudgeMessage(missing: string[]): string;
  incompleteResponse(missing: string[]): string;
}

export function createTaskProgramStopGuard(taskType: AgentTaskType): TaskProgramStopGuard | null {
  const taskProgram = TASK_PROGRAM_REGISTRY[taskType];
  if (!taskProgram || taskProgram.executionDepth !== "deterministic") return null;
  const criteria = taskProgram.successCriteria;
  const label = TASK_LABELS[taskType];
  return {
    missingCriteria(completedCriteria) {
      const completed = new Set(completedCriteria);
      return criteria.filter((criterion) => !completed.has(criterion));
    },
    nudgeMessage(missing) {
      return [
        "<!-- system:program-stop-guard -->",
        `当前「${label}」是确定性任务，以下完成判据还没有满足，不能直接结束：`,
        ...missing.map((criterion) => `- ${criterion}`),
        "请继续执行能推进这些判据的下一个动作（读取材料 / 发起确认或批准 / 执行工具 / 校验读回）。不要向用户宣称任务已完成。",
      ].join("\n");
    },
    incompleteResponse(missing) {
      return [
        `「${label}」还没有完成，我先不把它标记为成功。缺少的部分：`,
        ...missing.map((criterion) => `- ${criterion}`),
        "请补充材料或确认后继续；已产生的中间结果不会丢。",
      ].join("\n");
    },
  };
}

const TASK_LABELS: Record<AgentTaskType, string> = {
  general_chat: "通用咨询",
  career_positioning_guidance: "职业定位",
  resume_query: "简历查询",
  resume_edit: "简历优化",
  jd_evaluation: "JD 评估",
  offer_evaluation: "Offer 评估",
  interview_coaching: "模拟面试",
  profile_update: "画像更新",
  reference_resume_save: "优秀简历沉淀",
  file_export: "文件导出",
  job_search: "岗位发现",
};

function program(
  id: AgentTaskType,
  executionDepth: TaskProgramExecutionDepth,
  stages: readonly string[],
  successCriteria: readonly string[],
  validators: readonly string[],
): TaskProgram {
  return {
    id,
    version: "2026-08-30",
    executionDepth,
    stages,
    successCriteria,
    validators,
  };
}
