import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { ResumeEditProposalApplyError, resumeEditProposalToDTO } from "@/lib/agent/resume-edit-proposals";

function statusForApplyError(code: ResumeEditProposalApplyError["code"]): number {
  if (code === "proposal_not_found") return 404;
  if (code === "proposal_not_pending") return 409;
  return 400;
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    const { id } = await context.params;
    const repos = getDataRepositories();
    const discarded = await repos.resumeEditProposals.discard(id, user.userId);
    const readBack = await repos.resumeEditProposals.get(id, user.userId);
    const readBackVerified = readBack?.status === "discarded";

    return NextResponse.json({
      success: readBackVerified,
      data: {
        proposal: resumeEditProposalToDTO(readBack || discarded),
        readBackVerified,
      },
      error: readBackVerified ? undefined : "Proposal discard read-back did not match expected status.",
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
