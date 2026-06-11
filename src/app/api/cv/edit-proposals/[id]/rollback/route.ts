import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import {
  parseCvDataJson,
  ResumeEditProposalApplyError,
  resumeEditProposalToDTO,
} from "@/lib/agent/resume-edit-proposals";

function statusForApplyError(code: ResumeEditProposalApplyError["code"]): number {
  if (code === "proposal_not_found") return 404;
  if (code === "proposal_not_applied") return 409;
  if (code === "base_version_conflict" || code === "rollback_conflict") return 409;
  return 400;
}

function findSectionContent(cvData: Record<string, unknown>, sectionId: string): string {
  const activeVersion = typeof cvData.activeVersion === "string" ? cvData.activeVersion : "";
  const versions = cvData.versions && typeof cvData.versions === "object" && !Array.isArray(cvData.versions)
    ? cvData.versions as Record<string, { sections?: Array<{ id?: string; content?: string }> }>
    : {};
  const section = versions[activeVersion]?.sections?.find((item) => item.id === sectionId);
  return section?.content || "";
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    const { id } = await context.params;
    const repos = getDataRepositories();
    const rollback = await repos.resumeEditProposals.rollback(id, user.userId);

    const cvRow = await repos.cv.get(user.userId);
    const readBackData = parseCvDataJson(cvRow?.data_json);
    const readBackContent = findSectionContent(readBackData, rollback.sectionId);
    const readBackVerified = readBackContent === rollback.restoredContent;

    return NextResponse.json({
      success: readBackVerified,
      data: {
        proposal: resumeEditProposalToDTO(rollback.proposal),
        sectionId: rollback.sectionId,
        baseVersion: rollback.baseVersion,
        rollbackHash: rollback.rollbackHash,
        restoredContent: rollback.restoredContent,
        replacedContent: rollback.replacedContent,
        readBackVerified,
      },
      error: readBackVerified ? undefined : "CV rollback read-back did not match restored content.",
    }, { status: readBackVerified ? 200 : 500 });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    if (err instanceof ResumeEditProposalApplyError) {
      return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: statusForApplyError(err.code) });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
