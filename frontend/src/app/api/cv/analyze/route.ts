import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";

interface CvAnalyzeRequest {
  sections: Record<string, string>;
  jdText?: string;
  keywords?: string[];
  role?: string;
  archetype?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CvAnalyzeRequest;
    const { sections, jdText, keywords, role, archetype } = body;

    const cvText = Object.values(sections).filter(Boolean).join("\n");
    if (!cvText.trim()) {
      return NextResponse.json(
        { success: false, error: "简历内容为空，请先填写简历" },
        { status: 400 },
      );
    }

    if (!jdText && (!keywords || keywords.length === 0)) {
      return NextResponse.json(
        { success: false, error: "请提供 JD 文本或关键词用于匹配分析" },
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

    // Load Block B (CV Match) context from modes
    const jianzhiPath = path.join(process.cwd(), "..", "modes", "zh", "jianzhi.md");
    let cvMatchContext = "";
    if (fs.existsSync(jianzhiPath)) {
      const content = fs.readFileSync(jianzhiPath, "utf-8");
      const blockBMatch = content.match(/## B[.\s]+简历匹配([\s\S]*?)(?=## C|$)/);
      if (blockBMatch) cvMatchContext = blockBMatch[1].trim().slice(0, 2000);
    }

    const jdContext = jdText
      ? `JD 文本：\n${jdText.slice(0, 3000)}`
      : `JD 关键词：${keywords!.join("、")}`;

    const systemPrompt = `你是一个简历优化专家。分析求职者的简历内容与目标 JD 的匹配情况。
${cvMatchContext}

返回 JSON：
{
  "matchPercent": 75,
  "keywordMatches": [
    {"keyword": "产品规划", "matched": true},
    {"keyword": "数据分析", "matched": false, "suggestion": "建议在技能部分加入数据分析相关经验"}
  ],
  "missingTerms": ["A/B测试", "用户增长"],
  "suggestions": [
    "建议在项目经验中突出量化成果",
    "..."
  ],
  "sectionFeedback": [
    {"sectionId": "summary", "strengthScore": 3, "notes": ["概述缺乏针对性", "..."]},
    {"sectionId": "experience", "strengthScore": 4, "notes": ["..."]}
  ]
}
matchPercent 是 0-100 的整数。每个建议必须具体可操作。只用中文输出。`;

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
            content: `简历内容：\n${cvText.slice(0, 4000)}\n\n${jdContext}\n\n岗位：${role || "未知"}\nArchetype：${archetype || "未检测"}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `AI 分析请求失败: ${response.status}` },
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
        matchPercent: parsed.matchPercent || 0,
        keywordMatches: parsed.keywordMatches || [],
        missingTerms: parsed.missingTerms || [],
        suggestions: parsed.suggestions || [],
        sectionFeedback: parsed.sectionFeedback || [],
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("CV Analyze API error:", message);
    return NextResponse.json(
      { success: false, error: `分析失败: ${message}` },
      { status: 500 },
    );
  }
}
