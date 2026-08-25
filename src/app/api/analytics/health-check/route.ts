import { getCurrentUser } from "@/lib/auth";
import { checkApiKey } from "@/lib/stream-utils";
import {
  analyzePipelineHealth,
  type PipelineHealthInput,
  type PipelineHealthThresholds,
} from "@/lib/server/pipeline-health-service";

export async function POST(request: Request) {
  try {
    await getCurrentUser();
  } catch {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const keyCheck = checkApiKey();
  if (!keyCheck.valid) return keyCheck.error;
  try {
    const body = await request.json() as {
      pipeline?: PipelineHealthInput;
      thresholds?: Partial<PipelineHealthThresholds>;
    };
    if (!body.pipeline) {
      return Response.json({ success: false, error: "缺少 Pipeline 数据" }, { status: 400 });
    }
    const data = await analyzePipelineHealth(body.pipeline, body.thresholds, request.signal);
    return Response.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Health check error:", message);
    return Response.json({ success: false, error: `健康检查失败: ${message}` }, { status: 500 });
  }
}
