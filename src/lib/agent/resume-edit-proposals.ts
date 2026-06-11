import { stableContentHash } from "@/lib/agent/verified-action";
import type { ResumeSectionId } from "@/lib/agent/resume-save-guard";

export type ResumeEditProposalStatus = "pending" | "applied" | "discarded" | "stale" | "rolled_back";

export interface ResumeEditProposalRecord {
  id: string;
  user_id?: string;
  section_id: ResumeSectionId;
  base_version: string;
  base_hash: string;
  original_content: string;
  proposed_content: string;
  proposed_hash: string;
  reason: string;
  risk_flags_json: string;
  status: ResumeEditProposalStatus;
  created_at?: string;
  updated_at?: string;
}

export interface ResumeEditProposalInput {
  id?: string;
  sectionId: ResumeSectionId;
  baseVersion: string;
  baseHash: string;
  originalContent: string;
  proposedContent: string;
  reason?: string;
  riskFlags?: string[];
}

export interface ResumeEditProposalDTO {
  id: string;
  sectionId: ResumeSectionId;
  baseVersion: string;
  baseHash: string;
  originalContent: string;
  proposedContent: string;
  proposedHash: string;
  reason: string;
  riskFlags: string[];
  status: ResumeEditProposalStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface ResumeEditProposalApplyResult {
  proposal: ResumeEditProposalRecord;
  cvData: Record<string, unknown>;
  sectionId: ResumeSectionId;
  baseVersion: string;
  baseHash: string;
  appliedHash: string;
  previousContent: string;
  appliedContent: string;
}

export interface ResumeEditProposalRollbackResult {
  proposal: ResumeEditProposalRecord;
  cvData: Record<string, unknown>;
  sectionId: ResumeSectionId;
  baseVersion: string;
  rollbackHash: string;
  restoredContent: string;
  replacedContent: string;
}

export class ResumeEditProposalApplyError extends Error {
  constructor(
    public readonly code: "proposal_not_found" | "proposal_not_pending" | "proposal_not_applied" | "cv_missing" | "section_missing" | "base_version_conflict" | "rollback_conflict",
    message: string,
  ) {
    super(message);
    this.name = "ResumeEditProposalApplyError";
  }
}

type CVSection = { id?: string; title?: string; content?: string; [key: string]: unknown };
type CVVersion = { sections?: CVSection[]; [key: string]: unknown };

export function createResumeEditProposalId(): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `rep_${random}`;
}

export function buildResumeEditProposalRecord(input: ResumeEditProposalInput): ResumeEditProposalRecord {
  return {
    id: input.id || createResumeEditProposalId(),
    section_id: input.sectionId,
    base_version: input.baseVersion,
    base_hash: input.baseHash,
    original_content: input.originalContent,
    proposed_content: input.proposedContent,
    proposed_hash: stableContentHash(input.proposedContent),
    reason: input.reason || "",
    risk_flags_json: JSON.stringify(input.riskFlags || []),
    status: "pending",
  };
}

export function resumeEditProposalToDTO(row: ResumeEditProposalRecord): ResumeEditProposalDTO {
  let riskFlags: string[] = [];
  try {
    const parsed = JSON.parse(row.risk_flags_json || "[]");
    riskFlags = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    riskFlags = [];
  }
  return {
    id: row.id,
    sectionId: row.section_id,
    baseVersion: row.base_version,
    baseHash: row.base_hash,
    originalContent: row.original_content,
    proposedContent: row.proposed_content,
    proposedHash: row.proposed_hash,
    reason: row.reason,
    riskFlags,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function parseCvDataJson(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function applyResumeEditProposalToCvData(
  proposal: ResumeEditProposalRecord,
  inputCvData: Record<string, unknown>,
): ResumeEditProposalApplyResult {
  if (proposal.status !== "pending") {
    throw new ResumeEditProposalApplyError("proposal_not_pending", "Resume edit proposal is not pending.");
  }

  const cvData = JSON.parse(JSON.stringify(inputCvData || {})) as Record<string, unknown>;
  const activeVersion = typeof cvData.activeVersion === "string" ? cvData.activeVersion : "";
  const versions = cvData.versions && typeof cvData.versions === "object" && !Array.isArray(cvData.versions)
    ? cvData.versions as Record<string, CVVersion>
    : {};
  const active = activeVersion ? versions[activeVersion] : undefined;
  if (!active?.sections || !Array.isArray(active.sections)) {
    throw new ResumeEditProposalApplyError("cv_missing", "CV data is empty or malformed.");
  }

  if (proposal.base_version && proposal.base_version !== activeVersion) {
    throw new ResumeEditProposalApplyError("base_version_conflict", "CV version changed after the proposal was created.");
  }

  const currentBaseHash = stableContentHash(active);
  if (proposal.base_hash && proposal.base_hash !== currentBaseHash) {
    throw new ResumeEditProposalApplyError("base_version_conflict", "CV content changed after the proposal was created.");
  }

  const target = active.sections.find((section) => section.id === proposal.section_id);
  if (!target) {
    throw new ResumeEditProposalApplyError("section_missing", `CV section not found: ${proposal.section_id}`);
  }

  const previousContent = target.content || "";
  if (proposal.original_content && previousContent !== proposal.original_content) {
    throw new ResumeEditProposalApplyError("base_version_conflict", "CV section content changed after the proposal was created.");
  }

  target.content = proposal.proposed_content;
  return {
    proposal,
    cvData,
    sectionId: proposal.section_id,
    baseVersion: activeVersion,
    baseHash: currentBaseHash,
    appliedHash: stableContentHash(active),
    previousContent,
    appliedContent: proposal.proposed_content,
  };
}

export function rollbackResumeEditProposalInCvData(
  proposal: ResumeEditProposalRecord,
  inputCvData: Record<string, unknown>,
): ResumeEditProposalRollbackResult {
  if (proposal.status !== "applied") {
    throw new ResumeEditProposalApplyError("proposal_not_applied", "Resume edit proposal is not applied.");
  }

  const cvData = JSON.parse(JSON.stringify(inputCvData || {})) as Record<string, unknown>;
  const activeVersion = typeof cvData.activeVersion === "string" ? cvData.activeVersion : "";
  const versions = cvData.versions && typeof cvData.versions === "object" && !Array.isArray(cvData.versions)
    ? cvData.versions as Record<string, CVVersion>
    : {};
  const active = activeVersion ? versions[activeVersion] : undefined;
  if (!active?.sections || !Array.isArray(active.sections)) {
    throw new ResumeEditProposalApplyError("cv_missing", "CV data is empty or malformed.");
  }

  if (proposal.base_version && proposal.base_version !== activeVersion) {
    throw new ResumeEditProposalApplyError("base_version_conflict", "CV version changed after the proposal was applied.");
  }

  const target = active.sections.find((section) => section.id === proposal.section_id);
  if (!target) {
    throw new ResumeEditProposalApplyError("section_missing", `CV section not found: ${proposal.section_id}`);
  }

  const replacedContent = target.content || "";
  if (replacedContent !== proposal.proposed_content) {
    throw new ResumeEditProposalApplyError("rollback_conflict", "CV section changed after the proposal was applied; rollback would overwrite newer content.");
  }

  target.content = proposal.original_content;
  return {
    proposal,
    cvData,
    sectionId: proposal.section_id,
    baseVersion: activeVersion,
    rollbackHash: stableContentHash(active),
    restoredContent: proposal.original_content,
    replacedContent,
  };
}
