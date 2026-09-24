import { NextResponse } from "next/server";

export async function POST(request: Request) {
  void request;
  return NextResponse.json(
    { success: false, error: "MCP 旧代理入口已关闭，请由 durable worker 执行受治理工具。" },
    { status: 410 },
  );
}
