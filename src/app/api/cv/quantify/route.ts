/* ── POST /api/cv/quantify — 量化经历提取 ── */

import { callDeepSeekJson, parseJsonResponse, checkApiKey } from "@/lib/stream-utils";

export async function POST(request: Request) {
  const keyCheck = checkApiKey();
  if (!keyCheck.valid) return keyCheck.error;

  try {
    const body = await request.json();
    const { text } = body as { text: string };

    if (!text || text.trim().length < 10) {
      return new Response(
        JSON.stringify({ success: false, error: "输入文本太短" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const content = await callDeepSeekJson({
      messages: [
        {
          role: "system",
          content: `你是简历量化优化专家。从用户输入的经历描述中，找出可以量化的地方，生成量化版本。

要求：
- 不编造具体数字（可以写"提升了X%"这种格式让用户自己填）
- 识别隐含的量化维度（用户增长→可量化DAU/MAU，效率提升→可量化时间/成本，项目管理→可量化人数/预算）
- 每条给 2-3 个量化角度建议

返回 JSON：
{
  "results": [
    {
      "original": "我负责了用户增长",
      "quantified": "主导用户增长策略，DAU 从 X 提升到 Y（+Z%），月均获客成本降低 W%",
      "metric": "DAU / 获客成本 / 留存率"
    }
  ]
}
只用中文。`,
        },
        { role: "user", content: text.slice(0, 5000) },
      ],
      temperature: 0.4,
      max_tokens: 4000,
    });

    const parsed = parseJsonResponse(content);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          results: (parsed.results as Array<{
            original: string;
            quantified: string;
            metric: string;
          }>) || [],
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("CV quantify error:", message);
    return new Response(
      JSON.stringify({ success: false, error: `量化提取失败: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
