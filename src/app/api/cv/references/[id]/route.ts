import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import {
  buildReferenceResumeRawText,
  normalizeReferenceVisibility,
  normalizeRoleCategory,
  redactReferenceResumeText,
  reindexReferenceResumeRecord,
  scoreReferenceResumeQuality,
} from "@/lib/reference-resume-vector";
import { stableHash } from "@/lib/memory/vector-memory";

interface CVSection {
  id: string;
  title: string;
  content: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      return NextResponse.json({ success: false, error: "无效 ID" }, { status: 400 });
    }

    const resume = await getDataRepositories().referenceResumes.get(numId, user.userId);
    if (!resume) {
      return NextResponse.json({ success: false, error: "参考简历不存在" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: resume.id,
        name: resume.name,
        source: resume.source,
        sections: JSON.parse(resume.sections_json || "[]"),
        tags: JSON.parse(resume.tags || "[]"),
        notes: resume.notes,
        roleCategory: resume.role_category || "",
        visibility: resume.visibility || "private",
        status: resume.status || "active",
        qualityScore: Number(resume.quality_score || 0),
        anonymized: Boolean(resume.anonymized),
        created_at: resume.created_at,
        updated_at: resume.updated_at,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json(
      { success: false, error: `查询失败: ${message}` },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      return NextResponse.json({ success: false, error: "无效 ID" }, { status: 400 });
    }

    const body = await request.json();
    const { name, sections, tags, notes, roleCategory, visibility, status } = body as {
      name?: string;
      sections?: CVSection[];
      tags?: string[];
      notes?: string;
      roleCategory?: string;
      visibility?: string;
      status?: string;
    };

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (notes !== undefined) updates.notes = notes;
    if (tags !== undefined) updates.tags = JSON.stringify(tags);
    if (roleCategory !== undefined) updates.role_category = normalizeRoleCategory(roleCategory);
    if (visibility !== undefined) updates.visibility = normalizeReferenceVisibility(visibility);
    if (status !== undefined) updates.status = status;
    if (sections !== undefined) {
      updates.sections_json = JSON.stringify(sections);
      const rawText = buildReferenceResumeRawText(sections);
      const qualityScore = scoreReferenceResumeQuality({ rawText, sections });
      updates.raw_text = rawText;
      updates.quality_score = qualityScore;
      updates.source_hash = stableHash(rawText);
      if (visibility !== undefined && normalizeReferenceVisibility(visibility) !== "private") {
        updates.shared_text_redacted = redactReferenceResumeText(rawText);
        updates.anonymized = true;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "无更新内容" }, { status: 400 });
    }

    const ok = await getDataRepositories().referenceResumes.update(numId, updates, user.userId);
    if (!ok) {
      return NextResponse.json({ success: false, error: "参考简历不存在" }, { status: 404 });
    }

    const latest = await getDataRepositories().referenceResumes.get(numId, user.userId);
    if (latest) {
      await reindexReferenceResumeRecord(latest, user.userId);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json(
      { success: false, error: `更新失败: ${message}` },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      return NextResponse.json({ success: false, error: "无效 ID" }, { status: 400 });
    }

    const deleted = await getDataRepositories().referenceResumes.delete(numId, user.userId);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "参考简历不存在" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { id: numId } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json(
      { success: false, error: `删除失败: ${message}` },
      { status: 500 },
    );
  }
}
