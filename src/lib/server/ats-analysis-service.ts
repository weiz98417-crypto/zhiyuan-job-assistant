/**
 * ATS 兼容性分析（Spec 24 重构）。
 *
 * 拆两路：联系方式格式/板块完整性/格式风险走确定性规则（ats-rules.ts，零 LLM、可复现）；
 * 量化数据覆盖与岗位关键词两个语义维度保留 LLM 判断。两路 issue 合并、分数合并
 * （100 − 规则扣分，再叠 LLM 两维均分的折算），消费方接口（ATSIssue/ATSAnalysisResult）不变。
 */
import { llmRetry } from "@/lib/llm-retry";
import { parseLlmJsonObject } from "@/lib/llm-json";
import { loadRegistryText } from "@/lib/agent/knowledge/registry/loader";
import { atsRulesPenalty, runDeterministicAtsRules, type ATSIssue } from "./ats-rules";

export type { ATSIssue } from "./ats-rules";

export interface ATSAnalysisResult {
  issues: ATSIssue[];
  score: number;
}

export interface ATSAnalysisBreakdown extends ATSAnalysisResult {
  ruleIssues: ATSIssue[];
  llmIssues: ATSIssue[];
}

export async function analyzeATSResume(
  cvText: string,
  options: { signal?: AbortSignal } = {},
): Promise<ATSAnalysisResult> {
  return (await analyzeATSResumeWithBreakdown(cvText, options)) as ATSAnalysisResult;
}

export async function analyzeATSResumeWithBreakdown(
  cvText: string,
  options: { signal?: AbortSignal } = {},
): Promise<ATSAnalysisBreakdown> {
  if (cvText.trim().length < 50) throw new Error("CV 文本不足 50 字符");

  // 确定性规则路：零 LLM、可复现（Spec 24）
  const ruleIssues = runDeterministicAtsRules({ cvText });

  // LLM 路：只判量化覆盖与关键词两个语义维度
  const llmIssues = await analyzeSemanticDimensions(cvText, options.signal);
  const issues = [...ruleIssues, ...llmIssues];

  const ruleScore = Math.max(0, 100 - atsRulesPenalty(ruleIssues));
  const llmAvg = llmIssues.length
    ? Math.max(0, 100 - atsRulesPenalty(llmIssues))
    : 85; // LLM 路不可用/无发现时给中性基线，不让规则路被静默拉低为 0
  const score = Math.max(0, Math.min(100, Math.round(ruleScore * 0.6 + llmAvg * 0.4)));
  return { issues, score, ruleIssues, llmIssues };
}

async function analyzeSemanticDimensions(cvText: string, signal?: AbortSignal): Promise<ATSIssue[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) return []; // 无 key 时规则路仍然有效（本地开发/测试环境）
  try {
    const response = await llmRetry("https://api.deepseek.com/chat/completions", apiKey, {
      model: "deepseek-flash",
      messages: [
        { role: "system", content: loadRegistryText("prompt.ats-analysis") },
        { role: "user", content: cvText.slice(0, 6000) },
      ],
      max_tokens: 1500,
      temperature: 0.1,
      response_format: { type: "json_object" },
      retries: 2,
      fallbackModel: "deepseek-flash",
      signal,
    });
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = parseJson(payload.choices?.[0]?.message?.content || "{}");
    return Array.isArray(parsed.issues)
      ? parsed.issues.flatMap((value) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return [];
          const item = value as Record<string, unknown>;
          const dimension = stringValue(item.dimension);
          // 只接受两个语义维度，防止 LLM 越界重复规则路的判定
          if (!/量化|关键词/.test(dimension)) return [];
          return [{
            dimension,
            severity: severityValue(item.severity),
            detail: stringValue(item.detail),
            fix: stringValue(item.fix),
          }];
        })
      : [];
  } catch {
    return []; // LLM 路失败不阻塞规则路结果（语义维度属增强，不属于门禁）
  }
}

function parseJson(value: string): Record<string, unknown> {
  return parseLlmJsonObject(value) ?? {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function severityValue(value: unknown): ATSIssue["severity"] {
  return value === "critical" || value === "warning" ? value : "info";
}
