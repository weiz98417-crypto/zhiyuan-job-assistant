/**
 * Server-side file reader for the native read_file agent tool.
 *
 * Modeled after Cursor Agent's read_file: server-side execution,
 * path whitelisting, encoding corruption detection, mandatory output
 * capping. The agent never reads raw filesystem directly.
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAgentReadService } from "@/lib/agent/runtime/agent-read-service";

export async function GET(request: Request) {
  try {
    await getCurrentUser();
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("path");

    if (!filePath) {
      return NextResponse.json({
        success: false,
        error: "缺少 path 参数",
        errorCategory: "need_user_input",
      });
    }

    const data = await getAgentReadService().readProjectFile(filePath);

    return NextResponse.json({
      success: true,
      data,
      errorCategory: "ok",
    });

  } catch (err) {
    if (err instanceof Error && (err.message === "Not authenticated" || err.message === "Invalid or expired token")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({
      success: false,
      error: `读取失败: ${err instanceof Error ? err.message : "未知错误"}`,
      errorCategory: "permanent",
    });
  }
}
