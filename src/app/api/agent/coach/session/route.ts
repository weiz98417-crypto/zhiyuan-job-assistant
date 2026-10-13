import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
export async function POST(_request: Request) {
  try {
    await getCurrentUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    success: false,
    error: "面试状态与对话由 Agent Worker 统一维护，请通过 /api/agent/runs 提交面试任务。",
  }, { status: 422 });
}
