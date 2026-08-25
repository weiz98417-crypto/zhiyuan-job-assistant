import { getCurrentUser } from "@/lib/auth";
import {
  generateResumeDraftForAgent,
  ResumeGenerationInputError,
} from "@/lib/server/resume-generation-service";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json() as {
      jdText?: string;
      targetRole?: string;
      language?: string;
      referenceIds?: number[];
      requestKey?: string;
    };
    const result = await generateResumeDraftForAgent(
      { userId: user.userId },
      {
        jdText: String(body.jdText || ""),
        targetRole: body.targetRole,
        language: body.language,
        referenceIds: body.referenceIds,
        requestKey: body.requestKey || request.headers.get("Idempotency-Key") || undefined,
      },
      { signal: request.signal },
    );
    return Response.json({
      success: true,
      data: {
        ...result,
        optimizedSections: Object.fromEntries(result.drafts.map((draft) => [draft.sectionId, draft.content])),
        changes: result.drafts.map((draft) => ({
          section: draft.sectionId,
          type: "draft",
          reason: "已生成可选择的 JD 定制草稿，尚未覆盖正式简历",
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    if (/auth|登录|token/i.test(message)) {
      return Response.json({ success: false, error: "未登录" }, { status: 401 });
    }
    const status = error instanceof ResumeGenerationInputError ? 400 : 500;
    return Response.json({ success: false, error: `简历优化失败: ${message}` }, { status });
  }
}
