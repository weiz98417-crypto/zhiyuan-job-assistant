import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  handleInterviewSessionTurnForAgent,
  InterviewSessionNotFoundError,
  type InterviewSessionTurnInput,
} from "@/lib/server/interview-analysis-service";

export async function POST(request: Request) {
  try {
    let user;
    try {
      user = await getCurrentUser();
    } catch {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json() as InterviewSessionTurnInput;
    const data = await handleInterviewSessionTurnForAgent(
      { userId: user.userId },
      {
        ...body,
        requestKey: request.headers.get("idempotency-key") || body.requestKey,
      },
      { signal: request.signal },
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof InterviewSessionNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { success: false, error: `面试引擎错误: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 },
    );
  }
}
