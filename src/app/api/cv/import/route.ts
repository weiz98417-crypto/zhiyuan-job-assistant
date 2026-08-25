import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { DocumentExtractionError } from "@/lib/server/document-extraction";
import {
  importResumeDocumentForAgent,
  importResumeTextForAgent,
  ResumeImportInputError,
} from "@/lib/server/resume-import-service";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const principal = { userId: user.userId };
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) throw new ResumeImportInputError("未上传文件");
      const data = await importResumeDocumentForAgent(principal, {
        buffer: Buffer.from(await file.arrayBuffer()),
        filename: file.name,
        mimeType: file.type,
      }, { signal: request.signal });
      return NextResponse.json({ success: true, data });
    }
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      const originalImages = Array.isArray(body.originalImages)
        ? body.originalImages.filter((image): image is string => typeof image === "string" && image.startsWith("data:image/"))
        : [];
      const data = await importResumeTextForAgent(principal, {
        text: typeof body.text === "string" ? body.text : "",
        source: typeof body.source === "string" ? body.source : "paste",
        originalImages,
      }, { signal: request.signal });
      return NextResponse.json({ success: true, data });
    }
    throw new ResumeImportInputError("请上传文件或粘贴简历文本");
  } catch (error) {
    if (error instanceof Error && (error.message === "Not authenticated" || error.message === "Invalid or expired token")) {
      return NextResponse.json({ success: false, error: "未登录或登录已失效，请重新登录后导入" }, { status: 401 });
    }
    if (error instanceof DocumentExtractionError) {
      return NextResponse.json({
        success: false,
        code: error.code,
        error: error.userMessage,
        diagnostics: error.diagnostics,
      }, { status: error.status });
    }
    if (error instanceof ResumeImportInputError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("CV import error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "导入失败" },
      { status: 500 },
    );
  }
}
