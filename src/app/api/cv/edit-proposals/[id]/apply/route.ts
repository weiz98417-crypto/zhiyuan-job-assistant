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
  if (code === "proposal_not_pending") return 409;
  if (code === "base_version_conflict") return 409;
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
    const applied = await repos.resumeEditProposals.apply(id, user.userId);

    const cvRow = await repos.cv.get(user.userId);
    const readBackData = parseCvDataJson(cvRow?.data_json);
    const readBackContent = findSectionContent(readBackData, applied.sectionId);
    const readBackVerified = readBackContent === applied.appliedContent;

    return NextResponse.json({
      success: readBackVerified,
      data: {
        proposal: resumeEditProposalToDTO(applied.proposal),
        sectionId: applied.sectionId,
        baseVersion: applied.baseVersion,
        baseHash: applied.baseHash,
        appliedHash: applied.appliedHash,
        previousContent: applied.previousContent,
        appliedContent: applied.appliedContent,
        readBackVerified,
      },
      error: readBackVerified ? undefined : "CV read-back did not match applied proposal content.",
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
