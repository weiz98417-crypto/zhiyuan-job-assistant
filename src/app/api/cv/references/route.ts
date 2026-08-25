import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAgentReadService } from "@/lib/agent/runtime/agent-read-service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const user = await getCurrentUser();
    const search = searchParams.get("search") || "";
    const limit = parseInt(searchParams.get("limit") || "20");
    const data = await getAgentReadService().listReferenceResumes(
      { userId: user.userId },
      { search, limit },
    );
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("List references error:", message);
    return NextResponse.json(
      { success: false, error: `查询失败: ${message}` },
      { status: 500 },
    );
  }
}
