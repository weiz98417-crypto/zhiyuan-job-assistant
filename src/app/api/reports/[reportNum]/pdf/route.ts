import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readExportArtifact } from "@/lib/server/export-artifact-service";
import { createReportPdfArtifact } from "@/lib/server/report-pdf-service";

export async function GET(_request: Request, { params }: { params: Promise<{ reportNum: string }> }) {
  try {
    const { reportNum } = await params;
    const user = await getCurrentUser();
    const principal = { userId: user.userId };
    const artifact = await createReportPdfArtifact(principal, Number(reportNum));
    const readBack = await readExportArtifact(principal, artifact.artifactId);
    if (!readBack) {
      return NextResponse.json(
        { success: false, error: "PDF 生成后校验失败，已阻止空文件下载" },
        { status: 500 },
      );
    }
    return new NextResponse(new Uint8Array(readBack.bytes), {
      headers: {
        "Content-Type": artifact.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(artifact.filename)}`,
        "Content-Length": String(artifact.size),
        "X-Content-SHA256": artifact.sha256,
        "X-Agent-Artifact-Id": artifact.artifactId,
      },
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Not authenticated" || error.message === "Invalid or expired token")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "报告不存在") {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json({ success: false, error: `PDF 生成失败: ${message}` }, { status: 500 });
  }
}
