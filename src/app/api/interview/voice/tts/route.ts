import { NextResponse } from "next/server";
import { getCurrentUser, verifyTokenVersion } from "@/lib/auth";
import { MimoVoiceUnavailableError, MimoVoiceUpstreamError, mimoTts } from "@/lib/server/mimo-voice";

/** 语音 TTS 路由(spec 39):鉴权 → 按句合成(mp3 base64,LRU 缓存);key 不出服务端。 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    await verifyTokenVersion(user);
    const body = await request.json().catch(() => ({})) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) {
      return NextResponse.json({ success: false, error: "text 不能为空" }, { status: 400 });
    }
    const result = await mimoTts(text);
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    if (error instanceof MimoVoiceUnavailableError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }
    if (error instanceof MimoVoiceUpstreamError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("voice tts error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "语音合成失败" }, { status: 500 });
  }
}
