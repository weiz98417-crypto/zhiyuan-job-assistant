import type { ToolDefinition, ToolResult } from "../types";

interface EvalJDParams {
  jdText?: string;
  jdUrl?: string;
  images?: string[];
  language?: "zh" | "en";
}

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const { jdText, jdUrl, images, language } = params as EvalJDParams;

  const hasText = typeof jdText === "string" && jdText.trim().length >= 50;
  const hasUrl = typeof jdUrl === "string" && /^https?:\/\//.test(jdUrl.trim());
  const hasImages = Array.isArray(images) && images.length > 0;

  if (!hasText && !hasUrl && !hasImages) {
    return { success: false, data: null, error: "请提供 JD 文本（≥50字符）、链接或截图" };
  }

  // If images provided, OCR first to extract JD text
  let evalText = jdText;
  if (hasImages && !hasText) {
    const bodies: string[] = [];
    for (const img of images!) {
      try {
        const ocrRes = await fetch("/api/ocr/jd-screenshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: img }),
        });
        if (ocrRes.ok) {
          const ocrJson = await ocrRes.json();
          if (ocrJson.success && ocrJson.data?.body && ocrJson.data.body !== "【缺失】") {
            bodies.push(ocrJson.data.body);
          }
        }
      } catch { /* skip failed OCR */ }
    }
    if (bodies.length > 0) {
      evalText = bodies.join("\n\n---\n\n");
    } else {
      return { success: false, data: null, error: "未能从截图中提取到 JD 文本" };
    }
  }

  try {
    const res = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jdText: evalText || jdText, language: language || "zh" }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, data: null, error: err.error || `评估请求失败 (${res.status})` };
    }

    const json = await res.json();
    if (!json.success || !json.data) {
      return { success: false, data: null, error: json.error || "评估返回为空" };
    }

    return {
      success: true,
      data: {
        company: json.data.company || "未知",
        role: json.data.role || "未知",
        overallScore: json.data.overallScore || 3,
        archetype: json.data.archetype || "",
        blocks: json.data.blocks || {},
        jdText: hasText ? jdText : "",
        scores: json.data.scores,
        keywords: json.data.keywords,
        legitimacy: json.data.legitimacy,
      },
    };
  } catch (err) {
    return { success: false, data: null, error: `评估请求失败: ${err instanceof Error ? err.message : "未知错误"}` };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `JD 评估失败: ${result.error}`;
  const d = result.data as { company?: string; role?: string; overallScore?: number } | null;
  return d ? `评估完成: ${d.company} ${d.role}，总分 ${d.overallScore}/5` : "评估完成";
}

export const evaluateJD: ToolDefinition = {
  name: "evaluate_jd",
  description: "评估职位描述（JD），支持粘贴文本、提供链接或上传截图（最多5张）。从7个维度分析匹配度并生成完整报告。",
  parameters: {
    jdText: { type: "string", required: false, description: "JD 文本内容，至少 50 字符" },
    jdUrl: { type: "string", required: false, description: "JD 链接 URL" },
    images: { type: "array", required: false, description: "截图 base64 数组，最多 5 张" },
    language: { type: "string", required: false, description: "语言: zh/en，默认 zh" },
    archetype: { type: "string", required: false, description: "覆盖自动检测的 archetype，如 'AI产品经理'" },
  },
  category: "action",
  handler,
  formatResult,
};
