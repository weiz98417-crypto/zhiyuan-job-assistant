/* ── POST /api/analytics/weekly-report — AI 生成周报 ── */

import { callDeepSeekJson, parseJsonResponse, checkApiKey } from "@/lib/stream-utils";

export async function POST(request: Request) {
  const keyCheck = checkApiKey();
  if (!keyCheck.valid) return keyCheck.error;

  try {
    const body = await request.json();
    const { stats } = body as {
      stats: {
        period: { start: string; end: string };
        applications: { company: string; role: string; status: string; score: number }[];
        interviews: { company: string; date: string; format?: string }[];
        offerCount: number;
      };
    };

    const appsStr = (stats.applications || [])
      .map((a) => `${a.company} - ${a.role}（${a.status}，${a.score}分）`)
      .join("\n");
    const interviewsStr = (stats.interviews || [])
      .map((i) => `${i.company} ${i.date}${i.format ? ` (${i.format})` : ""}`)
      .join("\n");

    const applied = stats.applications.filter((a) => a.status !== "skip" && a.status !== "discarded").length;
    const passed = stats.applications.filter((a) =>
      ["responded", "interview", "offer"].includes(a.status),
    ).length;
    const passRate = applied > 0 ? Math.round((passed / applied) * 100) : 0;

    const content = await callDeepSeekJson({
      messages: [
        {
          role: "system",
          content: `你是求职数据分析师。根据用户提供的投递和面试数据，生成一份温暖、有洞察力的中文周报。

返回 JSON：
{
  "stats": {
    "totalApplications": 5,
    "passRate": 40,
    "interviewsScheduled": 2,
    "offersReceived": 0
  },
  "trends": {
    "direction": "上升/平稳/下降",
    "analysis": "一句话趋势分析"
  },
  "aiCommentary": "本周你的简历回复率高于平均水平...",
  "encouragement": "求职是马拉松不是短跑，保持节奏..."
}
aiCommentary 应包含：
- 投递效率分析（回复率/通过率对比平均）
- 方向建议（哪个方向回复最好）
- 具体可操作的改进建议
encouragement 是一句温暖的鼓励语，不要太鸡汤。
只用中文。`,
        },
        {
          role: "user",
          content: `统计周期：${stats.period.start} 至 ${stats.period.end}
本周新增申请：${applied} 份
通过筛选：${passed} 份（${passRate}%）
面试安排：${stats.interviews.length} 场
Offer：${stats.offerCount} 个

申请详情：
${appsStr || "无数据"}

面试：
${interviewsStr || "无面试"}`,
        },
      ],
      temperature: 0.6,
      max_tokens: 4000,
    });

    const parsed = parseJsonResponse(content);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          period: stats.period,
          stats: parsed.stats || {},
          trends: parsed.trends || {},
          aiCommentary: (parsed.aiCommentary as string) || "",
          encouragement: (parsed.encouragement as string) || "求职是场马拉松，保持节奏，每一步都算数。",
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Weekly report error:", message);
    return new Response(
      JSON.stringify({ success: false, error: `周报生成失败: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
