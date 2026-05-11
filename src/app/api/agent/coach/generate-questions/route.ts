import { NextResponse } from "next/server";
import { COACH_MODES } from "@/types";
import type { CoachMode } from "@/types";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      jdText = "",
      cvText = "",
      company = "",
      role = "",
      mode = "behavioral",
      count = 8,
    } = body as {
      jdText?: string;
      cvText?: string;
      company?: string;
      role?: string;
      mode?: CoachMode;
      count?: number;
    };

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: "未配置 DEEPSEEK_API_KEY" }, { status: 500 });
    }

    const modeInfo = COACH_MODES[mode] || COACH_MODES.behavioral;
    const hasJD = jdText.trim().length >= 50;
    const hasCV = cvText.trim().length >= 50;

    const systemPrompt = `你是资深面试教练，专门为求职者生成高质量面试题。

## 当前面试模式
- 模式: ${modeInfo.label}（${modeInfo.target}）
- 回答结构框架: ${modeInfo.structure.join(" → ")}

## 出题要求
- 生成 ${count} 道面试题目
- 均匀分布在四个类别: behavioral(行为面试), technical(技术/专业), case-study(案例分析), culture(文化匹配)
- 每道题必须提供: category, question(题目文本), context(出题依据，解释为什么问这道题), storyHint(准备提示，帮用户思考怎么准备)
- source 字段: 有JD时填 "jd"，无JD时填 "general"
${hasJD ? "- 基于提供的 JD 内容出题，每道题的 context 引用 JD 中的具体要求" : "- 基于通用面试出题，结合职位和公司信息"}
${hasCV ? "- 参考简历，针对简历中可能存在的弱项增加题目" : ""}
${company ? `- 如果${company}是大厂(字节/腾讯/阿里/百度)，侧重数据驱动和产品思维` : ""}

## 输出格式
严格返回以下 JSON 对象（不要包含 markdown 代码块，只输出纯 JSON）：

{"questions": [
  {
    "category": "behavioral",
    "question": "题目文本",
    "context": "出题依据",
    "storyHint": "建议从哪些方面准备答案",
    "source": "general",
    "weaknessNote": "可选，弱项标注"
  }
]}

**注意:** category 只能是 behavioral / technical / case-study / culture 之一。source 只能是 jd 或 general。`;

    const userPrompt = [
      hasJD ? `【JD 内容】\n${jdText.slice(0, 2000)}` : "",
      hasCV ? `\n【简历内容】\n${cvText.slice(0, 1500)}` : "",
      `\n【目标公司】${company || "未指定"}`,
      `【目标职位】${role || "未指定"}`,
      `\n请生成 ${count} 道面试题。严格返回JSON数组格式。`,
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
        temperature: 0.8,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("[generate-questions] DeepSeek error:", response.status, errText.slice(0, 300));
      return NextResponse.json(
        { success: false, error: `AI 出题失败 (${response.status})` },
        { status: 502 },
      );
    }

    const json = await response.json();
    let rawContent = (json.choices?.[0]?.message?.content || "").trim();
    console.log("[generate-questions] raw response length:", rawContent.length, "preview:", rawContent.slice(0, 200));

    // Strip markdown code fences if present
    rawContent = rawContent.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();

    // Parse the response - handle multiple possible formats
    let questions: unknown[] = [];
    try {
      // Try direct JSON parse
      const parsed = JSON.parse(rawContent);
      if (Array.isArray(parsed)) {
        // Model returned a top-level array
        questions = parsed;
      } else if (parsed.questions && Array.isArray(parsed.questions)) {
        // Model returned { questions: [...] }
        questions = parsed.questions;
      } else if (parsed.data?.questions && Array.isArray(parsed.data.questions)) {
        // Model returned { data: { questions: [...] } }
        questions = parsed.data.questions;
      }
    } catch {
      // Try regex extraction
      const arrayMatch = rawContent.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try { questions = JSON.parse(arrayMatch[0]); } catch { /* fall through */ }
      }
      if (!Array.isArray(questions) || questions.length === 0) {
        const objMatch = rawContent.match(/\{[\s\S]*\}/);
        if (objMatch) {
          try {
            const obj = JSON.parse(objMatch[0]);
            questions = obj.questions || obj.data?.questions || [];
          } catch { /* fall through */ }
        }
      }
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      console.error("[generate-questions] failed to parse. rawContent:", rawContent.slice(0, 500));
      return NextResponse.json(
        { success: false, error: "AI 未能生成有效题目，请重试" },
        { status: 500 },
      );
    }

    // Normalize each question
    const normalized = questions.slice(0, count).map((q: unknown) => {
      const item = q as Record<string, unknown>;
      return {
        category: item.category || "behavioral",
        question: item.question || "",
        context: item.context || "",
        storyHint: item.storyHint || "",
        source: item.source || "general",
        weaknessNote: item.weaknessNote || undefined,
      };
    });

    return NextResponse.json({
      success: true,
      data: { questions: normalized, company, role, mode },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("[generate-questions] error:", message);
    return NextResponse.json(
      { success: false, error: `出题失败: ${message}` },
      { status: 500 },
    );
  }
}
