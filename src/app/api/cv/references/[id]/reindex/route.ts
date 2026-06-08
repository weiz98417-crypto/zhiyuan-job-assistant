import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { reindexReferenceResumeRecord } from "@/lib/reference-resume-vector";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return NextResponse.json({ success: false, error: "Invalid reference resume id" }, { status: 400 });
    }

    const resume = await getDataRepositories().referenceResumes.get(numId, user.userId);
    if (!resume) {
      return NextResponse.json({ success: false, error: "Reference resume not found" }, { status: 404 });
    }
    if (resume.user_id && resume.user_id !== user.userId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const indexing = await reindexReferenceResumeRecord(resume, user.userId);
    return NextResponse.json({ success: true, data: { id: numId, indexing } });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[cv/reference-reindex]", message);
    return NextResponse.json({ success: false, error: `Reindex failed: ${message}` }, { status: 500 });
  }
}
