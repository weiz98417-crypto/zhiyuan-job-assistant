import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { CvWriteConflictError, getDataRepositories } from "@/lib/data-repositories";

export async function GET(request?: Request) {
  try {
    const user = await getCurrentUser();
    const repositories = getDataRepositories();
    const [row, activeDocument] = await Promise.all([
      repositories.cv.get(user.userId),
      repositories.resumeDocuments.getActive(user.userId),
    ]);
    const data = row?.data_json ? parseObject(row.data_json) : {};
    if (!activeDocument) return NextResponse.json({ success: true, data });

    const versions = parseObject(data.versions);
    const existingVersion = parseObject(versions[activeDocument.version_id]);
    const sections = parseArray(activeDocument.sections_json);
    versions[activeDocument.version_id] = {
      ...existingVersion,
      id: activeDocument.version_id,
      label: activeDocument.label,
      sections,
      documentId: activeDocument.id,
      integrityStatus: parseObject(activeDocument.integrity_json).status || "needs_review",
    };
    data.activeVersion = activeDocument.version_id;
    data.versions = versions;
    data.resumeDocument = {
      id: activeDocument.id,
      versionId: activeDocument.version_id,
      status: activeDocument.status,
      contentHash: activeDocument.content_hash,
      integrity: parseObject(activeDocument.integrity_json),
    };

    const includeSource = request ? new URL(request.url).searchParams.get("includeSource") === "1" : false;
    if (includeSource) {
      const [artifact, chunks] = await Promise.all([
        repositories.resumeDocuments.getArtifact(activeDocument.id, user.userId),
        repositories.resumeDocuments.listChunks(activeDocument.id, user.userId),
      ]);
      data.resumeDocument = {
        ...parseObject(data.resumeDocument),
        sourceText: artifact?.raw_text || "",
        sourceArtifact: artifact ? {
          id: artifact.id,
          sourceType: artifact.source_type,
          filename: artifact.filename,
          mimeType: artifact.mime_type,
          sourceHash: artifact.source_hash,
          extraction: parseObject(artifact.extraction_json),
        } : null,
        chunks: chunks.map((chunk) => ({
          id: chunk.id,
          index: chunk.chunk_index,
          start: chunk.start_offset,
          end: chunk.end_offset,
          content: chunk.content,
          contentHash: chunk.content_hash,
        })),
      };
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

function parseObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

function parseArray(value: unknown): unknown[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();
    const data = body?.data && typeof body.data === "object" ? body.data : body;
    const expectedActiveVersion = typeof body?.expectedActiveVersion === "string" ? body.expectedActiveVersion : "";
    const expectedBaseHash = typeof body?.expectedBaseHash === "string" ? body.expectedBaseHash : "";
    const repositories = getDataRepositories();
    if (expectedActiveVersion && expectedBaseHash) {
      await repositories.cv.upsertIfCurrent(user.userId, data, {
        activeVersion: expectedActiveVersion,
        baseHash: expectedBaseHash,
      });
    } else {
      await repositories.cv.upsert(user.userId, data);
    }
    const readBack = await repositories.cv.get(user.userId);
    if (!readBack?.data_json) throw new Error("CV 写入后读回失败");
    return NextResponse.json({ success: true, data: JSON.parse(readBack.data_json) });
  } catch (err) {
    if (err instanceof CvWriteConflictError) {
      return NextResponse.json({
        success: false,
        code: "base_version_conflict",
        error: "简历已在其他页面或 Agent 中更新，已阻止旧页面覆盖新内容。请刷新后重试。",
        data: { currentVersion: err.currentVersion, currentHash: err.currentHash },
      }, { status: 409 });
    }
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
