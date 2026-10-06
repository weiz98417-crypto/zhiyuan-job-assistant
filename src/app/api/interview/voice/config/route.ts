import { NextResponse } from "next/server";
import { getCurrentUser, verifyTokenVersion } from "@/lib/auth";
import { isVoiceConfigured } from "@/lib/server/mimo-voice";

/** 语音能力探测(spec 39 功能门禁):无 key 时前端不渲染任何语音入口。只回开关与音色,不回 key。 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    await verifyTokenVersion(user);
    return NextResponse.json({
      success: true,
      data: { enabled: isVoiceConfigured(), voice: process.env.MIMO_TTS_VOICE || "白桦" },
    });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
