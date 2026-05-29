import { NextResponse } from "next/server";
import { getReferenceResume, deleteReferenceResume, updateReferenceResume } from "@/lib/server-db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const numId = parseInt(id);
    if (isNaN(numId)) {
      return NextResponse.json({ success: false, error: "无效 ID" }, { status: 400 });
    }

    const resume = getReferenceResume(numId);
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
        created_at: resume.created_at,
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
    const numId = parseInt(id);
    if (isNaN(numId)) {
      return NextResponse.json({ success: false, error: "无效 ID" }, { status: 400 });
    }

    const body = await request.json();
    const { name, sections, tags, notes } = body as {
      name?: string;
      sections?: { id: string; title: string; content: string }[];
      tags?: string[];
      notes?: string;
    };

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (notes !== undefined) updates.notes = notes;
    if (tags !== undefined) updates.tags = JSON.stringify(tags);
    if (sections !== undefined) {
      updates.sections_json = JSON.stringify(sections);
      // Rebuild raw_text for FTS5 index
      updates.raw_text = sections
        .filter(s => s.content?.trim())
        .map(s => `【${s.title}】\n${s.content}`)
        .join("\n\n");
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "无更新内容" }, { status: 400 });
    }

    const ok = updateReferenceResume(numId, updates as Parameters<typeof updateReferenceResume>[1]);
    if (!ok) {
      return NextResponse.json({ success: false, error: "参考简历不存在" }, { status: 404 });
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
    const numId = parseInt(id);
    if (isNaN(numId)) {
      return NextResponse.json({ success: false, error: "无效 ID" }, { status: 400 });
    }

    const deleted = deleteReferenceResume(numId);
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
