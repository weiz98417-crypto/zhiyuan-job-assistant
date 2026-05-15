import { NextResponse } from "next/server";
import { buildAskQuestionsPrompt } from "@/lib/judge-engine";
import type { Operation } from "@/types";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-pro";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      sectionContent,
      sectionId,
      targetJD,
      operation = "full",
      effort = 4,
    } = body as {
      sectionContent: string;
      sectionId: string;
      targetJD?: { role: string; company: string; keywords: string[] };
      operation: Operation;
      effort: number;
    };

    if (!sectionContent || sectionContent.trim().length < 20) {
      return NextResponse.json(
        { success: false, error: "段落内容太少（至少20字），无法生成追问" },
        { status: 400 }
      );
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "未配置 DEEPSEEK_API_KEY 环境变量" },
        { status: 500 }
      );
    }

    const systemPrompt = buildAskQuestionsPrompt({
      sectionContent,
      sectionId,
      targetJD,
      operation,
      effort,
    });

    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `请分析这段经历（${sectionId}），生成信息补充问题。` },
        ],
        temperature: 0.5,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Ask questions API error:", response.status, errText);
      return NextResponse.json(
        { success: false, error: `追问生成失败: ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { success: false, error: "AI 返回为空" },
        { status: 500 }
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        return NextResponse.json(
          { success: false, error: "AI 返回格式解析失败" },
          { status: 500 }
        );
      }
    }

    const questions = parsed.questions || [];
    if (questions.length === 0) {
      return NextResponse.json(
        { success: false, error: "AI 未生成有效追问" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { questions },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Ask questions error:", message);
    return NextResponse.json(
      { success: false, error: `追问生成失败: ${message}` },
      { status: 500 }
    );
  }
}
