/* ── POST /api/interview/generate — 基于 JD+简历生成动态面试题目 ── */

import { callDeepSeekJson, parseJsonResponse, checkApiKey } from "@/lib/stream-utils";

export async function POST(request: Request) {
  const keyCheck = checkApiKey();
  if (!keyCheck.valid) return keyCheck.error;

  try {
    const body = await request.json();
    const { jdText, cvText, company, role, companyPreset, storiesContext } = body as {
      jdText?: string;
      cvText?: string;
      company: string;
      role: string;
      companyPreset?: string;
      storiesContext?: { title: string; situation: string; task: string; action: string; result: string; tags: string[] }[];
    };

    if (!company && !role && !jdText) {
      return new Response(
        JSON.stringify({ success: false, error: "请至少提供 JD 文本或公司/岗位信息" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Company preset context
    const presetContexts: Record<string, string> = {
      bytedance: "该公司为字节跳动风格。出题偏向数据驱动、A/B 测试、快节奏决策、结果导向。",
      tencent: "该公司为腾讯风格。出题偏向产品感、用户体验、社交生态理解、长期主义。",
      alibaba: "该公司为阿里巴巴风格。出题偏向价值观、执行力、业务闭环思维、拥抱变化。",
    };
    const presetBlock = companyPreset ? (presetContexts[companyPreset] || "") : "";

    const systemPrompt = `你是资深面试官。基于 JD 和简历，生成个性化面试题目。

出题策略（三层）：
1. JD 解析层：从 JD 提取关键要求 → 生成技术/专业类题目
2. 简历匹配层：对比简历与 JD 差距 → 生成弱项针对性题目
3. 通用层：行为面试和文化匹配题

生成 8-12 道题，分四类：
- behavioral: 行为面试（领导力、冲突、失败、团队协作）
- technical: 技术/专业（基于 JD 技能要求）
- case-study: 案例分析（业务场景、产品设计、策略思考）
- culture: 文化匹配（价值观、工作方式、团队适配）

${presetBlock}

返回 JSON：
{
  "questions": [
    {
      "category": "technical",
      "question": "...",
      "context": "面试官为什么问这个，考察什么",
      "storyHint": "如何准备这道题，用什么结构",
      "source": "jd",
      "weaknessNote": ""
    }
  ]
}
source 取值：jd（从 JD 中提取）、weakness（针对弱项）、general（通用题）
weaknessNote 仅 source=weakness 时填写，如"你的简历缺少 AIGC 相关经验，这是该岗位的核心要求"
只用中文。`;

    const jdBlock = jdText ? `JD：\n${jdText.slice(0, 5000)}\n` : "";
    const cvBlock = cvText ? `简历：\n${cvText.slice(0, 4000)}\n` : "";

    const storiesBlock = storiesContext && storiesContext.length > 0
      ? `用户已有的 STAR 故事（最多 5 个，参考这些经历出题，优先出用户有相关经验的方向）：\n${
          storiesContext.slice(0, 5).map((s, i) =>
            `${i + 1}. ${s.title} — 背景：${s.situation.slice(0, 200)} | 行动：${s.action.slice(0, 200)} | 结果：${s.result.slice(0, 200)}`
          ).join("\n")
        }\n`
      : "";

    const content = await callDeepSeekJson({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `${jdBlock}${cvBlock}${storiesBlock}\n公司：${company || "未知"}\n岗位：${role || "未知"}`,
        },
      ],
      temperature: 0.6,
      max_tokens: 6000,
    });

    const parsed = parseJsonResponse(content);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          questions: (parsed.questions as Array<Record<string, unknown>>) || [],
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Interview generate error:", message);
    return new Response(
      JSON.stringify({ success: false, error: `题目生成失败: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
