import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enqueueEvaluatedScanJobForUser } from "@/lib/scan-data";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { url, company, title, jd_snippet } = body || {};

    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    // Validate URL format
    try { new URL(url); } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    const userId = String(user.userId);
    await enqueueEvaluatedScanJobForUser(userId, {
      url,
      company: company || "未知",
      title: title || "未知职位",
      jdSnippet: jd_snippet || "",
    });

    return NextResponse.json({
      success: true,
      data: { url, company, title, status: "enqueued" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error("POST /api/pipeline/enqueue error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
