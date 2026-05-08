import { NextResponse } from "next/server";
import { listReferenceResumes, searchReferenceResumes } from "@/lib/server-db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const limit = parseInt(searchParams.get("limit") || "20");

    let resumes;
    if (search.trim()) {
      resumes = searchReferenceResumes(search, limit);
      // Map to summary format (exclude sections_json and raw_text for list)
      const summaries = resumes.map((r) => ({
        id: r.id,
        name: r.name,
        source: r.source,
        tags: JSON.parse(r.tags || "[]"),
        notes: r.notes,
        created_at: r.created_at,
      }));
      return NextResponse.json({ success: true, data: summaries });
    }

    const list = listReferenceResumes();
    const data = list.map((r) => ({
      ...r,
      tags: JSON.parse(r.tags || "[]"),
    }));
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("List references error:", message);
    return NextResponse.json(
      { success: false, error: `查询失败: ${message}` },
      { status: 500 },
    );
  }
}
