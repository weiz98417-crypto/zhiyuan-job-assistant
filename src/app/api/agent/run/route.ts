import { NextResponse } from "next/server";

/**
 * M1 (ADR-0026): the directMode legacy loop is deleted. The durable worker is
 * the only production execution owner; callers must use /api/agent/runs.
 */
export async function POST(request: Request) {
  void request;
  return NextResponse.json(
    { success: false, error: "旧 Agent 执行入口已关闭，请使用 durable worker 的 /api/agent/runs。" },
    { status: 410 },
  );
}
