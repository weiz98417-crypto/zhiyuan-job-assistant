import { NextResponse } from "next/server";
import { getCurrentUser, verifyTokenVersion } from "@/lib/auth";
import { mapVoiceRouteError, mimoAsr } from "@/lib/server/mimo-voice";

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
    return mapVoiceRouteError(error);
  }
}
