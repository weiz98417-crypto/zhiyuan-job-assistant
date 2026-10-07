/**
 * log_rejection_notice 工具（Spec 29）：用户粘贴拒信 → 封闭标签解析（带原文引用）
 * → 以候选态写入记忆账本（用户在记忆治理里确认后才激活）。
 * 无引用的解析按 veto 纪律作废，不入账。
 */
import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";
import {
  parseRejectionNotice,
  REJECTION_LABEL_DESCRIPTIONS,
  REJECTION_REASON_LABELS,
  type ParsedRejection,
} from "@/lib/server/rejection-parsing";

async function handler(
  params: Record<string, unknown>,
  executionContext?: ToolExecutionContext,
): Promise<ToolResult> {
  const text = String(params.text || params.notice || "");
  if (!text.trim()) {
    return { success: false, data: null, error: "请粘贴拒信/HR 消息的原文" };
  }
  if (!executionContext) {
    return { success: false, data: null, error: "此工具需要登录会话（durable 路径）" };
  }

  try {
    const result = await parseRejectionNotice(text, { signal: executionContext.signal });
    if (!result.ok || !result.parse) {
      return { success: false, data: null, error: result.error || "解析失败", errorCategory: "transient", recoverable: true };
    }
    const parse: ParsedRejection = result.parse;
    // 候选态入账：用户确认后才激活（ADR-0034；confirmRejectionToLedger 供治理确认路径调用）
    const { getDatabaseDriver, isPostgresConfigured } = await import("@/lib/postgres");
    if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) {
      return { success: true, data: { parse, ledgerStatus: "skipped_postgres_only" }, llmSummary: "解析成功（本地非 Postgres 模式不入账）", uiPayload: { type: "rejection_parse", parse, ledgerStatus: "skipped" } };
    }
    const { admitMemory } = await import("@/lib/memory/admission");
    const admitted = await admitMemory({
      userId: executionContext.principal.userId,
      agentId: "general",
      kind: "session_observation",
      sourceType: "application",
      sourceId: `rejection_parse:${Date.now()}`,
      fact: {
        partition: "core",
        subject: parse.company || "未知公司",
        predicate: "rejection_reason",
        object: { role: parse.role, reasonLabel: parse.reasonLabel, freeText: parse.freeText, pendingUserConfirmation: true },
        canonicalText: `${parse.company || "某公司"}${parse.role ? ` ${parse.role}` : ""} 的拒绝原因（待确认）：${REJECTION_LABEL_DESCRIPTIONS[parse.reasonLabel]}${parse.freeText ? `——${parse.freeText}` : ""}`,
        confidence: 0.6,
        importance: 0.65,
      },
      evidence: {
        quote: parse.quote,
        extractionMethod: "rejection_notice_parse",
        metadata: { closedSet: REJECTION_REASON_LABELS, reasonLabel: parse.reasonLabel },
      },
    });
    const ledgerStatus = admitted.outcome === "candidate" ? "pending_confirmation" : admitted.outcome;
    return {
      success: true,
      data: { parse, ledgerStatus, candidateId: admitted.candidate?.id },
      llmSummary: `已解析拒绝原因：${REJECTION_LABEL_DESCRIPTIONS[parse.reasonLabel]}。候选记忆已创建，等你在记忆管理里确认后生效。`,
      uiPayload: { type: "rejection_parse", parse, ledgerStatus, candidateId: admitted.candidate?.id },
      rawData: { parse, ledgerStatus },
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: `拒信解析失败: ${error instanceof Error ? error.message : "未知错误"}`,
      errorCategory: "transient",
      recoverable: true,
    };
  }
}

export const logRejectionNotice: ToolDefinition = {
  name: "log_rejection_notice",
  description: "粘贴拒信/HR 消息原文，解析出封闭集内的拒绝原因标签（附原文引用），以候选态写入记忆账本；用户确认后才生效。",
  parameters: {
    text: { type: "string", required: true, description: "拒信/邮件/HR 消息的原文文本。" },
  },
  category: "action",
  handler,
  formatResult: (result: ToolResult): string => {
    if (!result.success) return `拒信解析失败: ${result.error}`;
    const data = result.data as { parse?: ParsedRejection; ledgerStatus?: string } | null;
    if (!data?.parse) return "解析完成（无数据）";
    return [
      `拒绝原因：${REJECTION_LABEL_DESCRIPTIONS[data.parse.reasonLabel]}`,
      `原文引用：${data.parse.quote}`,
      data.parse.freeText ? `补充：${data.parse.freeText}` : "",
      `入账状态：${data.ledgerStatus}（候选态，需用户在记忆管理确认后生效）`,
    ].filter(Boolean).join("\n");
  },
};

