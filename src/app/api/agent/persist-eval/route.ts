import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  persistJDEvaluation,
  PersistJDEvaluationVerificationError,
} from "@/lib/server/jd-evaluation-persistence";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json() as {
      company?: string;
      role?: string;
      overallScore?: number;
      archetype?: string;
      blocks?: unknown;
      keywords?: unknown;
      legitimacy?: string;
      date?: string;
      jdText?: string;
      reportNum?: number;
    };
    if (!body.company || !body.role) {
      return NextResponse.json({ success: false, error: "缺少公司或岗位信息" }, { status: 400 });
    }
    const result = await persistJDEvaluation({ userId: user.userId }, {
      company: body.company,
      role: body.role,
      overallScore: body.overallScore || 0,
      archetype: body.archetype,
      blocks: body.blocks,
      keywords: body.keywords,
      legitimacy: body.legitimacy,
      date: body.date,
      jdText: body.jdText,
      forceReportNum: body.reportNum,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof Error && (error.message === "Not authenticated" || error.message === "Invalid or expired token")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof PersistJDEvaluationVerificationError) {
      return NextResponse.json({ success: false, error: error.message, ...error.details }, { status: 500 });
    }
    console.error("[persist-eval] error:", error);
    return NextResponse.json(
      { success: false, error: `持久化失败: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 },
    );
  }
}
