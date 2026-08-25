import { NextResponse } from "next/server";
import { searchWeb } from "@/lib/server/external-agent-service";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query) {
    return NextResponse.json({ success: false, error: "缺少搜索关键词" }, { status: 400 });
  }
  try {
    const result = await searchWeb(query, request.signal);
    return NextResponse.json({ success: true, data: result.text, sources: result.sources });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "搜索失败",
    }, { status: 500 });
  }
}
