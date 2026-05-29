import { NextResponse } from "next/server";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";

const SYSTEM_PROMPT = `你是一个求职画像提取引擎。根据用户与AI求职顾问的完整对话历史，提取用户的结构化求职画像。

## 提取规则

1. **targetRoles**: 基于对话中提到的经验、技能、偏好，推荐2-3个目标岗位。每个包含：
   - title: 岗位中文名称
   - confidence: 0-100的匹配置信度
   - reasoning: 一句话理由
2. **skills**:
   - core: 核心硬技能（来自经历中明确提到的）
   - secondary: 次要技能或辅助技能
   - advantage: 用户的独特优势（"超级能力"）
3. **preferences**:
   - companyType: 偏好的公司类型（大厂/创业/国企/外企/不限）
   - industry: 偏好的行业方向
   - culture: 偏好的工作文化（用短语描述）
   - workStyle: 工作方式偏好
4. **constraints**:
   - salary: 税前月薪范围（K）
   - location: 地点偏好
   - hours: 工作时长要求
   - other: 其他约束（如不接受外包、不接受竞业限制等）
5. **narrative**: 一段80字以内的求职叙事文案，用第一人称"我"，自然流畅，可用于简历概述
6. **archetype**: 匹配的求职者archetype（从以下选择：AI产品经理/后端工程师/前端工程师/全栈工程师/算法工程师/数据工程师/技术管理/技术售前/AI解决方案/产品运营/增长产品/AI研究员）

## 重要规则
- 如果对话中未提及某项信息，标注为"未提及"或使用空数组
- 只基于对话中实际出现的内容，不要编造
- 置信度基于对话中信息的明确程度：用户直接说出的方向 > 暗示的方向 > 推测的方向
- 用中文输出`;

interface SummarizeRequest {
  messages: { role: "user" | "assistant"; content: string }[];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SummarizeRequest;
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { success: false, error: "对话历史不能为空" },
        { status: 400 },
      );
    }

    // Count user messages as a rough measure of information depth
    const userMessages = messages.filter((m) => m.role === "user");
    if (userMessages.length < 3) {
      return NextResponse.json(
        { success: false, error: "对话信息不足，请再多聊几句（至少3轮用户回复）" },
        { status: 400 },
      );
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "未配置 DEEPSEEK_API_KEY" },
        { status: 500 },
      );
    }

    const conversationText = messages
      .map((m) => `${m.role === "user" ? "用户" : "顾问"}: ${m.content}`)
      .join("\n\n");

    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `请从以下对话中提取求职画像，以 JSON 格式输出：\n\n${conversationText}` },
        ],
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("DeepSeek summarize error:", response.status, errText);
      let detail = errText;
      try {
        const errJson = JSON.parse(errText);
        detail = errJson.error?.message || errJson.message || errText;
      } catch { /* not JSON */ }
      return NextResponse.json(
        { success: false, error: `AI 归纳请求失败: ${response.status} — ${detail}` },
        { status: 502 },
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { success: false, error: "AI 返回为空" },
        { status: 500 },
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1]);
        } catch {
          return NextResponse.json(
            { success: false, error: "AI 返回格式解析失败" },
            { status: 500 },
          );
        }
      } else {
        return NextResponse.json(
          { success: false, error: "AI 返回格式解析失败" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        targetRoles: Array.isArray(parsed.targetRoles) ? parsed.targetRoles : [],
        skills: parsed.skills || { core: [], secondary: [], advantage: "未提及" },
        preferences: parsed.preferences || {},
        constraints: {
          ...(parsed.constraints || {}),
          other: Array.isArray(parsed.constraints?.other)
            ? parsed.constraints.other
            : [],
        },
        narrative: parsed.narrative || "未提及",
        archetype: parsed.archetype || "未检测",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Chat summarize error:", message);
    return NextResponse.json(
      { success: false, error: `归纳失败: ${message}` },
      { status: 500 },
    );
  }
}
