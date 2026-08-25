import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  optimizeResumeSectionForAgent,
  ResumeOptimizationInputError,
} from "@/lib/server/resume-optimization-service";
import type { ResumeSectionId } from "@/lib/agent/resume-save-guard";

const SECTION_IDS = new Set<ResumeSectionId>(["summary", "experience", "projects", "education", "skills"]);

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json() as {
      sectionId?: string;
      intent?: string;
      operation?: string;
      effort?: number;
      enablePlaceholders?: boolean;
      fast?: boolean;
      roleDirection?: string;
      questionAnswers?: Array<{ question?: string; answer?: string }>;
      targetJD?: { role?: string; company?: string; keywords?: string[]; text?: string };
      userProfile?: Record<string, unknown>;
      referenceIds?: number[];
      jdText?: string;
      requestKey?: string;
    };
    const sectionId = String(body.sectionId || "") as ResumeSectionId;
    if (!SECTION_IDS.has(sectionId)) {
      return NextResponse.json({ success: false, error: "无效的简历板块" }, { status: 400 });
    }
    const instruction = [
      body.intent,
      body.roleDirection && body.roleDirection !== "auto" ? `岗位方向：${body.roleDirection}` : "",
      body.questionAnswers?.map((item) => `${item.question || "补充问题"}：${item.answer || ""}`).join("\n"),
      body.userProfile ? `用户画像：${JSON.stringify(body.userProfile).slice(0, 1200)}` : "",
    ].filter(Boolean).join("\n\n");
    const jdText = body.jdText || [
      body.targetJD?.role ? `岗位：${body.targetJD.role}` : "",
      body.targetJD?.company ? `公司：${body.targetJD.company}` : "",
      body.targetJD?.keywords?.length ? `关键词：${body.targetJD.keywords.join("、")}` : "",
      body.targetJD?.text || "",
    ].filter(Boolean).join("\n");
    const result = await optimizeResumeSectionForAgent(
      { userId: user.userId },
      {
        sectionId,
        instruction,
        operation: body.operation,
        effort: body.effort,
        enablePlaceholders: body.enablePlaceholders,
        fast: body.fast,
        roleDirection: body.roleDirection,
        questionAnswers: body.questionAnswers?.map((item) => ({
          question: item.question || "补充问题",
          answer: item.answer || "",
        })),
        targetJD: body.targetJD,
        userProfile: body.userProfile as Parameters<typeof optimizeResumeSectionForAgent>[1]["userProfile"],
        referenceIds: body.referenceIds,
        jdText,
        requestKey: body.requestKey || request.headers.get("Idempotency-Key") || undefined,
      },
      { signal: request.signal },
    );
    return NextResponse.json({
      success: true,
      data: {
        ...result,
        variants: result.variants.map((variant) => ({
          ...variant,
          placeholderCount: (variant.content.match(/\[XX(?::[^\]]*)?\]/g) || []).length,
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    if (/auth|登录|token/i.test(message)) {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    const status = error instanceof ResumeOptimizationInputError ? 400 : 500;
    return NextResponse.json({ success: false, error: `优化失败: ${message}` }, { status });
  }
}
