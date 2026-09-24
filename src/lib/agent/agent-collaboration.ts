/**
 * Agent 协作（M4，ADR-0027）：治理式交接 + 只读研究委派。
 *
 * - 交接（主责交接）只能沿合法任务转换图（task-journey）的边走，交接元数据
 *   结构化，图外交接被拒绝并要求用户确认。
 * - 研究委派一期只允许只读研究型子任务：子 loop 的工具白名单是委派目标
 *   白名单 ∩ 只读集合（信任不继承，只收不放）。
 * - 内部协作消息采用 A2A 词汇：AgentCard 式能力声明、Task 生命周期、
 *   Message/Part 结构（进程内直调，不跑网络协议）。
 */
import type { AgentTaskType } from "@/lib/agent/task-contract";
import { getTaskTransitionRule } from "@/lib/agent/task-journey";

/** AgentCard: 每个可协作 agent 的能力声明（A2A 词汇的进程内版）。 */
export interface AgentCard {
  agentId: string;
  /** 该 agent 承担的默认任务（交接目标映射）。 */
  baseTask: AgentTaskType;
  description: string;
  /** 只读研究委派允许的工具集合（与 agent 白名单取交集后生效）。 */
  readonlyResearchTools: string[];
}

export const AGENT_CARDS: Record<string, AgentCard> = {
  general: {
    agentId: "general",
    baseTask: "general_chat",
    description: "通用求职研究与岗位发现",
    readonlyResearchTools: ["web_search", "search_applications", "get_recent_activity", "get_pipeline_status", "get_recommendations"],
  },
  resume: {
    agentId: "resume",
    baseTask: "resume_query",
    description: "简历读取与内容分析（只读研究时不含写入工具）",
    readonlyResearchTools: ["read_file", "get_profile"],
  },
  evaluate: {
    agentId: "evaluate",
    baseTask: "jd_evaluation",
    description: "JD 评估与风险解读（研究委派只做信息汇总，不落报告）",
    readonlyResearchTools: ["web_search", "read_file", "get_recent_jd_context", "get_report_detail"],
  },
};

export function getAgentCard(agentId: string): AgentCard | null {
  return AGENT_CARDS[agentId] || null;
}

/** 交接目标的默认任务映射（用于转换图校验）。 */
const AGENT_BASE_TASK: Record<string, AgentTaskType> = Object.fromEntries(
  Object.entries(AGENT_CARDS).map(([id, card]) => [id, card.baseTask]),
) as Record<string, AgentTaskType>;

export interface HandoffValidation {
  allowed: boolean;
  fromTask: AgentTaskType | null;
  toTask: AgentTaskType | null;
  reason?: string;
}

/**
 * 校验主责交接：沿合法任务转换图的边。图外交接必须拒绝——由用户显式发起
 * 新任务，而不是 agent 私下跳转。
 */
export function validateHandoff(input: {
  currentTask: AgentTaskType | null;
  targetAgentId: string;
}): HandoffValidation {
  const card = getAgentCard(input.targetAgentId);
  if (!card) {
    return { allowed: false, fromTask: input.currentTask, toTask: null, reason: `未知的目标 agent：${input.targetAgentId}` };
  }
  const toTask = card.baseTask;
  const fromTask = input.currentTask;
  if (!fromTask) {
    return { allowed: true, fromTask, toTask, reason: "无当前任务，交接等价于选择主责 agent" };
  }
  if (fromTask === toTask) {
    return { allowed: false, fromTask, toTask, reason: "目标 agent 与当前任务的主责 agent 相同，无需交接" };
  }
  const rule = getTaskTransitionRule(fromTask, toTask);
  if (!rule) {
    return {
      allowed: false,
      fromTask,
      toTask,
      reason: `「${fromTask}」不能直接交接给「${toTask}」：不在合法任务转换图内。请由用户确认后再发起新任务。`,
    };
  }
  return { allowed: true, fromTask, toTask, reason: `合法交接：${fromTask} -> ${toTask}` };
}

export interface DelegationValidation {
  allowed: boolean;
  reason?: string;
  /** 委派子 loop 实际可用的只读工具 = 目标白名单 ∩ 卡片只读集合。 */
  effectiveTools: string[];
}

const DELEGATION_FORBIDDEN_TASKS: readonly string[] = [
  "resume_edit",
  "profile_update",
  "reference_resume_save",
  "file_export",
  "job_search",
];

/**
 * 校验研究委派：一期只读（决策 #3）。任何会写用户数据的任务类型都不允许
 * 作为委派目标；委派子 loop 也不得携带写入工具。
 */
export function validateDelegation(input: {
  targetAgentId: string;
  agentAllowlist: string[] | undefined;
}): DelegationValidation {
  const card = getAgentCard(input.targetAgentId);
  if (!card) {
    return { allowed: false, reason: `未知的目标 agent：${input.targetAgentId}`, effectiveTools: [] };
  }
  if (DELEGATION_FORBIDDEN_TASKS.includes(card.baseTask)) {
    return { allowed: false, reason: `委派目标 ${input.targetAgentId} 的主任务是写操作，研究委派只允许只读`, effectiveTools: [] };
  }
  const allowlist = input.agentAllowlist && input.agentAllowlist.length > 0
    ? new Set(input.agentAllowlist)
    : null;
  const effectiveTools = card.readonlyResearchTools.filter((tool) => !allowlist || allowlist.has(tool));
  return { allowed: true, effectiveTools };
}

/** 委派子任务的 A2A Task 生命周期（进程内对齐）。 */
export type DelegationTaskState = "submitted" | "working" | "completed" | "failed";

export interface DelegationRecord {
  delegationId: string;
  targetAgentId: string;
  goal: string;
  state: DelegationTaskState;
  findings: string;
  keyPoints: string[];
  reason?: string;
}
