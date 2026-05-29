/* ── POST /api/cv/score — 简历综合评分 + ATS 兼容检查 ── */

import { callDeepSeekJson, parseJsonResponse, checkApiKey } from "@/lib/stream-utils";

export async function POST(request: Request) {
  const keyCheck = checkApiKey();
  if (!keyCheck.valid) return keyCheck.error;

  try {
    const body = await request.json();
    const { sections, jdKeywords } = body as {
      sections: Record<string, string>;
      jdKeywords?: string[];
    };

    const cvText = Object.values(sections).filter(Boolean).join("\n");
    if (!cvText.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: "简历内容为空" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const content = await callDeepSeekJson({
      messages: [
        {
          role: "system",
          content: `你是简历评分和 ATS 兼容性检查专家。对简历进行四维度评分（1-5），并评估 ATS 兼容性。

评分维度：
- content: 内容完整度（教育、经历、技能是否完整，职责描述是否清晰）
- structure: 结构清晰度（层级分明、逻辑通顺、无重复冗余）
- keywords: 关键词密度（是否覆盖目标方向的核心技能词汇）
- quantification: 量化程度（是否有足够的数据和成果支撑）

ATS 检查：
- atsScore: 0-100 机器筛选通过概率
- atsIssues: 具体问题列表（如"表格格式"、"图片文字"、"缺少关键词"等）

返回 JSON：
{
  "overall": 4.0,
  "dimensions": {
    "content": 4,
    "structure": 3,
    "keywords": 4,
    "quantification": 3
  },
  "suggestions": ["建议在项目经历中补充量化成果", "建议将技能部分按熟练度分级"],
  "atsScore": 75,
  "atsIssues": ["关键词密度偏低", "缺少数字量化成果"]
}
只用中文。`,
        },
        {
          role: "user",
          content: `简历：\n${cvText.slice(0, 5000)}\n\n${jdKeywords?.length ? `目标关键词：${jdKeywords.join("、")}` : ""}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 3000,
    });

    const parsed = parseJsonResponse(content);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          overall: (parsed.overall as number) || 0,
          dimensions: (parsed.dimensions as Record<string, number>) || {},
          suggestions: (parsed.suggestions as string[]) || [],
          atsScore: (parsed.atsScore as number) || 0,
          atsIssues: (parsed.atsIssues as string[]) || [],
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("CV score error:", message);
    return new Response(
      JSON.stringify({ success: false, error: `简历评分失败: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
