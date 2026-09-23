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
import type { ArtifactKind } from "@/lib/agent/task-journey";
import type { AgentRunSnapshot, DurableRunInput } from "@/lib/agent/runtime/durable-agent-run";
import type { IntentEnvelopeResolution } from "@/lib/agent/intent-envelope";

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
  /** M1 gap closure: client-side image intake routing result (hint only; server routes authoritatively). */
  imageDocumentType?: "jd" | "offer" | "resume";
  /** M1 gap closure: journey artifact refs collected from the current conversation. */
  journeyArtifacts?: Array<{
    artifactId: string;
    kind: string;
    version: string;
    hash: string;
    stale?: boolean;
  }>;
}

export interface AgentRunAdmissionInput {
  conversationId: number | null;
  input: DurableRunInput;
  entryHints?: AgentRunEntryHints;
  activeRun?: Pick<AgentRunSnapshot, "id" | "taskType" | "status"> | null;
  /** M2: resolved IntentEnvelope (structured LLM routing) for this turn. */
  envelope?: IntentEnvelopeResolution;
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

const ARTIFACT_KINDS = new Set<string>([
  "jd", "resume", "offer", "report", "draft", "profile", "application", "export",
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
  // M2: envelope clarification wins before any routing — ask one precise
  // question, never guess the task from regex.
  if (input.envelope?.kind === "clarify") {
    return {
      kind: "clarify",
      taskType: null,
      agentId: null,
      contract: null,
      route: null,
      primaryGoal: null,
      constraints: ["clarification_required"],
      evidence: [...admissionEvidence(input.entryHints), ...input.envelope.envelope.audit],
      safeMessage: input.envelope.question,
    };
  }
  const envelopeTask = input.envelope?.kind === "resolved"
    ? input.envelope.envelope.primaryTask
    : null;
  const envelopeAudit = input.envelope?.kind === "resolved" ? input.envelope.envelope.audit : [];
  const route = routeAgentTask({
    agentId: normalizedHintAgentId(input.entryHints?.agentId, evidence),
    content,
    activeTask: guidedSessionForActiveRun(input.activeRun),
    preferredDocumentType: input.entryHints?.imageDocumentType,
    envelopeTask,
    envelopeAudit,
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
  const contract = createServerOwnedContract(taskType, content, route, input.entryHints?.journeyArtifacts);
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
  journeyArtifacts?: AgentRunEntryHints["journeyArtifacts"],
): AgentTaskContract {
  const requiresClarification = route.requiresClarification;
  const validArtifacts: Array<{ artifactId: string; kind: ArtifactKind; version: string; hash: string }> = (journeyArtifacts || [])
    .filter((artifact) => artifact.artifactId && artifact.kind && artifact.version && artifact.hash && !artifact.stale)
    .filter((artifact) => ARTIFACT_KINDS.has(artifact.kind))
    .map((artifact) => ({
      artifactId: artifact.artifactId,
      kind: artifact.kind as ArtifactKind,
      version: artifact.version,
      hash: artifact.hash,
    }));
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
    journey: validArtifacts.length > 0
      ? { graphVersion: "task-journey/v1", artifacts: validArtifacts }
      : undefined,
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
