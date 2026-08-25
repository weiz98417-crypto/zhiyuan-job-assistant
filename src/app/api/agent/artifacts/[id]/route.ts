import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readExportArtifact } from "@/lib/server/export-artifact-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    const artifact = await readExportArtifact({ userId: user.userId }, id);
    if (!artifact) return NextResponse.json({ success: false, error: "Artifact not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(artifact.bytes), {
      headers: {
        "Content-Type": artifact.record.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(artifact.record.filename)}`,
        "Content-Length": String(artifact.record.size),
        "X-Content-SHA256": artifact.record.sha256,
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}
