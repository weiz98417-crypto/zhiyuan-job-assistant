import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { DocumentExtractionError, extractResumeDocument } from "@/lib/server/document-extraction";

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    await getCurrentUser();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.type !== "application/pdf") {
      return NextResponse.json({ success: false, error: "请上传 PDF 文件" }, { status: 400 });
    }
    if (file.size === 0 || file.size > MAX_DOCUMENT_BYTES) {
      return NextResponse.json({ success: false, error: "PDF 文件大小需在 5MB 以内" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.subarray(0, 4).toString("ascii") !== "%PDF") {
      return NextResponse.json({ success: false, error: "PDF 文件格式无效" }, { status: 400 });
    }
    const result = await extractResumeDocument({ buffer, filename: file.name, ext: "pdf" });
    if (!result.text.trim()) {
      return NextResponse.json({ success: false, error: "PDF 没有可读取的文字，请粘贴正文继续" }, { status: 422 });
    }
    return NextResponse.json({ success: true, data: { text: result.text, method: result.method } });
  } catch (error) {
    if (error instanceof Error && (error.message === "Not authenticated" || error.message === "Invalid or expired token")) {
      return NextResponse.json({ success: false, error: "请重新登录后继续" }, { status: 401 });
    }
    if (error instanceof DocumentExtractionError) {
      return NextResponse.json({ success: false, error: error.userMessage, code: error.code }, { status: error.status });
    }
    console.error("[agent-document-extract] failed:", error);
    return NextResponse.json({ success: false, error: "PDF 读取失败，请粘贴文字继续" }, { status: 500 });
  }
}
