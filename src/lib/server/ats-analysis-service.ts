import { llmRetry } from "@/lib/llm-retry";

export interface ATSIssue {
  dimension: string;
  severity: "critical" | "warning" | "info";
  detail: string;
  fix: string;
}

export interface ATSAnalysisResult {
  issues: ATSIssue[];
  score: number;
}

export async function analyzeATSResume(
  cvText: string,
  options: { signal?: AbortSignal } = {},
): Promise<ATSAnalysisResult> {
  if (cvText.trim().length < 50) throw new Error("CV 文本不足 50 字符");
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY");
  const response = await llmRetry("https://api.deepseek.com/chat/completions", apiKey, {
    model: process.env.DEEPSEEK_ATS_MODEL?.trim() || "deepseek-v4-flash",
    messages: [
      {
        role: "system",
        content: `你是 ATS 兼容性检查专家。检查联系方式、量化数据、岗位关键词、摘要/经历/项目/教育/技能完整性以及 ATS 无法解析的格式。只返回 JSON：{"issues":[{"dimension":"联系方式|量化数据|关键词|section完整性|格式","severity":"critical|warning|info","detail":"具体问题","fix":"修复建议"}],"score":0}`,
      },
      { role: "user", content: cvText.slice(0, 6000) },
    ],
    max_tokens: 1500,
    temperature: 0.1,
    response_format: { type: "json_object" },
    retries: 2,
    fallbackModel: process.env.DEEPSEEK_FALLBACK_MODEL,
    signal: options.signal,
  });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content) as { issues?: unknown; score?: unknown };
  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.flatMap((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const item = value as Record<string, unknown>;
        return [{
          dimension: stringValue(item.dimension),
          severity: severityValue(item.severity),
          detail: stringValue(item.detail),
          fix: stringValue(item.fix),
        }];
      })
    : [];
  const score = Number(parsed.score);
  return { issues, score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0 };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function severityValue(value: unknown): ATSIssue["severity"] {
  return value === "critical" || value === "warning" ? value : "info";
}
