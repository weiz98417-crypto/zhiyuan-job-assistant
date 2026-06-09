import type { MemoryItemStatus } from "@/lib/memory/postgres-memory";
import { MEMORY_SOURCE_TYPES, type MemorySourceType } from "@/lib/memory/vector-memory";

export const AGENT_MEMORY_TASKS = [
  "resume_optimization",
  "jd_evaluation",
  "offer_evaluation",
  "interview_coaching",
  "profile_growth",
  "reference_resume_save",
  "general_chat",
] as const;

export type AgentMemoryTask = (typeof AGENT_MEMORY_TASKS)[number];
export type AgentMemoryResolvedTask = AgentMemoryTask | "unknown";
export type AgentMemoryVisibility = "private" | "team" | "team_pending" | "public";
export type AgentStructuredMemoryScope =
  | "profile"
  | "cv"
  | "jds"
  | "reports"
  | "offers"
  | "offer_reports"
  | "memory_items"
  | "sessions";

export interface AgentMemoryPolicy {
  id: string;
  task: AgentMemoryResolvedTask;
  agentIds: string[];
  allowedSourceTypes: MemorySourceType[];
  structuredScopes: AgentStructuredMemoryScope[];
  allowedMemoryStatuses: MemoryItemStatus[];
  allowedVisibilityScopes: AgentMemoryVisibility[];
  allowedMemoryTypes: string[] | null;
  allowCandidateMemory: boolean;
  allowRawReferenceSnippets: boolean;
  semanticTopK: number;
  budgetChars: number;
  maxStructuredFacts: number;
  maxSemanticSnippets: number;
  requireSourceLabels: boolean;
  clarificationOnConflict: boolean;
}

export interface MemoryPolicySourceCandidate {
  sourceKind: "structured" | "semantic" | "memory_item";
  sourceType: string;
  sourceId?: string | number;
  memoryType?: string;
  status?: string;
  visibility?: string;
}

export interface MemoryPolicyDecision {
  allowed: boolean;
  reason: string;
  sourceLabel: string;
}

export interface MemoryPolicyDenial {
  taskType: AgentMemoryResolvedTask;
  agentId: string;
  sourceKind: MemoryPolicySourceCandidate["sourceKind"];
  sourceType: string;
  sourceId: string;
  reason: string;
}

const TASK_ALIASES: Record<string, AgentMemoryTask> = {
  jd: "jd_evaluation",
  evaluate_jd: "jd_evaluation",
  jd_eval: "jd_evaluation",
  offer: "offer_evaluation",
  evaluate_offer: "offer_evaluation",
  resume: "resume_optimization",
  cv: "resume_optimization",
  optimize_resume: "resume_optimization",
  interview: "interview_coaching",
  interview_coach: "interview_coaching",
  profile: "profile_growth",
  profile_mining: "profile_growth",
  reference_resume: "reference_resume_save",
};

export const AGENT_MEMORY_POLICIES: Record<AgentMemoryTask, AgentMemoryPolicy> = {
  resume_optimization: {
    id: "memory-policy/resume_optimization/v1",
    task: "resume_optimization",
    agentIds: ["resume", "general", "orchestrator"],
    allowedSourceTypes: ["cv", "jd", "jd_report", "reference_resume", "profile", "profile_signal"],
    structuredScopes: ["profile", "cv", "jds", "reports", "memory_items"],
    allowedMemoryStatuses: ["active"],
    allowedVisibilityScopes: ["private", "team"],
    allowedMemoryTypes: ["excellent_resume_pattern", "resume_optimization_observation", "writing_preference"],
    allowCandidateMemory: false,
    allowRawReferenceSnippets: true,
    semanticTopK: 6,
    budgetChars: 2400,
    maxStructuredFacts: 12,
    maxSemanticSnippets: 6,
    requireSourceLabels: true,
    clarificationOnConflict: true,
  },
  jd_evaluation: {
    id: "memory-policy/jd_evaluation/v1",
    task: "jd_evaluation",
    agentIds: ["evaluate", "general", "orchestrator"],
    allowedSourceTypes: ["cv", "jd", "jd_report", "profile", "profile_signal"],
    structuredScopes: ["profile", "cv", "reports", "memory_items"],
    allowedMemoryStatuses: ["active"],
    allowedVisibilityScopes: ["private", "team"],
    allowedMemoryTypes: ["jd_evaluation_observation", "job_targeting_preference"],
    allowCandidateMemory: false,
    allowRawReferenceSnippets: false,
    semanticTopK: 5,
    budgetChars: 1800,
    maxStructuredFacts: 10,
    maxSemanticSnippets: 5,
    requireSourceLabels: true,
    clarificationOnConflict: true,
  },
  offer_evaluation: {
    id: "memory-policy/offer_evaluation/v1",
    task: "offer_evaluation",
    agentIds: ["offer", "general", "orchestrator"],
    allowedSourceTypes: ["offer", "offer_report", "profile", "profile_signal"],
    structuredScopes: ["profile", "offers", "offer_reports", "memory_items"],
    allowedMemoryStatuses: ["active"],
    allowedVisibilityScopes: ["private", "team"],
    allowedMemoryTypes: ["offer_evaluation_observation", "compensation_preference", "work_style_preference"],
    allowCandidateMemory: false,
    allowRawReferenceSnippets: false,
    semanticTopK: 5,
    budgetChars: 1700,
    maxStructuredFacts: 10,
    maxSemanticSnippets: 5,
    requireSourceLabels: true,
    clarificationOnConflict: true,
  },
  interview_coaching: {
    id: "memory-policy/interview_coaching/v1",
    task: "interview_coaching",
    agentIds: ["interview", "general", "orchestrator"],
    allowedSourceTypes: ["interview", "session", "story", "profile", "profile_signal"],
    structuredScopes: ["profile", "sessions", "memory_items"],
    allowedMemoryStatuses: ["active"],
    allowedVisibilityScopes: ["private", "team"],
    allowedMemoryTypes: ["interview_observation", "interview_preference"],
    allowCandidateMemory: false,
    allowRawReferenceSnippets: false,
    semanticTopK: 5,
    budgetChars: 1600,
    maxStructuredFacts: 8,
    maxSemanticSnippets: 5,
    requireSourceLabels: true,
    clarificationOnConflict: true,
  },
  profile_growth: {
    id: "memory-policy/profile_growth/v1",
    task: "profile_growth",
    agentIds: ["profile", "general", "orchestrator"],
    allowedSourceTypes: ["cv", "interview", "session", "story", "profile", "profile_signal"],
    structuredScopes: ["profile", "cv", "sessions", "memory_items"],
    allowedMemoryStatuses: ["active"],
    allowedVisibilityScopes: ["private", "team"],
    allowedMemoryTypes: ["profile_signal", "profile_preference", "interview_observation"],
    allowCandidateMemory: false,
    allowRawReferenceSnippets: false,
    semanticTopK: 4,
    budgetChars: 1400,
    maxStructuredFacts: 8,
    maxSemanticSnippets: 4,
    requireSourceLabels: true,
    clarificationOnConflict: true,
  },
  reference_resume_save: {
    id: "memory-policy/reference_resume_save/v1",
    task: "reference_resume_save",
    agentIds: ["resume", "general", "orchestrator"],
    allowedSourceTypes: ["profile", "profile_signal"],
    structuredScopes: ["profile"],
    allowedMemoryStatuses: ["active"],
    allowedVisibilityScopes: ["private", "team"],
    allowedMemoryTypes: null,
    allowCandidateMemory: false,
    allowRawReferenceSnippets: false,
    semanticTopK: 0,
    budgetChars: 900,
    maxStructuredFacts: 3,
    maxSemanticSnippets: 0,
    requireSourceLabels: true,
    clarificationOnConflict: true,
  },
  general_chat: {
    id: "memory-policy/general_chat/v1",
    task: "general_chat",
    agentIds: ["general", "orchestrator"],
    allowedSourceTypes: [],
    structuredScopes: [],
    allowedMemoryStatuses: ["active"],
    allowedVisibilityScopes: ["private"],
    allowedMemoryTypes: null,
    allowCandidateMemory: false,
    allowRawReferenceSnippets: false,
    semanticTopK: 0,
    budgetChars: 500,
    maxStructuredFacts: 0,
    maxSemanticSnippets: 0,
    requireSourceLabels: true,
    clarificationOnConflict: true,
  },
};

export const DEFAULT_DENY_MEMORY_POLICY: AgentMemoryPolicy = {
  id: "memory-policy/default-deny/v1",
  task: "unknown",
  agentIds: [],
  allowedSourceTypes: [],
  structuredScopes: [],
  allowedMemoryStatuses: ["active"],
  allowedVisibilityScopes: ["private"],
  allowedMemoryTypes: null,
  allowCandidateMemory: false,
  allowRawReferenceSnippets: false,
  semanticTopK: 0,
  budgetChars: 500,
  maxStructuredFacts: 0,
  maxSemanticSnippets: 0,
  requireSourceLabels: true,
  clarificationOnConflict: true,
};

export function normalizeAgentMemoryTask(task: unknown): AgentMemoryTask | null {
  const raw = String(task || "").trim().toLowerCase();
  if (!raw) return null;
  if ((AGENT_MEMORY_TASKS as readonly string[]).includes(raw)) return raw as AgentMemoryTask;
  return TASK_ALIASES[raw] || null;
}

export function resolveAgentMemoryPolicy(task: unknown): AgentMemoryPolicy {
  const normalized = normalizeAgentMemoryTask(task);
  return normalized ? AGENT_MEMORY_POLICIES[normalized] : DEFAULT_DENY_MEMORY_POLICY;
}

export function detectMemoryTaskConflict(input: {
  userTextTask?: unknown;
  contentTask?: unknown;
}): { requiresClarification: boolean; userTask: AgentMemoryTask | null; contentTask: AgentMemoryTask | null; reason: string } {
  const userTask = normalizeAgentMemoryTask(input.userTextTask);
  const contentTask = normalizeAgentMemoryTask(input.contentTask);
  if (userTask && contentTask && userTask !== contentTask) {
    return {
      requiresClarification: true,
      userTask,
      contentTask,
      reason: `user_text_task_${userTask}_conflicts_with_content_task_${contentTask}`,
    };
  }
  return { requiresClarification: false, userTask, contentTask, reason: "" };
}

export function evaluateMemoryPolicySource(
  policy: AgentMemoryPolicy,
  candidate: MemoryPolicySourceCandidate,
): MemoryPolicyDecision {
  const sourceType = normalizeMemorySourceType(candidate.sourceType);
  const sourceLabel = buildMemoryPolicySourceLabel(policy, candidate);
  if (!sourceType) {
    return { allowed: false, reason: "unknown_source_type", sourceLabel };
  }
  if (sourceType === "reference_resume" && !policy.allowRawReferenceSnippets) {
    return { allowed: false, reason: "raw_reference_snippet_denied", sourceLabel };
  }
  if (!policy.allowedSourceTypes.includes(sourceType)) {
    return { allowed: false, reason: "source_type_denied", sourceLabel };
  }

  const status = normalizeMemoryStatus(candidate.status);
  if (status === "candidate" && !policy.allowCandidateMemory) {
    return { allowed: false, reason: "candidate_memory_denied", sourceLabel };
  }
  if (!policy.allowedMemoryStatuses.includes(status)) {
    return { allowed: false, reason: "status_denied", sourceLabel };
  }

  const visibility = normalizeMemoryVisibility(candidate.visibility);
  if (!policy.allowedVisibilityScopes.includes(visibility)) {
    return { allowed: false, reason: "visibility_denied", sourceLabel };
  }

  const memoryType = String(candidate.memoryType || "").trim();
  if (memoryType && policy.allowedMemoryTypes && !policy.allowedMemoryTypes.includes(memoryType)) {
    return { allowed: false, reason: "memory_type_denied", sourceLabel };
  }

  return { allowed: true, reason: "allowed", sourceLabel };
}

export function buildMemoryPolicyDenial(input: {
  policy: AgentMemoryPolicy;
  agentId?: string;
  candidate: MemoryPolicySourceCandidate;
  reason: string;
}): MemoryPolicyDenial {
  return {
    taskType: input.policy.task,
    agentId: input.agentId || "unknown",
    sourceKind: input.candidate.sourceKind,
    sourceType: input.candidate.sourceType || "unknown",
    sourceId: String(input.candidate.sourceId ?? ""),
    reason: input.reason,
  };
}

export function buildMemoryPolicySourceLabel(
  policy: AgentMemoryPolicy,
  candidate: MemoryPolicySourceCandidate,
): string {
  const sourceId = candidate.sourceId === undefined || candidate.sourceId === null ? "" : `#${candidate.sourceId}`;
  const memoryType = candidate.memoryType ? `:${candidate.memoryType}` : "";
  return `${policy.task}:${candidate.sourceKind}:${candidate.sourceType}${sourceId}${memoryType}`;
}

export function normalizeMemoryStatus(value: unknown): MemoryItemStatus {
  const raw = String(value || "active").trim().toLowerCase();
  if (raw === "candidate") return "candidate";
  if (raw === "rejected") return "rejected";
  if (raw === "archived" || raw === "disabled" || raw === "deprecated") return "archived";
  return "active";
}

export function normalizeMemoryVisibility(value: unknown): AgentMemoryVisibility {
  const raw = String(value || "private").trim().toLowerCase();
  if (raw === "team" || raw === "shared") return "team";
  if (raw === "team_pending" || raw === "pending") return "team_pending";
  if (raw === "public") return "public";
  return "private";
}

function normalizeMemorySourceType(value: string): MemorySourceType | null {
  return (MEMORY_SOURCE_TYPES as readonly string[]).includes(value) ? value as MemorySourceType : null;
}
