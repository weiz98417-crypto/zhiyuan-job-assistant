import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const user = await getCurrentUser();
    const repos = getDataRepositories();
    const search = searchParams.get("search") || "";
    const limit = parseInt(searchParams.get("limit") || "20");

    let resumes;
    if (search.trim()) {
      resumes = await repos.referenceResumes.search(search, limit, user.userId);
      // Map to summary format (exclude sections_json and raw_text for list)
      const summaries = resumes.map((r) => ({
        id: r.id,
        name: r.name,
        source: r.source,
        tags: JSON.parse(r.tags || "[]"),
        notes: r.notes,
        roleCategory: r.role_category || "",
        visibility: r.visibility || "private",
        status: r.status || "active",
        qualityScore: Number(r.quality_score || 0),
        anonymized: Boolean(r.anonymized),
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));
      return NextResponse.json({ success: true, data: summaries });
    }

    const list = await repos.referenceResumes.list(user.userId);
    const data = list.map((r) => ({
      ...r,
      tags: JSON.parse(r.tags || "[]"),
      roleCategory: r.role_category || "",
      visibility: r.visibility || "private",
      status: r.status || "active",
      qualityScore: Number(r.quality_score || 0),
      anonymized: Boolean(r.anonymized),
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
