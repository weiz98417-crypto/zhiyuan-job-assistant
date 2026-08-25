import { getCurrentUser } from "@/lib/auth";
import { scoreInterviewAnswerForAgent } from "@/lib/server/interview-analysis-service";
import type { CoachMode } from "@/types";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json() as {
      question?: string;
      answer?: string;
      mode?: CoachMode;
      context?: string;
    };
    if (!body.answer || body.answer.trim().length < 10) {
      return Response.json({ success: false, error: "请提供面试回答（至少 10 字）" }, { status: 400 });
    }
    const result = await scoreInterviewAnswerForAgent(
      { userId: user.userId },
      {
        question: body.question?.trim() || "请评价这段面试回答的表达质量",
        answer: body.answer,
        mode: body.mode,
        context: body.context,
      },
      { signal: request.signal },
    );
    return Response.json({
      success: true,
      data: {
        ...result.score,
        memoryWriteback: result.memoryWriteback,
        readBackVerified: result.memoryWriteback.readBackVerified,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    const status = /auth|登录|token/i.test(message) ? 401 : 500;
    return Response.json({ success: false, error: `评分失败: ${message}` }, { status });
  }
}
