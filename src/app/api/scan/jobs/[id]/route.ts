import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateScanJobStatusForUser } from "@/lib/scan-data";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const newStatus = body?.status;

    const validStatuses = ["new", "viewed", "saved", "evaluating", "evaluated", "dismissed"];
    if (!newStatus || !validStatuses.includes(newStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await updateScanJobStatusForUser(parseInt(id), String(user.userId), newStatus);

    if (!result.success) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error("PATCH /api/scan/jobs/[id] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
