import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/server-db";
import { updateJobStatus } from "../../../../../lib/scan/orchestrator.mjs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { jobId } = await params;
    const body = await request.json();
    const newStatus = body?.status;

    if (!newStatus || !["new", "dismissed", "evaluated"].includes(newStatus)) {
      return NextResponse.json(
        { error: "Invalid status. Must be: new, dismissed, evaluated" },
        { status: 400 }
      );
    }

    const db = getDb();
    const result = updateJobStatus(db, parseInt(jobId), String(user.userId), newStatus);

    if (!result.success) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error("PATCH /api/scan/[jobId] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
