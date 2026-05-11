/* ── POST /api/cv/tailor — 根据 JD + 简历生成定向优化版本 ── */

import { callDeepSeekJson, parseJsonResponse, checkApiKey } from "@/lib/stream-utils";

export async function POST(request: Request) {
  const keyCheck = checkApiKey();
  if (!keyCheck.valid) return keyCheck.error;

  try {
    const body = await request.json();
    const { sections, jdText, targetRole, targetCompany } = body as {
      sections: Record<string, string>;
      jdText: string;
      targetRole?: string;
      targetCompany?: string;
    };

    const cvText = Object.values(sections).filter(Boolean).join("\n");
    if (!cvText.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: "简历内容为空" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Extract keywords from JD if provided
    let keywordBlock = "";
    if (jdText) {
      const kwContent = await callDeepSeekJson({
        messages: [
          {
            role: "system",
            content: "提取这段 JD 中的 10-15 个核心关键词（技能、经验、软素质），返回 JSON: {\"keywords\": [\"...\"]}。只用中文。",
          },
          { role: "user", content: jdText.slice(0, 4000) },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }).catch(() => "");
      if (kwContent) {
        try {
          const kwParsed = parseJsonResponse(kwContent);
          const keywords = kwParsed.keywords as string[];
          if (keywords?.length) {
            keywordBlock = `\n目标 JD 核心关键词：${keywords.join("、")}`;
          }
        } catch { /* ignore */ }
      }
    }

    const content = await callDeepSeekJson({
      messages: [
        {
          role: "system",
          content: `你是简历优化专家。基于原始简历和目标 JD，生成定向优化版本。

核心原则：
- 保持真实，不编造经历和成果
- 优化关键词密度，自然嵌入 JD 中的核心要求词汇
- 保留原简历的主体结构，只针对性调整措辞和重点
- 量化成果优先——能加数据的地方加数据
- 每条修改标注修改原因

返回 JSON：
{
  "optimizedSections": {
    "summary": "重写的个人概述...",
    "experience": "重写的工作经历...",
    "projects": "重写的项目经历...",
    "skills": "重写的技能...",
    "education": "重写的教育背景..."
  },
  "changes": [
    {"section": "summary", "type": "rewrite", "reason": "原描述偏泛，加入JD匹配的关键词并突出相关经验"}
  ],
  "keywordDensityBefore": 35,
  "keywordDensityAfter": 72
}
只用中文。`,
        },
        {
          role: "user",
          content: `原始简历：\n${cvText.slice(0, 5000)}\n\n${jdText ? `目标 JD：\n${jdText.slice(0, 4000)}` : ""}${keywordBlock}\n目标岗位：${targetRole || "未知"}\n目标公司：${targetCompany || "未知"}`,
        },
      ],
      temperature: 0.4,
      max_tokens: 8000,
    });

    const parsed = parseJsonResponse(content);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          optimizedSections: parsed.optimizedSections || {},
          changes: parsed.changes || [],
          keywordDensityBefore: (parsed.keywordDensityBefore as number) || 0,
          keywordDensityAfter: (parsed.keywordDensityAfter as number) || 0,
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("CV tailor error:", message);
    return new Response(
      JSON.stringify({ success: false, error: `简历优化失败: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
