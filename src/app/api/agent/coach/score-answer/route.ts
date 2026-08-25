import { NextResponse } from "next/server";
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
    if (!body.question?.trim() || !body.answer?.trim()) {
      return NextResponse.json(
        { success: false, error: "请提供 question（面试题）和 answer（回答文本）" },
        { status: 400 },
      );
    }
    const result = await scoreInterviewAnswerForAgent(
      { userId: user.userId },
      {
        question: body.question,
        answer: body.answer,
        mode: body.mode,
        context: body.context,
      },
      { signal: request.signal },
    );
    return NextResponse.json({
      success: true,
      data: {
        ...result.score,
        memoryContext: result.memoryContext,
        memoryWriteback: result.memoryWriteback,
        readBackVerified: result.memoryWriteback.readBackVerified,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    const status = /auth|登录|token/i.test(message) ? 401 : 500;
    return NextResponse.json({ success: false, error: `评分失败: ${message}` }, { status });
  }
}
