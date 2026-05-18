/* ── POST /api/analytics/health-check — Pipeline 健康度检查 ── */

import { getCurrentUser } from "@/lib/auth";
import { callDeepSeekJson, parseJsonResponse, checkApiKey } from "@/lib/stream-utils";

export async function POST(request: Request) {
  let user;
  try { user = await getCurrentUser(); } catch { return Response.json({ success: false, error: "Unauthorized" }, { status: 401 }); }

  const keyCheck = checkApiKey();
  if (!keyCheck.valid) return keyCheck.error;

  try {
    const body = await request.json();
    const { pipeline, thresholds } = body as {
      pipeline: {
        applications: {
          company: string;
          role: string;
          status: string;
          daysSinceApplied: number;
          daysSinceLastActivity: number;
        }[];
      };
      thresholds?: {
        evalWarningPct: number;   // Default 70
        evalDangerPct: number;    // Default 80
        zeroReplyCount: number;   // Default 5
        staleDays: number;        // Default 14
      };
    };

    const t = thresholds ?? { evalWarningPct: 70, evalDangerPct: 80, zeroReplyCount: 5, staleDays: 14 };

    if (!pipeline?.applications?.length) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            status: "gray",
            score: 0,
            issues: ["暂无投递数据，开始你的第一个申请吧"],
            suggestions: ["去评估一个 JD，开启求职之旅"],
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const appsStr = pipeline.applications
      .map(
        (a) =>
          `${a.company} - ${a.role}：${a.status}（投递 ${a.daysSinceApplied} 天，上次活动 ${a.daysSinceLastActivity} 天前）`,
      )
      .join("\n");

    const content = await callDeepSeekJson({
      messages: [
        {
          role: "system",
          content: `你是 Pipeline 健康度分析师。评估用户的求职 Pipeline 健康状态。

检查维度：
- 漏斗分布：申请在各阶段的分布是否健康（应有足够顶部和中部）
- 转化率：投递→回复→面试的转化是否正常
- 停滞风险：是否有长期未更新的申请
- 方向集中度：是否过度集中在某一类岗位

告警阈值：
- 初筛(Evaluated)阶段占比 ≥ ${t.evalWarningPct}% 触发黄色警告
- 初筛(Evaluated)阶段占比 ≥ ${t.evalDangerPct}% 触发红色告警
- 某方向连续 ${t.zeroReplyCount}+ 次零回复触发红色告警
- 申请超过 ${t.staleDays} 天无活动视为停滞

返回 JSON：
{
  "status": "green",
  "score": 80,
  "issues": ["3 份申请超过 14 天无回复，建议跟进"],
  "suggestions": ["建议暂停新投递，集中跟进现有 Pipeline"]
}
status 取值：
- green: 健康，漏斗分布合理，转化正常
- yellow: 需要注意，存在一定风险（如回复率偏低或停滞申请较多）
- red: 警告，存在严重问题（如回复率极低或大量长期无回复）
- gray: 无数据
score: 0-100 综合评分
issues: 发现的具体问题（1-3 条）
suggestions: 改进建议（1-3 条）
只用中文。`,
        },
        { role: "user", content: `Pipeline 状态：\n${appsStr}` },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const parsed = parseJsonResponse(content);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          status: (parsed.status as string) || "gray",
          score: (parsed.score as number) || 0,
          issues: (parsed.issues as string[]) || [],
          suggestions: (parsed.suggestions as string[]) || [],
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Health check error:", message);
    return new Response(
      JSON.stringify({ success: false, error: `健康检查失败: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
