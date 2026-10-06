import { NextResponse } from "next/server";
import { getCurrentUser, verifyTokenVersion } from "@/lib/auth";
import { MimoVoiceUnavailableError, MimoVoiceUpstreamError, mimoAsr } from "@/lib/server/mimo-voice";

/** 语音 ASR 路由(spec 39):鉴权 → 整段转写(浏览器端 16k mono wav)。 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    await verifyTokenVersion(user);
    const body = await request.json().catch(() => ({})) as { audioBase64?: unknown; format?: unknown };
    const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64 : "";
    const format = body.format === "mp3" ? "mp3" : "wav";
    if (!audioBase64) {
      return NextResponse.json({ success: false, error: "audioBase64 不能为空" }, { status: 400 });
    }
    const text = await mimoAsr(audioBase64, format);
    return NextResponse.json({ success: true, data: { text } });
  } catch (error: unknown) {
    if (error instanceof MimoVoiceUnavailableError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }
    if (error instanceof MimoVoiceUpstreamError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("voice asr error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "语音识别失败" }, { status: 500 });
  }
}
