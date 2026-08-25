import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { generateInterviewQuestionsForAgent } from "@/lib/server/interview-analysis-service";
import type { CoachMode } from "@/types";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json() as {
      jdText?: string;
      cvText?: string;
      company?: string;
      role?: string;
      mode?: CoachMode;
      count?: number;
    };
    const result = await generateInterviewQuestionsForAgent(
      { userId: user.userId },
      body,
      { signal: request.signal },
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    const status = /auth|登录|token/i.test(message) ? 401 : 500;
    return NextResponse.json({ success: false, error: `出题失败: ${message}` }, { status });
  }
}
