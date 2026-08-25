import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { generateInterviewQuestionsForAgent } from "@/lib/server/interview-analysis-service";
import type { InterviewQuestion } from "@/types";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json() as {
      company?: string;
      role?: string;
      archetype?: string;
      category?: InterviewQuestion["category"] | "all";
      count?: number;
    };
    if (!body.company?.trim() || !body.role?.trim()) {
      return NextResponse.json({ success: false, error: "请提供公司和岗位名称" }, { status: 400 });
    }
    const categories = body.category && body.category !== "all"
      ? [body.category]
      : ["behavioral", "technical", "case-study", "culture"] as InterviewQuestion["category"][];
    const perCategory = Math.max(1, Math.min(Number(body.count) || 5, 5));
    const result = await generateInterviewQuestionsForAgent(
      { userId: user.userId },
      {
        company: body.company,
        role: body.role,
        count: body.category === "all" || !body.category ? perCategory * categories.length : perCategory,
        categories,
        additionalContext: body.archetype ? `候选人 Archetype：${body.archetype}` : undefined,
      },
      { signal: request.signal },
    );
    return NextResponse.json({ success: true, data: { questions: result.questions } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    const status = /auth|登录|token/i.test(message) ? 401 : 500;
    return NextResponse.json({ success: false, error: `生成失败: ${message}` }, { status });
  }
}
