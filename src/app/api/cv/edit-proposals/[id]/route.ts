import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { resumeEditProposalToDTO } from "@/lib/agent/resume-edit-proposals";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    const { id } = await context.params;
    const row = await getDataRepositories().resumeEditProposals.get(id, user.userId);
    if (!row) return NextResponse.json({ success: false, error: "提案不存在" }, { status: 404 });
    return NextResponse.json({ success: true, data: resumeEditProposalToDTO(row) });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
