import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

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

  const path = resolve(process.cwd(), "..", "modes", "zh", `${mode}.md`);
  if (!existsSync(path)) {
    return NextResponse.json({ success: false, error: "模式文件不存在" }, { status: 404 });
  }

  try {
    const content = readFileSync(path, "utf-8");
    return NextResponse.json({ success: true, data: { content } });
  } catch {
    return NextResponse.json({ success: false, error: "读取模式文件失败" }, { status: 500 });
  }
}
