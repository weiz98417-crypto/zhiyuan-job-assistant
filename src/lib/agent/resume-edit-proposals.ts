import { stableContentHash } from "@/lib/agent/verified-action";
import type { ResumeSectionId } from "@/lib/agent/resume-save-guard";

export type ResumeEditProposalStatus = "pending" | "applied" | "discarded" | "stale";

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
