import { NextResponse } from "next/server";
import { buildJudgePrompt, getTemperatureByEffort } from "@/lib/judge-engine";
import type { Operation } from "@/types";
import { getCurrentUser } from "@/lib/auth";
import { retrieveReferenceResumeSnippets } from "@/lib/reference-resume-vector";
import { retrieveExcellentResumePatternMemory } from "@/lib/excellent-resume-patterns";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-pro";
const FAST_MODEL = "deepseek-v4-flash";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();
    const {
      sectionId,
      sectionContent,
      fullCV,
      intent,
      operation = "full",
      effort = 3,
      enablePlaceholders = true,
      // enableQuestions governs frontend flow (call /ask vs direct), not used here
      roleDirection = "auto",
      questionAnswers,
      targetJD,
      userProfile,
      referenceIds,
      fast,
    } = body as {
      sectionId: string;
      sectionContent: string;
      fullCV: Record<string, string>;
      intent?: string;
      operation: Operation;
      effort: number;
      enablePlaceholders: boolean;
      enableQuestions: boolean;
      roleDirection: string;
      questionAnswers?: { question: string; answer: string }[];
      targetJD?: { role: string; company: string; keywords: string[] };
      userProfile?: { headline: string; superpowers: string[]; targetRoles: { name: string; fit: string }[] };
      referenceIds?: number[];
      fast?: boolean;
    };

    if (!sectionContent || sectionContent.trim().length < 20) {
      return NextResponse.json(
        { success: false, error: "段落内容太少（至少20字），无法进行有意义的优化" },
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

    const effectiveRoleCategory = roleDirection && roleDirection !== "auto" && roleDirection !== "generic"
      ? roleDirection
      : targetJD?.role || userProfile?.targetRoles?.[0]?.name || "";

    const semanticReferenceSnippets = await retrieveReferenceResumeSnippets({
      userId: user.userId,
      query: [
        intent || "",
        roleDirection || "",
        targetJD?.role || "",
        targetJD?.company || "",
        targetJD?.keywords?.join(" ") || "",
        sectionContent,
      ].filter(Boolean).join("\n"),
      roleCategory: effectiveRoleCategory,
      sectionType: sectionId,
      limit: 4,
    }).catch(() => []);
    const patternMemory = await retrieveExcellentResumePatternMemory({
      userId: user.userId,
      roleCategory: effectiveRoleCategory,
      limit: 6,
    }).catch(() => []);

    const model = fast && !semanticReferenceSnippets.length && !patternMemory.length ? FAST_MODEL : MODEL;

    // Build prompt using judge-engine
    const systemPrompt = buildJudgePrompt({
      sectionId,
      sectionContent,
      fullCV,
      operation,
      effort,
      enablePlaceholders,
      targetJD,
      referenceIds,
      intent,
      userProfile,
      roleDirection,
      questionAnswers,
      referenceSnippets: semanticReferenceSnippets,
      patternMemory,
    });

    const temperature = getTemperatureByEffort(effort);

    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `请优化以下简历段落（${sectionId}），生成改写方案，以 JSON 格式输出。` },
        ],
        temperature,
        max_tokens: 8000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("DeepSeek optimize API error:", response.status, errText);
      return NextResponse.json(
        { success: false, error: `AI 优化请求失败: ${response.status}` },
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

    const variants = (parsed.variants || []).map((v: Record<string, unknown>) => ({
      ...v,
      placeholderCount: typeof v.content === "string"
        ? (v.content.match(/\[XX(?::[^\]]*)?\]/g) || []).length
        : 0,
    }));

    if (variants.length === 0) {
      return NextResponse.json(
        { success: false, error: "AI 未生成有效方案" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        variants,
        referenceMemory: {
          snippetIds: semanticReferenceSnippets.map((snippet) => snippet.id),
          referenceResumeIds: [...new Set(semanticReferenceSnippets.map((snippet) => snippet.referenceResumeId))],
          patternMemoryIds: patternMemory.map((pattern) => pattern.id),
          ranking: semanticReferenceSnippets.map((snippet) => ({
            snippetId: snippet.id,
            referenceResumeId: snippet.referenceResumeId,
            score: snippet.score,
            ranking: snippet.ranking,
          })),
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    if (error instanceof Error && error.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    console.error("Optimize section API error:", message);
    return NextResponse.json(
      { success: false, error: `优化失败: ${message}` },
      { status: 500 }
    );
  }
}
