import { NextResponse } from "next/server";
import { loadModeDocument } from "@/lib/agent/knowledge/registry/loader";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mode: string }> }
) {
  const { mode } = await params;
  // Security: only allow known mode names
  const allowedModes = ["dingwei", "interview-prep", "apply", "jianzhi", "jianzhi-risk", "ofertas", "pipeline", "patterns", "followup", "scan", "pdf", "deep"];
  if (!allowedModes.includes(mode)) {
    return NextResponse.json({ success: false, error: "模式文件不存在" }, { status: 404 });
  }

  // Spec 25：modes 统一经注册表加载器读取（null=文件缺失，语义同旧 404）
  const content = loadModeDocument("zh", mode);
  if (content === null) {
    return NextResponse.json({ success: false, error: "模式文件不存在" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: { content } });
}
