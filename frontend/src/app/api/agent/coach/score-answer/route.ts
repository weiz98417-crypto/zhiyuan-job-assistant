import { NextResponse } from "next/server";
import { COACH_MODES } from "@/types";
import type { CoachMode } from "@/types";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";

/* ── Mode-specific scoring weights ── */

const MODE_WEIGHTS: Record<CoachMode, Record<string, number>> = {
  "project-review": { structure: 0.30, specificity: 0.30, highlight: 0.25, timing: 0.15 },
  behavioral: { structure: 0.30, specificity: 0.30, highlight: 0.25, timing: 0.15 },
  scenario: { structure: 0.25, specificity: 0.25, highlight: 0.30, timing: 0.20 },
  "structured-sme": { structure: 0.30, specificity: 0.35, highlight: 0.20, timing: 0.15 },
  founder: { structure: 0.20, specificity: 0.25, highlight: 0.35, timing: 0.20 },
  stability: { structure: 0.40, specificity: 0.20, highlight: 0.10, timing: 0.30 },
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      question = "",
      answer = "",
      mode = "behavioral",
      context = "",
    } = body as {
      question?: string;
      answer?: string;
      mode?: CoachMode;
      context?: string;
    };

    if (!question.trim() || !answer.trim()) {
      return NextResponse.json(
        { success: false, error: "请提供 question（面试题）和 answer（回答文本）" },
        { status: 400 },
      );
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: "未配置 DEEPSEEK_API_KEY" }, { status: 500 });
    }

    const modeInfo = COACH_MODES[mode] || COACH_MODES.behavioral;
    const weights = MODE_WEIGHTS[mode] || MODE_WEIGHTS.behavioral;

    const systemPrompt = `你是资深面试教练，负责对求职者的面试回答进行专业评分。

## 评分模式
- 当前模式: ${modeInfo.label}（${modeInfo.target}）
- 权重分配: 结构完整度 ${Math.round(weights.structure * 100)}%、具体程度 ${Math.round(weights.specificity * 100)}%、亮点突出 ${Math.round(weights.highlight * 100)}%、时间控制 ${Math.round(weights.timing * 100)}%

## 评分标准（1-5分）
- 结构完整度: 回答是否有清晰的开头-主体-结尾，逻辑是否连贯
- 具体程度: 是否有具体的数据、案例、情境细节支撑
- 亮点突出: 是否展现了独特优势和竞争力
- 时间控制: 回答是否精炼、不冗长

## 要求
1. 按四个维度分别打分（1-5分，精确到0.5）
2. 计算加权综合得分
3. 给出 2-3 条具体改进建议（中文）
4. 如果回答超过300字，提供逐段反馈（segmentFeedback），每段标注 rating（good/expand/compress）
5. 建议要具体可执行，不要泛泛而谈

## 输出格式
严格返回 JSON 对象:
{
  "dimensions": { "structure": 4, "specificity": 3.5, "highlight": 3, "timing": 4 },
  "overall": 3.625,
  "suggestions": ["建议1", "建议2"],
  "segmentFeedback": [{"text": "这段......", "rating": "good|expand|compress"}]
}`;

    const userPrompt = [
      `【面试题目】${question}`,
      context ? `\n【JD/简历上下文】\n${context.slice(0, 1000)}` : "",
      `\n【用户回答】\n${answer}`,
    ].filter(Boolean).join("\n");

    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2048,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("[score-answer] DeepSeek error:", response.status, errText.slice(0, 300));
      return NextResponse.json(
        { success: false, error: `AI 评分失败 (${response.status})` },
        { status: 502 },
      );
    }

    const json = await response.json();
    const rawContent = json.choices?.[0]?.message?.content || "";

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch { /* fall through */ }
      }
    }

    const dims = (parsed.dimensions as Record<string, unknown>) || {};
    if (!dims || parsed.overall === undefined) {
      return NextResponse.json(
        { success: false, error: "AI 未能生成有效评分，请重试" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        dimensions: {
          structure: Number(dims.structure) || 3,
          specificity: Number(dims.specificity) || 3,
          highlight: Number(dims.highlight) || 3,
          timing: Number(dims.timing) || 3,
        },
        overall: Number(parsed.overall) || 3,
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions as string[] : [],
        segmentFeedback: Array.isArray(parsed.segmentFeedback) ? parsed.segmentFeedback as { text: string; rating: "good" | "expand" | "compress" }[] : undefined,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("[score-answer] error:", message);
    return NextResponse.json(
      { success: false, error: `评分失败: ${message}` },
      { status: 500 },
    );
  }
}
