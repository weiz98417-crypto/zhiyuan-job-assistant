import { NextResponse } from "next/server";
import {
  evaluateJobDescription,
  type JDEvaluationUserProfile,
} from "@/lib/server/jd-evaluation-service";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      jdText?: string;
      language?: "zh" | "en";
      cvText?: string;
      userProfile?: JDEvaluationUserProfile;
      targetCompany?: string;
    };
    if (!body.jdText || body.jdText.trim().length < 50) {
      return NextResponse.json(
        { success: false, error: "JD 文本太短，请粘贴完整的职位描述（至少 50 字）" },
        { status: 400 },
      );
    }
    const result = await evaluateJobDescription({
      jdText: body.jdText,
      language: body.language,
      cvText: body.cvText,
      userProfile: body.userProfile,
      targetCompany: body.targetCompany,
      signal: request.signal,
    });
    return NextResponse.json({ success: true, data: { reportNum: 0, ...result } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Evaluate API error:", message);
    return NextResponse.json({ success: false, error: `评估失败: ${message}` }, { status: 500 });
  }
}
