/* ── POST /api/interview/score — 回答评分 ── */

import { callDeepSeekJson, parseJsonResponse, checkApiKey } from "@/lib/stream-utils";
import type { CoachMode } from "@/types";
import { COACH_MODES } from "@/types";

export async function POST(request: Request) {
  const keyCheck = checkApiKey();
  if (!keyCheck.valid) return keyCheck.error;

  try {
    const body = await request.json();
    const { answer, mode } = body as {
      answer: string;
      mode?: CoachMode;
    };

    if (!answer || answer.trim().length < 10) {
      return new Response(
        JSON.stringify({ success: false, error: "请提供面试回答（至少 10 字）" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Scoring weights by mode
    const weightHints: Record<string, string> = {
      "project-review": "评分侧重「数据支撑」和「复盘深度」。亮点突出权重高。",
      "behavioral": "评分侧重「结构完整度」和「具体程度」。STAR 框架是否完整。",
      "scenario": "评分侧重「结构完整度」和「逻辑清晰度」。方案是否有多个可能性。",
      "structured-sme": "评分侧重「具体程度」和「稳定性」。是否展示了对业务的理解和即战力。",
      "founder": "评分侧重「多面手能力」和「创业心态」。是否展示了灵活性和对业务的思考。",
      "stability": "评分弱化「亮点突出」、强化「稳重得体」。关注是否表现出服从意识和长期规划。",
    };

    const modeInfo = mode ? COACH_MODES[mode] : null;
    const modeBlock = mode && weightHints[mode]
      ? `\n面试模式：${modeInfo?.label}。${weightHints[mode]}`
      : "";

    const content = await callDeepSeekJson({
      messages: [
        {
          role: "system",
          content: `你是资深面试评分专家。对用户的回答进行四维度评分（1-5 分）。

评分维度：
- structure: 结构完整度（是否有清晰的开头-主体-结尾，逻辑是否通顺）
- specificity: 具体程度（是否有具体的案例、数据、细节，而不是泛泛而谈）
- highlight: 亮点突出（是否展示了自己的独特价值和核心能力）
- timing: 时间控制（预估这段回答在面试中需要多长时间，是否可能超时或过于简略）
${modeBlock}

对于 >300 字的长回答，额外提供 segmentFeedback：分段标注每段是"good"（这段很好）、"expand"（可以展开）、还是"compress"（建议压缩）。

返回 JSON：
{
  "dimensions": { "structure": 4, "specificity": 3, "highlight": 4, "timing": 3 },
  "overall": 3.5,
  "suggestions": ["建议补充量化数据来支撑观点", "开头可以更简洁，直接进入核心"],
  "segmentFeedback": [
    {"text": "在一开始的时候...", "rating": "good"}
  ]
}
overall 是四维度平均分。suggestions 给出 2-3 条具体可操作的改进建议。
segmentFeedback 仅回答 >300 字时提供，否则返回空数组。
只用中文。`,
        },
        { role: "user", content: answer.slice(0, 5000) },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });

    const parsed = parseJsonResponse(content);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          dimensions: (parsed.dimensions as Record<string, number>) || {},
          overall: (parsed.overall as number) || 0,
          suggestions: (parsed.suggestions as string[]) || [],
          segmentFeedback: (parsed.segmentFeedback as Array<{
            text: string;
            rating: string;
          }>) || [],
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Interview score error:", message);
    return new Response(
      JSON.stringify({ success: false, error: `评分失败: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
