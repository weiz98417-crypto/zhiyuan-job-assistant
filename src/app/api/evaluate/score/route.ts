/* ── POST /api/evaluate/score — 非流式匹配度打分 ── */

import { callDeepSeekJson, parseJsonResponse, checkApiKey } from "@/lib/stream-utils";

export async function POST(request: Request) {
  const keyCheck = checkApiKey();
  if (!keyCheck.valid) return keyCheck.error;

  try {
    const body = await request.json();
    const { jdText, cvText } = body as { jdText: string; cvText?: string };

    if (!jdText || jdText.trim().length < 50) {
      return new Response(
        JSON.stringify({ success: false, error: "JD 文本太短" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const content = await callDeepSeekJson({
      messages: [
        {
          role: "system",
          content: `你是简历匹配度评估专家。基于 JD 和用户简历，输出五维雷达图评分（0-100）。

返回 JSON：
{
  "skillMatch": 75,
  "experienceMatch": 68,
  "salaryMatch": 60,
  "growthSpace": 80,
  "riskIndex": 35,
  "summary": "一句话总结匹配情况"
}
${!cvText ? "如果没有简历数据，基于 JD 本身评估，技能/经验给基准分 50。" : ""}
只用中文。`,
        },
        {
          role: "user",
          content: `JD：\n${jdText.slice(0, 6000)}\n\n${cvText ? `简历：\n${cvText.slice(0, 4000)}` : ""}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 1000,
    });

    const parsed = parseJsonResponse(content);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          skillMatch: (parsed.skillMatch as number) || 50,
          experienceMatch: (parsed.experienceMatch as number) || 50,
          salaryMatch: (parsed.salaryMatch as number) || 50,
          growthSpace: (parsed.growthSpace as number) || 50,
          riskIndex: (parsed.riskIndex as number) || 50,
          summary: (parsed.summary as string) || "",
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Evaluate score error:", message);
    return new Response(
      JSON.stringify({ success: false, error: `打分失败: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
