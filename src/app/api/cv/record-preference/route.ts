import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { recordReferenceResumeUsage } from "@/lib/reference-resume-vector";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();
    const { section_id, variant_type, action, original_text, optimized_text, operation, referenceMemory } = body as {
      section_id: string;
      variant_type: string;
      action: string;
      original_text?: string;
      optimized_text?: string;
      operation?: string;
      referenceMemory?: {
        snippetIds?: number[];
        referenceResumeIds?: number[];
        patternMemoryIds?: number[];
      };
    };

    if (!section_id || !action) {
      return NextResponse.json(
        { success: false, error: "缺少必填参数 section_id / action" },
        { status: 400 },
      );
    }

    if (!["accept", "reject"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "action 必须为 accept 或 reject" },
        { status: 400 },
      );
    }

    await getDataRepositories().preferences.record({
      section_id,
      variant_type: variant_type || "",
      action,
      operation: operation || "",
      original_text,
      optimized_text,
    }, user.userId);

    const referenceResumeIds = Array.isArray(referenceMemory?.referenceResumeIds)
      ? [...new Set(referenceMemory.referenceResumeIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
      : [];
    if (referenceResumeIds.length > 0) {
      await Promise.all(referenceResumeIds.map((referenceResumeId) => recordReferenceResumeUsage({
        referenceResumeId,
        userId: user.userId,
        taskType: "cv_optimize",
        accepted: action === "accept",
        feedback: `${action}:${variant_type || ""}`,
        metadata: {
          sectionId: section_id,
          operation: operation || "",
          snippetIds: referenceMemory?.snippetIds || [],
          patternMemoryIds: referenceMemory?.patternMemoryIds || [],
        },
      }).catch(() => undefined)));
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    if (error instanceof Error && error.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    console.error("Record preference error:", message);
    return NextResponse.json(
      { success: false, error: `记录偏好失败: ${message}` },
      { status: 500 },
    );
  }
}
