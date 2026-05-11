import { NextResponse } from "next/server";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";

interface InterviewQuestionsRequest {
  company: string;
  role: string;
  archetype?: string;
  category?: "behavioral" | "technical" | "case-study" | "culture" | "all";
  count?: number;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as InterviewQuestionsRequest;
    const { company, role, archetype, category = "all", count = 5 } = body;

    if (!company || !role) {
      return NextResponse.json(
        { success: false, error: "请提供公司和岗位名称" },
        { status: 400 },
      );
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "未配置 DEEPSEEK_API_KEY 环境变量" },
        { status: 500 },
      );
    }

    const categories =
      category === "all"
        ? "行为面试、技术/专业、案例分析、文化匹配"
        : {
            behavioral: "行为面试",
            technical: "技术/专业",
            "case-study": "案例分析",
            culture: "文化匹配",
          }[category] || category;

    const systemPrompt = `你是一个资深的 AI 行业面试官。针对指定公司和岗位，生成${categories}类别的面试问题。

返回 JSON：
{
  "questions": [
    {
      "category": "行为面试",
      "question": "请介绍一个你主导的成功项目",
      "context": "考察项目领导力和成果导向",
      "storyHint": "准备一个你有主导权和可量化成果的项目案例，使用 STAR+R 结构"
    }
  ]
}

每个类别生成 ${count} 个问题。每个问题必须与该岗位和公司高度相关。
context 字段说明面试官问这个问题的意图。storyHint 建议如何准备 STAR+R 故事。
问题难度适配该岗位的级别，从基础到深入递进。只用中文。`;

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
          {
            role: "user",
            content: `公司：${company}\n岗位：${role}\n${archetype ? `Archetype：${archetype}` : ""}`,
          },
        ],
        temperature: 0.6,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `AI 生成请求失败: ${response.status}` },
        { status: 502 },
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ success: false, error: "AI 返回为空" }, { status: 500 });
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[1]);
      else {
        return NextResponse.json({ success: false, error: "AI 返回格式解析失败" }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        questions: (parsed.questions || []).slice(0, category === "all" ? count * 4 : count),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Interview Questions API error:", message);
    return NextResponse.json(
      { success: false, error: `生成失败: ${message}` },
      { status: 500 },
    );
  }
}
