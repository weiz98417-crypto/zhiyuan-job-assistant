import {
  createAgentTaskContract,
  type AgentTaskContract,
  type AgentTaskType,
} from "@/lib/agent/task-contract";
import {
  taskAgentId,
  taskLabelZh,
  type GuidedSessionState,
} from "@/lib/agent/guided-session-state";
import {
  routeAgentTask,
  type AgentTaskRouteDecision,
} from "@/lib/agent/task-routing";
import type { AgentRunSnapshot, DurableRunInput } from "@/lib/agent/runtime/durable-agent-run";

export type AgentRunAdmissionKind =
  | "continue_current_run"
  | "start_new_run"
  | "start_new_conversation"
  | "clarify"
  | "defer_switch"
  | "reject";

export interface AgentRunEntryHints {
  agentId?: string;
  taskType?: string;
  source?: string;
}

export interface AgentRunAdmissionInput {
  conversationId: number | null;
  input: DurableRunInput;
  entryHints?: AgentRunEntryHints;
  activeRun?: Pick<AgentRunSnapshot, "id" | "taskType" | "status"> | null;
}

export interface AgentRunAdmissionDecision {
  kind: AgentRunAdmissionKind;
  taskType: AgentTaskType | null;
  agentId: string | null;
  contract: AgentTaskContract | null;
  route: AgentTaskRouteDecision | null;
  primaryGoal: string | null;
  constraints: string[];
  evidence: string[];
  currentRunId?: string;
  safeMessage?: string;
}

const ROUTING_HINT_AGENT_IDS = new Set([
  "general",
  "resume",
  "evaluate",
  "offer",
  "interview",
  "profile",
]);

const AGENT_TASK_TYPES = new Set<AgentTaskType>([
  "general_chat",
  "career_positioning_guidance",
  "resume_query",
  "resume_edit",
  "jd_evaluation",
  "offer_evaluation",
  "interview_coaching",
  "profile_update",
  "reference_resume_save",
  "file_export",
  "job_search",
]);

export function admitAgentRun(input: AgentRunAdmissionInput): AgentRunAdmissionDecision {
  const content = input.input.content.trim();
  if (!content) {
    return {
      kind: "reject",
      taskType: null,
      agentId: null,
      contract: null,
      route: null,
      primaryGoal: null,
      constraints: [],
      evidence: ["input.content_missing"],
      safeMessage: "请先说明希望纸鸢帮你完成什么。",
    };
  }

  const evidence = admissionEvidence(input.entryHints);
  const route = routeAgentTask({
    agentId: normalizedHintAgentId(input.entryHints?.agentId, evidence),
    content,
    activeTask: guidedSessionForActiveRun(input.activeRun),
  });
  const taskType = route.taskType;
  if (!taskType) {
    return {
      kind: "reject",
      taskType: null,
      agentId: null,
      contract: null,
      route,
      primaryGoal: null,
      constraints: [],
      evidence: [...evidence, "admission.task_not_resolved"],
      safeMessage: "我还不能确认要执行的求职任务，请补充目标、材料或期望结果。",
    };
  }

  const agentId = taskAgentId(taskType);
  const contract = createServerOwnedContract(taskType, content, route);
  const primaryGoal = taskLabelZh(taskType);
  const constraints = route.requiresClarification
    ? ["clarification_required"]
    : [];

  if (input.activeRun) {
    if (input.activeRun.taskType === taskType) {
      return {
        kind: "continue_current_run",
        taskType,
        agentId,
        contract,
        route,
        primaryGoal,
        constraints,
        evidence: [...evidence, "admission.continue_current_run"],
        currentRunId: input.activeRun.id,
      };
    }
    return {
      kind: "defer_switch",
      taskType,
      agentId,
      contract,
      route,
      primaryGoal,
      constraints,
      evidence: [...evidence, "admission.active_run_switch_deferred"],
      currentRunId: input.activeRun.id,
      safeMessage: `当前「${taskLabelZh(input.activeRun.taskType)}」尚未结束。请先完成、取消或在安全切换点暂停当前任务，再开始「${primaryGoal}」。`,
    };
  }

  if (route.requiresClarification) {
    return {
      kind: "clarify",
      taskType,
      agentId,
      contract,
      route,
      primaryGoal,
      constraints,
      evidence: [...evidence, "admission.clarification_required"],
    };
  }

  return {
    kind: input.conversationId === null ? "start_new_conversation" : "start_new_run",
    taskType,
    agentId,
    contract,
    route,
    primaryGoal,
    constraints,
    evidence: [...evidence, "admission.start_run"],
  };
}

function createServerOwnedContract(
  taskType: AgentTaskType,
  target: string,
  route: AgentTaskRouteDecision,
): AgentTaskContract {
  const requiresClarification = route.requiresClarification;
  return createAgentTaskContract({
    taskType,
    target,
    successCriteria: requiresClarification ? ["clarification question asked"] : undefined,
    validators: requiresClarification ? ["user_intent_clarification"] : undefined,
    routing: {
      contractPolicy: route.contractPolicy,
      memoryTask: route.memoryTask,
      allowedTools: route.allowedTools.slice(0, 20),
      requiresClarification,
      clarificationQuestion: route.clarificationQuestion,
      blockedReason: route.blockedReason,
      auditSummary: route.auditSummary,
    },
  });
}

function admissionEvidence(entryHints: AgentRunEntryHints | undefined): string[] {
  const evidence = ["client.taskType_ignored", "client.contract_ignored"];
  if (entryHints?.source?.trim()) evidence.push(`entry.source:${entryHints.source.trim().slice(0, 80)}`);
  return evidence;
}

function normalizedHintAgentId(rawAgentId: string | undefined, evidence: string[]): string {
  const agentId = rawAgentId?.trim() || "";
  if (!agentId) return "general";
  if (!ROUTING_HINT_AGENT_IDS.has(agentId)) {
    evidence.push("client.agentId_ignored");
    return "general";
  }
  evidence.push("client.agentId_used_as_hint");
  return agentId;
}

function guidedSessionForActiveRun(
  activeRun: AgentRunAdmissionInput["activeRun"],
): GuidedSessionState | undefined {
  if (!activeRun || !isAgentTaskType(activeRun.taskType)) return undefined;
  const now = new Date().toISOString();
  return {
    taskId: activeRun.id,
    taskType: activeRun.taskType,
    agentId: taskAgentId(activeRun.taskType),
    status: activeRun.status === "waiting_user" || activeRun.status === "paused" ? "waiting_user" : "active",
    startedAt: now,
    lastUpdatedAt: now,
    source: "agent_state",
  };
}

function isAgentTaskType(value: string): value is AgentTaskType {
  return AGENT_TASK_TYPES.has(value as AgentTaskType);
}
