/**
 * 拒信解析（Spec 29 / 2026-10B Q13）。
 * 一期只做：用户粘贴文本 → LLM 提取封闭原因标签集 + 引用原文 → 用户确认 → 入账。
 * 不做邮箱集成。未经用户确认的解析结果以候选态存在，绝不影响检索与推荐（ADR-0034）。
 */
import { createHash } from "node:crypto";

export const REJECTION_REASON_LABELS = [
  "resume_mismatch",
  "position_filled",
  "salary_mismatch",
  "no_response",
  "other",
] as const;

export type RejectionReasonLabel = (typeof REJECTION_REASON_LABELS)[number];

export const REJECTION_LABEL_DESCRIPTIONS: Record<RejectionReasonLabel, string> = {
  resume_mismatch: "简历不匹配",
  position_filled: "已招满",
  salary_mismatch: "薪资不匹配",
  no_response: "流程无回应",
  other: "其他",
};

export interface ParsedRejection {
  company: string;
  role: string;
  reasonLabel: RejectionReasonLabel;
  /** 原因标签对应的原文引用（溯源；缺失即解析作废——沿 Spec 26 veto 纪律） */
  quote: string;
  freeText: string;
}

export interface RejectionParseResult {
  ok: boolean;
  parse?: ParsedRejection;
  error?: string;
}

type RejectionCompletion = (request: { messages: Array<{ role: string; content: string }>; systemPrompt: string }) => Promise<{ text: string }>;

const SYSTEM_PROMPT = [
  "你是求职拒信解析器。从用户粘贴的拒信/邮件/HR 消息文本中提取：",
  `1. 公司与岗位（缺失写空字符串）`,
  `2. 拒绝原因，只能从封闭标签集中选一个：${REJECTION_REASON_LABELS.join(" | ")}（分别对应：${Object.entries(REJECTION_LABEL_DESCRIPTIONS).map(([k, v]) => `${k}=${v}`).join("，")}）`,
  "3. quote：支撑该原因判定的原文逐字引用（至少 6 个字）。找不到依据就选 other 且引用最接近的句子。",
  '严格返回 JSON：{"company":"","role":"","reasonLabel":"other","quote":"","freeText":"一句话补充说明"}',
].join("\n");

function parseJson(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function parseRejectionNotice(
  text: string,
  options: { completion?: RejectionCompletion; signal?: AbortSignal } = {},
): Promise<RejectionParseResult> {
  const trimmed = (text || "").trim();
  if (trimmed.length < 10) return { ok: false, error: "文本太短，请粘贴完整的拒信或 HR 消息" };

  let raw: string;
  if (options.completion) {
    raw = (await options.completion({ messages: [{ role: "user", content: trimmed.slice(0, 3000) }], systemPrompt: SYSTEM_PROMPT })).text;
  } else {
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) return { ok: false, error: "未配置 DEEPSEEK_API_KEY" };
    const { llmRetry } = await import("@/lib/llm-retry");
    const response = await llmRetry("https://api.deepseek.com/chat/completions", apiKey, {
      model: "deepseek-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: trimmed.slice(0, 3000) },
      ],
      temperature: 0.1,
      max_tokens: 600,
      response_format: { type: "json_object" },
      retries: 2,
      fallbackModel: "deepseek-flash",
      signal: options.signal,
    });
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    raw = payload.choices?.[0]?.message?.content || "{}";
  }

  const parsed = parseJson(raw);
  const label = String(parsed.reasonLabel || "") as RejectionReasonLabel;
  const quote = String(parsed.quote || "").trim();
  if (!REJECTION_REASON_LABELS.includes(label)) {
    return { ok: false, error: `原因标签不在封闭集内：${label}` };
  }
  // 无引用 = 解析作废（沿 Spec 26 veto 纪律：无证据的判定不采信）
  if (quote.length < 6) {
    return { ok: false, error: "解析缺少原文引用（veto：missing_evidence_citation），已作废" };
  }
  // 引用必须是粘贴原文的子串——模型幻觉/注入的「引用」直接作废（P1-5）
  if (!trimmed.includes(quote)) {
    return { ok: false, error: "引用不是原文的子串（疑似幻觉），解析作废（veto：missing_evidence_citation）" };
  }
  return {
    ok: true,
    parse: {
      company: String(parsed.company || "").trim(),
      role: String(parsed.role || "").trim(),
      reasonLabel: label,
      quote,
      freeText: String(parsed.freeText || "").trim(),
    },
  };
}

/** 用户确认后的入账：以活跃事实写记忆账本（封闭标签 + 原文引用 + 来源=用户确认）。
 *  verified_task 证据三件套沿 admission.ts 硬性要求（P0-1 同款）。
 *  保留理由（eng review S1-7 复核）：当前确认动作走 resolveMemoryCandidate 通用治理路径，
 *  本函数是「确认 API 显式化」的既定接缝（专用确认端点/批量确认时启用），非死代码。 */
export async function confirmRejectionToLedger(
  userId: string,
  parse: ParsedRejection,
): Promise<{ ok: boolean; id?: number; error?: string }> {
  const { getDatabaseDriver, isPostgresConfigured } = await import("@/lib/postgres");
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) {
    return { ok: false, error: "postgres_unavailable" };
  }
  const { admitMemory } = await import("@/lib/memory/admission");
  const result = await admitMemory({
    userId,
    agentId: "general",
    kind: "verified_task",
    sourceType: "application",
    // 幂等（eng review S1-7）：sourceId 取解析内容指纹——同一拒信重复确认不产生第二条事实
    sourceId: `rejection:${createHash("sha256").update(`${parse.company}\u0000${parse.role}\u0000${parse.reasonLabel}\u0000${parse.quote}`).digest("hex").slice(0, 24)}`,
    fact: {
      partition: "core",
      subject: parse.company || "未知公司",
      predicate: "rejection_reason",
      object: { role: parse.role, reasonLabel: parse.reasonLabel, freeText: parse.freeText },
      canonicalText: `${parse.company || "某公司"}${parse.role ? ` ${parse.role}` : ""} 的拒绝原因（用户确认）：${REJECTION_LABEL_DESCRIPTIONS[parse.reasonLabel]}${parse.freeText ? `——${parse.freeText}` : ""}`,
      confidence: 0.95,
      importance: 0.7,
    },
    evidence: {
      quote: parse.quote,
      artifactId: `rejection-confirm-${createHash("sha256").update(`${parse.company}\u0000${parse.role}\u0000${parse.reasonLabel}\u0000${parse.quote}`).digest("hex").slice(0, 16)}`,
      resultEvidence: "user confirmed the parsed rejection labels in memory governance (candidate → active promotion)",
      verifiedReadBack: true,
      extractionMethod: "rejection_notice_user_confirmed",
      metadata: { reasonLabel: parse.reasonLabel, closedSet: REJECTION_REASON_LABELS },
    },
  });
  return { ok: result.outcome === "candidate" || result.outcome === "active", id: result.candidate?.id, error: result.outcome === "rejected" ? result.reason : undefined };
}
