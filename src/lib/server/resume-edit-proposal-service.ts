import { createHash } from "node:crypto";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { getDataRepositories } from "@/lib/data-repositories";
import {
  parseCvDataJson,
  resumeEditProposalToDTO,
  type ResumeEditProposalDTO,
} from "@/lib/agent/resume-edit-proposals";
import {
  validateResumeSectionContent,
  type ResumeSectionId,
} from "@/lib/agent/resume-save-guard";
import { stableContentHash } from "@/lib/agent/verified-action";

const SECTION_IDS = new Set<ResumeSectionId>(["summary", "experience", "projects", "education", "skills"]);

export interface CreateResumeEditProposalInput {
  sectionId: ResumeSectionId;
  proposedContent: string;
  reason?: string;
  riskFlags?: string[];
  draftId?: string;
  expectedBaseHash?: string;
  expectedBaseVersion?: string;
  requestId?: string;
}

export interface CreatedResumeEditProposal extends ResumeEditProposalDTO {
  draftId?: string;
  artifactId?: string;
  readBackVerified: true;
}

export interface ResumeProposalReconciliation {
  state: "verified" | "not_executed" | "unknown";
  summary: string;
  data?: Record<string, unknown>;
}

export class ResumeProposalServiceError extends Error {
  constructor(
    public readonly code: "not_found" | "invalid_input" | "conflict" | "verification_failed",
    message: string,
  ) {
    super(message);
    this.name = "ResumeProposalServiceError";
  }
}

export async function createResumeEditProposalForUser(
  principal: ExecutionPrincipal,
  input: CreateResumeEditProposalInput,
): Promise<CreatedResumeEditProposal> {
  const repositories = getDataRepositories();
  const draft = input.draftId
    ? await repositories.resumeDrafts.get(input.draftId, principal.userId)
    : undefined;
  if (input.draftId && !draft) {
    throw new ResumeProposalServiceError("not_found", "简历草稿不存在或不属于当前用户");
  }
  const draftContent = draft ? parseDraftContent(draft.content_json, draft.patches_json) : null;
  const sectionId = (draftContent?.sectionId || input.sectionId) as ResumeSectionId;
  const proposedContent = draftContent?.content || input.proposedContent;
  if (!SECTION_IDS.has(sectionId)) {
    throw new ResumeProposalServiceError("invalid_input", "无效的简历板块");
  }
  const validation = validateResumeSectionContent(sectionId, proposedContent);
  if (!validation.valid) {
    throw new ResumeProposalServiceError("invalid_input", validation.reason || "提案内容未通过校验");
  }
  const cvRow = await repositories.cv.get(principal.userId);
  const active = getActiveVersion(parseCvDataJson(cvRow?.data_json));
  if (!active) {
    throw new ResumeProposalServiceError("invalid_input", "CV 数据为空，请先在 CV 页面创建简历");
  }
  const section = active.version.sections?.find((item) => item.id === sectionId);
  if (!section) {
    throw new ResumeProposalServiceError("invalid_input", `找不到板块: ${sectionId}`);
  }
  const currentBaseHash = stableContentHash(active.version);
  const expectedBaseHash = draft?.base_hash || input.expectedBaseHash || "";
  const expectedBaseVersion = draft?.base_version || input.expectedBaseVersion || "";
  if (
    (expectedBaseVersion && expectedBaseVersion !== active.id)
    || (expectedBaseHash && expectedBaseHash !== currentBaseHash)
  ) {
    throw new ResumeProposalServiceError(
      "conflict",
      "简历已经发生变化，已阻止用旧上下文创建修改提案。请重新读取简历后再生成方案。",
    );
  }
  const proposalId = input.requestId
    ? deterministicProposalId(principal.userId, input.requestId)
    : undefined;
  if (proposalId) {
    const existing = await repositories.resumeEditProposals.get(proposalId, principal.userId);
    if (existing) {
      if (
        existing.section_id !== sectionId
        || existing.base_hash !== currentBaseHash
        || existing.proposed_content !== proposedContent
      ) {
        throw new ResumeProposalServiceError("conflict", "同一请求标识已绑定到不同的简历修改提案");
      }
      return {
        ...resumeEditProposalToDTO(existing),
        draftId: draft?.id,
        artifactId: draft?.artifact_id,
        readBackVerified: true,
      };
    }
  }
  const row = await repositories.resumeEditProposals.create({
    id: proposalId,
    sectionId,
    baseVersion: active.id,
    baseHash: currentBaseHash,
    originalContent: section.content || "",
    proposedContent,
    reason: (input.reason || (draft ? `selected_resume_draft:${draft.id}` : "")).slice(0, 1200),
    riskFlags: [...(input.riskFlags || []), ...(draft ? ["persistent_draft"] : [])],
  }, principal.userId);
  if (draft) await repositories.resumeDrafts.updateStatus(draft.id, "selected", principal.userId);
  const readBack = await repositories.resumeEditProposals.get(row.id, principal.userId);
  if (
    !readBack
    || readBack.status !== "pending"
    || readBack.section_id !== sectionId
    || readBack.proposed_hash !== row.proposed_hash
    || readBack.proposed_content !== proposedContent
  ) {
    throw new ResumeProposalServiceError("verification_failed", "简历修改提案创建后读回校验失败");
  }
  return {
    ...resumeEditProposalToDTO(readBack),
    draftId: draft?.id,
    artifactId: draft?.artifact_id,
    readBackVerified: true,
  };
}

export async function applyResumeEditProposalForUser(
  principal: ExecutionPrincipal,
  proposalId: string,
) {
  const repositories = getDataRepositories();
  const existing = await repositories.resumeEditProposals.get(proposalId, principal.userId);
  if (existing?.status === "applied") {
    const cvRow = await repositories.cv.get(principal.userId);
    const readBackContent = findSectionContent(parseCvDataJson(cvRow?.data_json), existing.section_id);
    if (readBackContent !== existing.proposed_content) {
      throw new ResumeProposalServiceError("verification_failed", "CV read-back did not match applied proposal content.");
    }
    return {
      proposal: resumeEditProposalToDTO(existing),
      sectionId: existing.section_id,
      baseVersion: existing.base_version,
      baseHash: existing.base_hash,
      appliedHash: existing.proposed_hash,
      previousContent: existing.original_content,
      appliedContent: existing.proposed_content,
      readBackVerified: true as const,
    };
  }
  const applied = await repositories.resumeEditProposals.apply(proposalId, principal.userId);
  const cvRow = await repositories.cv.get(principal.userId);
  const readBackContent = findSectionContent(parseCvDataJson(cvRow?.data_json), applied.sectionId);
  if (readBackContent !== applied.appliedContent) {
    throw new ResumeProposalServiceError("verification_failed", "CV read-back did not match applied proposal content.");
  }
  return {
    proposal: resumeEditProposalToDTO(applied.proposal),
    sectionId: applied.sectionId,
    baseVersion: applied.baseVersion,
    baseHash: applied.baseHash,
    appliedHash: applied.appliedHash,
    previousContent: applied.previousContent,
    appliedContent: applied.appliedContent,
    readBackVerified: true as const,
  };
}

export async function discardResumeEditProposalForUser(
  principal: ExecutionPrincipal,
  proposalId: string,
) {
  const repositories = getDataRepositories();
  const existing = await repositories.resumeEditProposals.get(proposalId, principal.userId);
  if (existing?.status === "discarded") {
    return { proposal: resumeEditProposalToDTO(existing), readBackVerified: true as const };
  }
  const discarded = await repositories.resumeEditProposals.discard(proposalId, principal.userId);
  const readBack = await repositories.resumeEditProposals.get(proposalId, principal.userId);
  if (!readBack || readBack.status !== "discarded") {
    throw new ResumeProposalServiceError("verification_failed", "Proposal discard read-back did not match expected status.");
  }
  return {
    proposal: resumeEditProposalToDTO(readBack || discarded),
    readBackVerified: true as const,
  };
}

export async function rollbackResumeEditProposalForUser(
  principal: ExecutionPrincipal,
  proposalId: string,
) {
  const repositories = getDataRepositories();
  const existing = await repositories.resumeEditProposals.get(proposalId, principal.userId);
  if (existing?.status === "rolled_back") {
    const cvRow = await repositories.cv.get(principal.userId);
    const readBackContent = findSectionContent(parseCvDataJson(cvRow?.data_json), existing.section_id);
    if (readBackContent !== existing.original_content) {
      throw new ResumeProposalServiceError("verification_failed", "CV rollback read-back did not match restored content.");
    }
    return {
      proposal: resumeEditProposalToDTO(existing),
      sectionId: existing.section_id,
      baseVersion: existing.base_version,
      rollbackHash: existing.base_hash,
      restoredContent: existing.original_content,
      replacedContent: existing.proposed_content,
      readBackVerified: true as const,
    };
  }
  const rollback = await repositories.resumeEditProposals.rollback(proposalId, principal.userId);
  const cvRow = await repositories.cv.get(principal.userId);
  const readBackContent = findSectionContent(parseCvDataJson(cvRow?.data_json), rollback.sectionId);
  if (readBackContent !== rollback.restoredContent) {
    throw new ResumeProposalServiceError("verification_failed", "CV rollback read-back did not match restored content.");
  }
  return {
    proposal: resumeEditProposalToDTO(rollback.proposal),
    sectionId: rollback.sectionId,
    baseVersion: rollback.baseVersion,
    rollbackHash: rollback.rollbackHash,
    restoredContent: rollback.restoredContent,
    replacedContent: rollback.replacedContent,
    readBackVerified: true as const,
  };
}

export async function reconcileResumeEditProposalForUser(
  principal: ExecutionPrincipal,
  proposalId: string,
  expectedStatus: "applied" | "discarded" | "rolled_back",
): Promise<ResumeProposalReconciliation> {
  const repositories = getDataRepositories();
  const proposal = await repositories.resumeEditProposals.get(proposalId, principal.userId);
  if (!proposal) return { state: "not_executed", summary: `简历修改提案 ${proposalId} 不存在` };
  if (proposal.status !== expectedStatus) {
    const knownNotExecuted = (
      (expectedStatus === "applied" && proposal.status === "pending")
      || (expectedStatus === "discarded" && proposal.status === "pending")
      || (expectedStatus === "rolled_back" && proposal.status === "applied")
    );
    return {
      state: knownNotExecuted ? "not_executed" : "unknown",
      summary: `简历修改提案 ${proposalId} 当前状态为 ${proposal.status}，预期为 ${expectedStatus}`,
    };
  }
  if (expectedStatus === "discarded") {
    return {
      state: "verified",
      summary: `简历修改提案 ${proposalId} 已废弃且读回一致`,
      data: { proposal: resumeEditProposalToDTO(proposal), readBackVerified: true },
    };
  }
  const cvRow = await repositories.cv.get(principal.userId);
  const expectedContent = expectedStatus === "applied"
    ? proposal.proposed_content
    : proposal.original_content;
  const readBackContent = findSectionContent(parseCvDataJson(cvRow?.data_json), proposal.section_id);
  if (readBackContent !== expectedContent) {
    return {
      state: "unknown",
      summary: `简历修改提案 ${proposalId} 状态已更新，但 CV 读回内容不一致`,
    };
  }
  return {
    state: "verified",
    summary: `简历修改提案 ${proposalId} 已${expectedStatus === "applied" ? "应用" : "回滚"}且读回一致`,
    data: {
      proposal: resumeEditProposalToDTO(proposal),
      sectionId: proposal.section_id,
      readBackVerified: true,
    },
  };
}

function getActiveVersion(cvData: Record<string, unknown>): {
  id: string;
  version: { sections?: Array<{ id?: string; content?: string }> };
} | null {
  const id = typeof cvData.activeVersion === "string" ? cvData.activeVersion : "";
  const versions = cvData.versions && typeof cvData.versions === "object" && !Array.isArray(cvData.versions)
    ? cvData.versions as Record<string, { sections?: Array<{ id?: string; content?: string }> }>
    : {};
  return id && Array.isArray(versions[id]?.sections) ? { id, version: versions[id] } : null;
}

function findSectionContent(cvData: Record<string, unknown>, sectionId: string): string {
  const active = getActiveVersion(cvData);
  return active?.version.sections?.find((item) => item.id === sectionId)?.content || "";
}

function parseDraftContent(contentJson: string, patchesJson: string): { sectionId: string; content: string } | null {
  try {
    const content = JSON.parse(contentJson || "{}") as Record<string, unknown>;
    if (typeof content.sectionId === "string" && typeof content.content === "string") {
      return { sectionId: content.sectionId, content: content.content };
    }
  } catch {
  }
  try {
    const patches = JSON.parse(patchesJson || "[]") as Array<Record<string, unknown>>;
    if (typeof patches[0]?.sectionId === "string" && typeof patches[0]?.proposedContent === "string") {
      return { sectionId: patches[0].sectionId as string, content: patches[0].proposedContent as string };
    }
  } catch {
  }
  return null;
}

function deterministicProposalId(userId: string, requestId: string): string {
  return `rep_${createHash("sha256").update(`${userId}:${requestId}`).digest("hex").slice(0, 32)}`;
}
