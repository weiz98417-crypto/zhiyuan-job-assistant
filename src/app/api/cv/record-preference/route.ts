import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { recordOptimizationMemoryFeedback } from "@/lib/memory/feedback-promotion";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();
    const {
      section_id,
      variant_type,
      action,
      original_text,
      optimized_text,
      edited_text,
      operation,
      referenceMemory,
      roleCategory,
      targetJdId,
      taskType,
      feedbackText,
    } = body as {
      section_id: string;
      variant_type: string;
      action: string;
      original_text?: string;
      optimized_text?: string;
      edited_text?: string;
      operation?: string;
      roleCategory?: string;
      targetJdId?: number;
      taskType?: string;
      feedbackText?: string;
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

    if (!["accept", "accepted", "save", "saved", "reject", "rejected", "dismiss", "dismissed", "heavily_edit", "heavily_edited", "modified"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "action 必须是 accept/save/reject/dismiss/heavily_edit" },
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

    await recordOptimizationMemoryFeedback({
      userId: user.userId,
      action,
      referenceMemory,
      taskType: taskType || "cv_optimize",
      roleCategory,
      sectionId: section_id,
      operation,
      variantType: variant_type,
      targetJdId,
      originalText: original_text,
      optimizedText: optimized_text,
      editedText: edited_text,
      feedbackText,
    }).catch(() => undefined);

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
