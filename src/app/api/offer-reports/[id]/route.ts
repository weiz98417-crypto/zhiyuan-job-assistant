import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    const { id } = await context.params;
    const reportId = Number(id);
    if (!Number.isFinite(reportId)) {
      return NextResponse.json({ success: false, error: "invalid report id" }, { status: 400 });
    }

    const row = await getDataRepositories().offerReports.get(reportId, user.userId);
    if (!row) return NextResponse.json({ success: false, error: "offer report not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    const { id } = await context.params;
    const reportId = Number(id);
    if (!Number.isFinite(reportId)) {
      return NextResponse.json({ success: false, error: "invalid report id" }, { status: 400 });
    }

    const result = await getDataRepositories().offerReports.delete(reportId, user.userId);
    if (!result) return NextResponse.json({ success: false, error: "offer report not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
