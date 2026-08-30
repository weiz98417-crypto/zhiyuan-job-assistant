import { stableContentHash } from "@/lib/agent/verified-action";
import type { AgentTaskType } from "@/lib/agent/task-contract";

export type ArtifactKind = "jd" | "resume" | "offer" | "report" | "draft" | "profile" | "application" | "export";
export type TransitionConfirmation = "none" | "context" | "write";
export type PreviousRunBehavior = "complete" | "pause";

export interface AgentArtifactRef {
  artifactId: string;
  kind: ArtifactKind;
  version: string;
  hash: string;
  stale?: boolean;
}

export interface TaskTransitionRule {
  from: AgentTaskType;
  to: AgentTaskType;
  requiredArtifacts: ArtifactKind[];
  forwardedArtifacts: ArtifactKind[];
  confirmation: TransitionConfirmation;
  previousRun: PreviousRunBehavior;
  guards: string[];
}

export interface TaskTransitionResult {
  allowed: boolean;
  rule?: TaskTransitionRule;
  forwardedArtifacts: AgentArtifactRef[];
  reason?: string;
}

export const TASK_JOURNEY_GRAPH_VERSION = "task-journey/v1";

const RULES: TaskTransitionRule[] = [
  ...rules("general_chat", ["career_positioning_guidance", "profile_update", "job_search", "jd_evaluation", "offer_evaluation", "resume_query", "resume_edit", "interview_coaching", "reference_resume_save", "file_export"], [], [], "none", "complete"),
  ...rules("career_positioning_guidance", ["profile_update", "job_search", "resume_query", "resume_edit", "jd_evaluation", "offer_evaluation"], ["profile"], ["profile"], "context", "pause"),
  ...rules("job_search", ["jd_evaluation"], ["jd"], ["jd"], "context", "pause"),
  ...rules("jd_evaluation", ["resume_query", "resume_edit", "interview_coaching", "file_export", "job_search"], ["jd", "report"], ["jd", "report"], "context", "pause"),
  ...rules("resume_query", ["resume_edit", "jd_evaluation", "interview_coaching", "file_export"], ["resume"], ["resume"], "context", "pause"),
  ...rules("resume_edit", ["jd_evaluation", "interview_coaching", "file_export", "resume_query"], ["resume", "jd", "report", "draft"], ["resume", "jd", "report", "draft"], "write", "pause"),
  ...rules("interview_coaching", ["interview_coaching", "job_search", "file_export"], ["jd", "resume"], ["jd", "resume"], "context", "pause"),
  ...rules("offer_evaluation", ["file_export", "general_chat"], ["offer", "report"], ["offer", "report"], "context", "pause"),
  ...rules("profile_update", ["job_search", "jd_evaluation", "resume_query", "resume_edit"], ["profile"], ["profile"], "context", "pause"),
  ...rules("reference_resume_save", ["resume_query", "resume_edit", "jd_evaluation"], ["resume", "profile"], ["resume", "profile"], "context", "pause"),
  ...rules("file_export", ["general_chat"], ["export"], ["export"], "none", "complete"),
];

export const TASK_TRANSITION_GRAPH: readonly TaskTransitionRule[] = RULES;

export function listTaskTransitionRules(from?: AgentTaskType): TaskTransitionRule[] {
  return RULES.filter((rule) => from === undefined || rule.from === from).map(cloneRule);
}

export function getTaskTransitionRule(from: AgentTaskType, to: AgentTaskType): TaskTransitionRule | undefined {
  const rule = RULES.find((candidate) => candidate.from === from && candidate.to === to);
  return rule ? cloneRule(rule) : undefined;
}

export function isLegalTaskTransition(from: AgentTaskType, to: AgentTaskType): boolean {
  return Boolean(getTaskTransitionRule(from, to));
}

export function resolveTaskTransition(input: {
  from: AgentTaskType;
  to: AgentTaskType;
  artifacts?: AgentArtifactRef[];
  confirmed?: boolean;
}): TaskTransitionResult {
  const rule = getTaskTransitionRule(input.from, input.to);
  if (!rule) return { allowed: false, forwardedArtifacts: [], reason: `Illegal task transition: ${input.from} -> ${input.to}` };
  const artifacts = (input.artifacts || []).filter((artifact) => !artifact.stale);
  const missing = rule.requiredArtifacts.filter((kind) => !artifacts.some((artifact) => artifact.kind === kind));
  if (missing.length > 0) {
    return { allowed: false, rule, forwardedArtifacts: [], reason: `Missing required artifacts: ${missing.join(", ")}` };
  }
  if (rule.confirmation === "write" && input.confirmed !== true) {
    return { allowed: false, rule, forwardedArtifacts: [], reason: "User confirmation is required before a write transition." };
  }
  return {
    allowed: true,
    rule,
    forwardedArtifacts: artifacts.filter((artifact) => rule.forwardedArtifacts.includes(artifact.kind)).map(cloneArtifact),
  };
}

export function createArtifactRef(input: {
  artifactId: string | number;
  kind: ArtifactKind;
  version: string | number;
  content: unknown;
}): AgentArtifactRef {
  return {
    artifactId: String(input.artifactId),
    kind: input.kind,
    version: String(input.version),
    hash: stableContentHash(input.content),
  };
}

export function isArtifactStale(reference: AgentArtifactRef, current: { version: string | number; content: unknown }): boolean {
  return reference.stale === true
    || reference.version !== String(current.version)
    || reference.hash !== stableContentHash(current.content);
}

export function markArtifactStale(reference: AgentArtifactRef, current: { version: string | number; content: unknown }): AgentArtifactRef {
  return { ...reference, stale: isArtifactStale(reference, current) };
}

export function collectArtifactRefsFromSafePayloads(values: unknown[]): AgentArtifactRef[] {
  const refs: AgentArtifactRef[] = [];
  for (const value of values) {
    const payload = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    const safePayload = payload.uiPayload && typeof payload.uiPayload === "object" && !Array.isArray(payload.uiPayload)
      ? payload.uiPayload as Record<string, unknown>
      : payload;
    const type = String(safePayload.type || "");
    const kind = artifactKindForPayload(type);
    if (!kind) continue;
    const id = safePayload.artifactId ?? safePayload.reportId ?? safePayload.offerId ?? safePayload.jdId ?? safePayload.documentId ?? safePayload.id;
    if (id === undefined || id === null || String(id).trim() === "") continue;
    const version = safePayload.version ?? safePayload.versionId ?? safePayload.activeVersion ?? "v1";
    const hash = typeof safePayload.hash === "string"
      ? safePayload.hash
      : typeof safePayload.contentHash === "string"
        ? safePayload.contentHash
        : stableContentHash({ type, id, version });
    refs.push({ artifactId: String(id), kind, version: String(version), hash, stale: safePayload.stale === true });
  }
  const deduped = new Map<string, AgentArtifactRef>();
  for (const ref of refs) deduped.set(`${ref.kind}:${ref.artifactId}:${ref.version}`, ref);
  return Array.from(deduped.values()).slice(-12);
}

export function generateBoundedTaskPaths(options: { maxDepth?: number; start?: AgentTaskType } = {}): AgentTaskType[][] {
  const maxDepth = Math.max(1, Math.min(6, Math.floor(options.maxDepth || 2)));
  const starts = options.start ? [options.start] : Array.from(new Set(RULES.map((rule) => rule.from)));
  const paths: AgentTaskType[][] = [];
  for (const start of starts) walk([start], maxDepth, paths);
  return paths;
}

function walk(path: AgentTaskType[], maxDepth: number, output: AgentTaskType[][]): void {
  if (path.length >= 2) output.push(path.slice());
  if (path.length >= maxDepth) return;
  for (const rule of RULES) {
    if (rule.from === path[path.length - 1]) walk([...path, rule.to], maxDepth, output);
  }
}

function rules(
  from: AgentTaskType,
  targets: AgentTaskType[],
  requiredArtifacts: ArtifactKind[],
  forwardedArtifacts: ArtifactKind[],
  confirmation: TransitionConfirmation,
  previousRun: PreviousRunBehavior,
): TaskTransitionRule[] {
  return targets.map((to) => ({
    from,
    to,
    requiredArtifacts: [...requiredArtifacts],
    forwardedArtifacts: [...forwardedArtifacts],
    confirmation,
    previousRun,
    guards: confirmation === "write" ? ["scoped_user_approval", "artifact_not_stale", "read_back_required"] : ["task_contract", "owner_scope"],
  }));
}

function cloneRule(rule: TaskTransitionRule): TaskTransitionRule {
  return { ...rule, requiredArtifacts: [...rule.requiredArtifacts], forwardedArtifacts: [...rule.forwardedArtifacts], guards: [...rule.guards] };
}

function cloneArtifact(artifact: AgentArtifactRef): AgentArtifactRef {
  return { ...artifact };
}

function artifactKindForPayload(type: string): ArtifactKind | null {
  if (/^(jd_report|recent_jd_context)$/.test(type)) return type === "jd_report" ? "report" : "jd";
  if (/^(resume_document|reference_resume)$/.test(type)) return "resume";
  if (/^(resume_draft|resume_edit_proposal)$/.test(type)) return "draft";
  if (/^(resume_edit_proposal_applied|resume_edit_proposal_rolled_back)$/.test(type)) return "application";
  if (/^(offer_report|offer_evaluation|offer_comparison)$/.test(type)) return type === "offer_report" ? "report" : "offer";
  if (/^profile_/.test(type) || type === "role_preference") return "profile";
  if (/^(export_artifact|download|file_download)$/.test(type)) return "export";
  return null;
}
