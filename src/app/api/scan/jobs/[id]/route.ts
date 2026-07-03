import { NextRequest, NextResponse } from "next/server";
import { updateScanJobStatusForUser } from "@/lib/scan-data";
import { getCurrentScanUserId, isScanAuthError } from "@/lib/scan-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentScanUserId();

    const { id } = await params;
    const body = await request.json();
    const newStatus = body?.status;

    const validStatuses = ["new", "viewed", "saved", "evaluating", "evaluated", "dismissed"];
    if (!newStatus || !validStatuses.includes(newStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be: ${validStatuses.join(", ")}` },
        { status: 400 },
      );
    }

    const result = await updateScanJobStatusForUser(Number(id), userId, newStatus);
    if (!result.success) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (isScanAuthError(error)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error("PATCH /api/scan/jobs/[id] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
