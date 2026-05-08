import { checkApiKey } from "@/lib/stream-utils";
import { getRecommendations } from "@/lib/recommend";

export async function POST(request: Request) {
  const keyCheck = checkApiKey();
  if (!keyCheck.valid) return keyCheck.error;

  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(body.limit ?? 3, 5);

    const result = await getRecommendations(limit);

    return Response.json({
      success: true,
      data: result.recommendations,
      cached: result.cached,
      message: result.message,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Agent recommend error:", message);
    return Response.json(
      { success: false, error: `推荐生成失败: ${message}` },
      { status: 500 },
    );
  }
}
