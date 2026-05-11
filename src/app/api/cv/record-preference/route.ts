import { NextResponse } from "next/server";
import { recordPreference } from "@/lib/server-db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { section_id, variant_type, action, original_text, optimized_text, operation } = body as {
      section_id: string;
      variant_type: string;
      action: string;
      original_text?: string;
      optimized_text?: string;
      operation?: string;
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

    recordPreference({
      section_id,
      variant_type: variant_type || "",
      action,
      operation: operation || "",
      original_text,
      optimized_text,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Record preference error:", message);
    return NextResponse.json(
      { success: false, error: `记录偏好失败: ${message}` },
      { status: 500 },
    );
  }
}
