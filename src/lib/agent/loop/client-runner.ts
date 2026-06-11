import type { LoopConfig, LoopState, ResultQuality, SSEEvent } from "./types";
import { DEFAULT_LOOP_CONFIG } from "./types";
import { isGarbledText } from "./text-quality";
import { executeTool, formatToolResult, getTool } from "@/lib/agent/tools";
import type { ToolResult, ErrorCategory } from "@/lib/agent/tools/types";
import { enforceToolPolicy, inferCompanyFromMessages, isToolAllowedInMode } from "./tool-policy";
import type { InterviewSessionState } from "@/types";
import type { InterviewRebindAction } from "@/lib/agent/interview-rebind-policy";
import db from "@/lib/db";
import { createJD } from "@/lib/jd-storage";
import { buildImageIntakeToolCall, inferPreferredDocumentTypeFromText, type ImageDocumentType, type ImageIntakeResult } from "@/lib/agent/image-intake";
import { buildImageRouteAssistantReply, routeImageIntake } from "@/lib/agent/image-intake-router";
import {
  completePendingReferenceResumeSave,
  type PendingReferenceResumeSaveAction,
} from "@/lib/agent/reference-resume-save-flow";
import { buildResumeEditProposalActionPlan, buildResumeSavePlan } from "@/lib/agent/resume-save-guard";
import type { AgentTaskContract } from "@/lib/agent/task-contract";
import { requiresReadBackVerification } from "@/lib/agent/tools/readback-verification";

export type { SSEEvent };

type LoopMessage = { role: string; content: string; images?: string[] };

interface AgentLoopRuntimeContext {
  imageIntake?: ImageIntakeResult | null;
  preferredDocumentType?: ImageDocumentType;
  interviewState?: InterviewSessionState;
  interviewRebindAction?: InterviewRebindAction;
  pendingReferenceResumeSave?: PendingReferenceResumeSaveAction;
  taskContract?: AgentTaskContract | null;
}

/* ── Result quality check ── */

const GARBLED_RECOVERY_HINT =
  "内容编码异常（乱码），无法自动解析。请直接告知用户文档可能存在编码问题，" +
  "并引导用户：1) 直接粘贴简历文本内容 2) 将文档另存为 UTF-8 编码的 .txt 文件后重新上传 3) 发送截图";

function checkResultQuality(formatted: string): ResultQuality {
  const trimmed = formatted.trim();
  if (!trimmed || trimmed === "未找到相关结果" || trimmed === "搜索失败: 未找到相关结果") {
    return "empty";
  }
  const garbagePatterns = [
    /被惡魔附身/,
    /理想之城/,
    /電視劇/,
    /动漫/,
    /游戏/,
    /小说/,
    /連載/,
  ];
  if (garbagePatterns.some((p) => p.test(trimmed))) {
    return "irrelevant";
  }
  // Must be AFTER empty/irrelevant checks — garbled text is non-empty and non-entertainment
  if (isGarbledText(trimmed)) {
    return "garbled";
  }
  return "good";
}

/* ── Error category dispatch (modeled after OpenAI Assistants + LangChain) ── */

const ERROR_CATEGORY_ACTIONS: Record<ErrorCategory, { autoRetry: boolean; degradeToUser: boolean }> = {
  ok:              { autoRetry: false, degradeToUser: false },
  transient:       { autoRetry: true,  degradeToUser: false },
  permanent:       { autoRetry: false, degradeToUser: true  },
  need_user_input: { autoRetry: false, degradeToUser: true  },
};

/** Resolve errorCategory from a ToolResult. Falls back to "permanent" for
 *  unclassified failures (no auto-retry without explicit opt-in). */
function resolveErrorCategory(result: ToolResult): ErrorCategory {
  if (result.errorCategory) return result.errorCategory;
  // Backward compat: old tools without errorCategory — success=ok, failure=permanent
  return result.success ? "ok" : "permanent";
}

function injectTaskContractForWriteTool(
  toolName: string,
  params: Record<string, unknown>,
  contract?: AgentTaskContract | null,
): void {
  if (toolName !== "save_resume_section" || contract?.taskType !== "resume_edit") return;
  if (contract.baseHash && typeof params.baseHash !== "string") params.baseHash = contract.baseHash;
  if (contract.baseVersion && typeof params.baseVersion !== "string") params.baseVersion = contract.baseVersion;
}

export const AGENT_LOOP_MAX_MESSAGES = 30;
export const AGENT_LOOP_MAX_CONTEXT_TOKENS = 64000;
export const AGENT_LOOP_COMPRESSED_KEEP_LAST = 15;

function injectLatestImagesForImageTool(
  toolName: string,
  params: Record<string, unknown>,
  messages: LoopMessage[],
): void {
  const toolDef = getTool(toolName);
  if (!toolDef?.parameters?.images) return;
  const hasImages = Array.isArray(params.images) && params.images.length > 0;
  if (hasImages) return;
  const inferredImages = latestUserImages(messages);
  if (inferredImages.length > 0) params.images = inferredImages;
}

/* ── Tool call handling (native function calling) ── */

type NativeToolCall = { id: string; name: string; arguments: string };

/* ── Context helpers ── */

function estimateTokens(messages: { role: string; content: string }[]): number {
  return messages.reduce((sum, m) => sum + m.content.replace(/[\u4e00-\u9fff]/g, 'aa').length, 0);
}

function truncateContext(
  messages: LoopMessage[],
  keepLast: number,
): LoopMessage[] {
  if (messages.length <= keepLast) return messages;
  return messages.slice(-keepLast);
}

function willTruncateOutboundMessages(
  messages: LoopMessage[],
  searchProgress: string,
  skipResearchProtocol?: boolean,
): boolean {
  const protocolCount = skipResearchProtocol ? 0 : 1;
  const searchProgressCount = searchProgress ? 1 : 0;
  return messages.length + protocolCount + searchProgressCount > AGENT_LOOP_MAX_MESSAGES;
}

/** Enforce context budget before pushing. Harness hard-gate, not prompt suggestion. */
function pushWithBudget(
  ctx: LoopMessage[],
  msg: { role: string; content: string },
  maxTokens: number,
): void {
  ctx.push(msg);
  const currentTokens = ctx.reduce((sum, m) => sum + m.content.length, 0);
  if (currentTokens > maxTokens) {
    // Aggressive truncation: keep only last 15 messages
    const kept = ctx.slice(-15);
    ctx.length = 0;
    ctx.push(...kept);
  }
}

function inferDecodeTextFromMessages(messages: { role: string; content: string }[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    const text = msg.content?.trim();
    if (!text || text.startsWith("<!--")) continue;
    return text.length > 4000 ? text.slice(0, 4000) : text;
  }
  return null;
}

function latestUserImages(messages: LoopMessage[]): string[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    if (!Array.isArray(msg.images)) continue;
    const images = msg.images.filter((src) => typeof src === "string" && src.startsWith("data:image/"));
    if (images.length > 0) return images.slice(0, 5);
  }
  return [];
}

function latestUserText(messages: LoopMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    const text = msg.content?.trim();
    if (text) return text;
  }
  return "";
}

/** Get LLM context text from a ToolResult.
 *  Triple-pipe: prefers result.llmSummary, falls back to formatResult(data) for unmigrated tools.
 *  Per-tool cap from ToolDefinition.toolCtxCap, default 800 chars. */
const DEFAULT_TOOL_CTX_CAP = 800;
function getLLMContext(result: ToolResult, toolName: string): string {
  // New tools: use llmSummary directly
  let text = result.llmSummary ?? "";
  // Fallback: unmigrated tools still use formatResult
  if (!text) {
    const toolDef = getTool(toolName);
    if (toolDef?.formatResult) text = toolDef.formatResult(result);
  }
  const toolDef = getTool(toolName);
  const max = toolDef?.toolCtxCap ?? DEFAULT_TOOL_CTX_CAP;
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n<!-- 结果已截断，完整数据仅展示在 UI 中 -->";
}

type JDEvalBlock = { content?: string; score?: number | string };
type JDRiskSignal = { signal?: unknown; excerpt?: unknown; severity?: unknown };

const JD_SUMMARY_BLOCK_LABELS: Record<string, string> = {
  a: "A 职位概览",
  b: "B 简历匹配",
  c: "C 职级与策略",
  d: "D 薪资与市场",
  e: "E 定制化方案",
  f: "F 面试准备",
  g: "G 职位合法性",
};

function numericScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function cleanBlockLine(content: string): string {
  const tableCandidate = pickTableCandidate(content);
  const lines = content
    .split(/\r?\n/)
    .map((line) => normalizeSummaryLine(line))
    .filter(Boolean)
    .filter((line) => !isNoiseSummaryLine(line));
  const picked = tableCandidate || lines[0] || "";
  return truncateSummaryLine(picked);
}

function isNoiseSummaryLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^\|.*\|$/.test(trimmed)) return true;
  if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(trimmed)) return true;
  if (/^A-G|^评分|^得分|^Score/i.test(trimmed)) return true;
  if (/^(好的|已完成|我已完成|作为AI求职评估引擎|以下是|下面是)/.test(trimmed)) return true;
  if (/修改前.*修改后.*原因/.test(trimmed)) return true;
  if (/^(题型|考察点|JD\s*关联|简历关联|面试准备建议)[:：]/i.test(trimmed)) return true;
  return false;
}

function normalizeSummaryLine(line: string): string {
  return line
    .replace(/^[-*#>\s]+/, "")
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/, "")
    .trim();
}

function truncateSummaryLine(line: string, max = 70): string {
  const clean = line.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function pickTableCandidate(content: string): string {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!/^\|.*\|$/.test(line)) continue;
    const cells = line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.replace(/\*\*/g, "").trim())
      .filter(Boolean);
    if (cells.length < 2) continue;
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
    const joined = cells.join(" ");
    if (/修改前.*修改后.*原因/.test(joined)) continue;
    if (/^(字段|维度|项目|JD要求|要求|问题|场景)$/.test(cells[0]) && /^(内容|分析|匹配|建议|原因|回答)$/.test(cells[1])) continue;

    const candidate = cells.length === 2
      ? `${cells[0]}：${cells[1]}`
      : cells.slice(0, 3).join("；");
    if (!isNoiseSummaryLine(candidate)) return candidate;
  }
  return "";
}

function blockSummaryFallback(blockKey: string): string {
  const fallback: Record<string, string> = {
    a: "职位基础信息已提取，需核对公司、岗位、领域与工作模式。",
    b: "需要结合简历判断核心要求、证据强弱和主要能力缺口。",
    c: "需要确认岗位职级、经验年限和候选人当前阶段是否匹配。",
    d: "薪资范围、奖金、五险一金和加班强度仍需进一步核实。",
    e: "简历需要围绕 JD 关键词、项目证据和量化结果做定制化表达。",
    f: "面试应重点准备岗位核心能力、缺口解释和 STAR 项目故事。",
    g: "需要核实职位真实性、用工形式、隐性强度和招聘风险。",
  };
  return fallback[blockKey] || "该维度已完成评估，建议查看完整报告确认细节。";
}

function formatBlockSummary(blockKey: string, value: JDEvalBlock | string | undefined): string {
  const block = typeof value === "string" ? { content: value } : value;
  const score = numericScore(block?.score);
  const scoreText = score === null ? "" : `（${Number(score.toFixed(1))}/5）`;
  const content = typeof block?.content === "string" ? cleanBlockLine(block.content) : "";
  return `${JD_SUMMARY_BLOCK_LABELS[blockKey]}${scoreText}：${content || blockSummaryFallback(blockKey)}`;
}

function formatRiskSignals(data: Record<string, unknown>): string[] {
  const raw = Array.isArray(data.risks) ? data.risks : Array.isArray(data.riskSignals) ? data.riskSignals : [];
  const signals = raw
    .map((item) => {
      const risk = (item && typeof item === "object" ? item : {}) as JDRiskSignal;
      const signal = typeof risk.signal === "string" ? risk.signal.trim() : "";
      const excerpt = typeof risk.excerpt === "string" ? risk.excerpt.trim() : "";
      const severity = typeof risk.severity === "string" ? risk.severity.trim() : "";
      if (!signal) return "";
      const label = severity === "critical" ? "严重" : severity === "high" ? "高风险" : severity === "medium" ? "中风险" : "提示";
      return `${label}：${signal}${excerpt ? `（${truncateSummaryLine(excerpt, 34)}）` : ""}`;
    })
    .filter(Boolean)
    .slice(0, 3);
  return signals.length > 0 ? signals : ["暂未命中已知招聘黑话/风险词，但仍建议面试核验工作强度、用工形式和薪资结构。"];
}

function blockRiskFallback(blockKey: string): string {
  const fallback: Record<string, string> = {
    a: "公司与岗位信息仍需确认真实性和稳定性。",
    b: "岗位描述里可能存在强度、合规或隐性要求风险。",
    c: "你的经历与 JD 核心要求之间可能存在明显差距。",
    d: "薪资、职级或发展空间需要进一步确认。",
    e: "岗位能力模型与现有背景的迁移成本需要评估。",
    f: "投递策略需要结合你的优先级再判断。",
    g: "需要补充关键信息后再做最终决策。",
  };
  return fallback[blockKey] || "该维度存在不确定性，建议面试前重点核实。";
}

export function formatJDEvaluationSummary(data: Record<string, unknown>): string {
  const company = String(data.company || "未知公司");
  const role = String(data.role || "未知岗位");
  const score = numericScore(data.overallScore);
  const scoreText = score === null ? "已生成" : `${Number(score.toFixed(1))}/5`;
  const verdict = score === null
    ? "已完成评估"
    : score >= 4.2
      ? "建议投递"
      : score >= 3.5
        ? "可以投递，但需要确认风险"
        : score >= 2.5
          ? "谨慎投递"
          : "不建议投递";
  const archetype = data.archetype ? ` · ${String(data.archetype)}` : "";
  const reportNum = data.reportNum ? `报告 #${String(data.reportNum).padStart(3, "0")}` : "报告已保存";
  const blocks = (data.blocks && typeof data.blocks === "object" ? data.blocks : {}) as Record<string, JDEvalBlock | string>;
  const blockLines = Object.keys(JD_SUMMARY_BLOCK_LABELS).map((key) => formatBlockSummary(key, blocks[key]));
  const riskLines = formatRiskSignals(data);

  return [
    "## JD 评估摘要",
    "",
    `结论：${verdict}（总分 ${scoreText}）`,
    `岗位：${company} — ${role}${archetype}`,
    "",
    "A-G 速览：",
    ...blockLines.map((line) => `- ${line}`),
    "",
    "行业黑话 / 风险扫描：",
    ...riskLines.map((line) => `- ${line}`),
    "",
    `${reportNum}，完整 A-G 报告已保存，可在报告库或 JD 管理查看，也可下载 PDF。`,
  ].join("\n");
}

/* ── Think proxy helpers ── */

const RESEARCH_PROTOCOL = `\n\n【研究流程】
1. 拆实体：用户提到了几个独立实体？不要把不同实体合并搜索
   - 例：「安世亚太和大连的CAE企业」→ 实体1=安世亚太（公司），实体2=大连的CAE企业（需发现）
   - ❌ 错误：「安世亚太 大连 分公司」（把两个独立实体合并了）
2. 先发现再深入：对于"某地的XX企业"这类，先搜"XX 有哪些企业"，拿到名单后再逐个搜
3. 每个实体单独搜一次
4. 验证结果质量（电视剧/游戏=失败，换词重试）
5. 全部搜完后整合输出

**第1步必须做实体拆解，不要把"A公司和B地的X企业"合并成一个搜索。**`;

function injectResearchProtocol(
  messages: { role: string; content: string }[],
  searchProgress: string,
  skip?: boolean,
): { role: string; content: string }[] {
  if (skip) return messages;
  // Inject as a separate system message instead of appending to user message
  // to avoid confusing the LLM about what the user actually said
  const withProtocol = [...messages];
  withProtocol.push({ role: "system", content: RESEARCH_PROTOCOL.trim() });
  return withProtocol;
}

function buildSearchProgress(
  recentCalls: { name: string; params: string; result: string }[],
  isFirstIteration: boolean,
): string {
  if (isFirstIteration || recentCalls.length === 0) return "";
  const calls = recentCalls
    .map((c) => `  - web_search("${(JSON.parse(c.params) as Record<string,unknown>).query}")`)
    .join("\n");
  return `\n\n【已执行的搜索】\n${calls}\n【注意】如果以上搜索还没覆盖用户提到的所有实体，请继续搜索遗漏的实体。`;
}

async function fetchFromThinkProxy(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
  searchProgress = "",
  skipResearchProtocol?: boolean,
  tools?: Array<{ type: string; function: object }>,
): Promise<Response> {
  let withDirective = injectResearchProtocol(messages, searchProgress, skipResearchProtocol);
  if (searchProgress) {
    withDirective = [...withDirective, { role: "user" as const, content: searchProgress }];
  }
  const truncated = withDirective.slice(-AGENT_LOOP_MAX_MESSAGES);
  // Combine user abort signal with a 120s timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('think proxy timeout')), 120_000);
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  try {
    return await fetch("/api/agent/think", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemPrompt, messages: truncated, ...(tools?.length ? { tools } : {}) }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ── Streaming Think Response Collector ── */

/**
 * Reads SSE stream from think proxy. Text is buffered until we know whether
 * the model is calling tools, so pre-tool chatter does not leak into chat.
 */
async function* collectThinkResponseStreaming(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<SSEEvent, { text: string; toolCalls: NativeToolCall[]; finishReason: string }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  const toolCalls: NativeToolCall[] = [];
  let finishReason = "";
  let buffer = "";

  // Abort promise: resolves with a sentinel when signal fires
  const abortPromise = signal
    ? new Promise<'aborted'>((resolve) => {
        if (signal.aborted) { resolve('aborted'); return; }
        signal.addEventListener('abort', () => resolve('aborted'), { once: true });
      })
    : null;

  try {
    while (true) {
      if (signal?.aborted) break;
      const result = abortPromise
        ? await Promise.race([reader.read(), abortPromise])
        : await reader.read();
      if (result === 'aborted') break;
      const { done, value } = result as ReadableStreamReadResult<Uint8Array>;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "text" && parsed.content) {
            fullText += parsed.content;
          } else if (parsed.type === "finish_reason" && parsed.finish_reason) {
            finishReason = parsed.finish_reason as string;
          } else if (parsed.type === "tool_calls" && Array.isArray(parsed.tool_calls)) {
            for (const tc of parsed.tool_calls) {
              toolCalls.push(tc);
            }
          }
        } catch {
          /* skip */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (toolCalls.length > 0) {
    yield { type: "tool_calls", tool_calls: toolCalls };
  } else if (fullText) {
    yield { type: "text", content: fullText };
  }

  return { text: fullText, toolCalls, finishReason };
}

/* ── Agent Loop (client-side) — quality-gated ReAct cycle ── */

export async function* agentLoopClient(
  systemPrompt: string,
  messages: LoopMessage[],
  config: LoopConfig = DEFAULT_LOOP_CONFIG,
  signal?: AbortSignal,
  skipResearchProtocol?: boolean,
  toolWhitelist?: string[],
  tools?: Array<{ type: string; function: object }>,
  runtimeContext?: AgentLoopRuntimeContext,
): AsyncGenerator<SSEEvent> {
  const state: LoopState = {
    iteration: 0,
    consecutiveFailures: 0,
    contextSize: estimateTokens(messages) + systemPrompt.replace(/[\u4e00-\u9fff]/g, 'aa').length,
    phase: "understanding",
  };

  let ctx: LoopMessage[] = messages.map((m) => ({ role: m.role, content: m.content, images: m.images }));
  let firstIteration = true;
  let autoRetryCount = 0;
  let forceTextOnly = false; // Set after degradeToUser: next iteration LLM responds with text only, no tools
  const MAX_AUTO_RETRY = 2;
  const recentCalls: { name: string; params: string; result: string }[] = [];
  // LangChain intermediate_steps pattern: accumulate structured step records for debugging & graceful degradation
  const intermediateSteps: { tool: string; params: string; category: ErrorCategory; summary: string }[] = [];
  let forcedImageToolConsumed = false;
  let forcedToolCall: NativeToolCall | null = null;

  while (state.iteration < config.maxIterations) {
    if (signal?.aborted) {
      yield { type: "done" };
      return;
    }

    state.iteration++;

    if (state.contextSize > AGENT_LOOP_MAX_CONTEXT_TOKENS) {
      state.phase = "compressing_context";
      yield { type: "phase", phase: "compressing_context" };
      await new Promise((resolve) => setTimeout(resolve, 120));
      ctx = truncateContext(ctx, AGENT_LOOP_COMPRESSED_KEEP_LAST);
      state.contextSize = estimateTokens(ctx);
    }

    // ── Phase 1: Understanding / Reflecting ──
    if (firstIteration) {
      state.phase = "understanding";
      yield { type: "phase", phase: "understanding" };
    } else {
      state.phase = "reflecting";
      yield { type: "phase", phase: "reflecting" };
    }

    const searchProgress = buildSearchProgress(recentCalls, firstIteration);

    if (firstIteration && runtimeContext?.pendingReferenceResumeSave) {
      const text = latestUserText(ctx);
      const completion = completePendingReferenceResumeSave(runtimeContext.pendingReferenceResumeSave, text);
      if (completion && "cancelled" in completion) {
        state.phase = "responding";
        yield { type: "phase", phase: "responding" };
        yield { type: "text", content: "好的，这次不保存为优秀简历。后续你想沉淀样本时再告诉我。" };
        yield { type: "done" };
        return;
      }
      if (completion && isToolAllowedInMode("save_reference_resume", toolWhitelist)) {
        forcedToolCall = {
          id: `forced-pending-save-reference-resume-${Date.now()}`,
          name: "save_reference_resume",
          arguments: JSON.stringify(completion),
        };
      }
    }

    if (firstIteration && !forcedToolCall) {
      const proposalActionPlan = buildResumeEditProposalActionPlan(ctx);
      if (proposalActionPlan) {
        const toolName =
          proposalActionPlan.action === "rollback"
            ? "rollback_resume_edit_proposal"
            : proposalActionPlan.action === "discard"
              ? "discard_resume_edit_proposal"
              : "apply_resume_edit_proposal";
        if (isToolAllowedInMode(toolName, toolWhitelist)) {
          forcedToolCall = {
            id: `forced-${toolName}-${Date.now()}`,
            name: toolName,
            arguments: JSON.stringify({ proposalId: proposalActionPlan.proposalId }),
          };
        }
      }
    }

    if (firstIteration && !forcedToolCall) {
      const resumeSavePlan = buildResumeSavePlan(ctx, toolWhitelist);
      if (resumeSavePlan) {
        const proposalToolName = isToolAllowedInMode("create_resume_edit_proposal", toolWhitelist)
          ? "create_resume_edit_proposal"
          : "save_resume_section";
        forcedToolCall = {
          id: `forced-${proposalToolName}-${Date.now()}`,
          name: proposalToolName,
          arguments: JSON.stringify({
            section: resumeSavePlan.section,
            content: resumeSavePlan.content,
            proposedContent: resumeSavePlan.content,
            reason: resumeSavePlan.reason,
            riskFlags: ["agent_generated", resumeSavePlan.reason],
          }),
        };
      }
    }

    if (firstIteration && !forcedImageToolConsumed && !forcedToolCall) {
      const images = latestUserImages(ctx);
      const text = latestUserText(ctx);
      const preferredDocumentType =
        runtimeContext?.preferredDocumentType ?? inferPreferredDocumentTypeFromText(text);
      const imagePlan = buildImageIntakeToolCall(
        text,
        images,
        runtimeContext?.imageIntake ?? null,
        toolWhitelist,
        preferredDocumentType,
      );
      const decision = images.length > 0
        ? routeImageIntake(text, runtimeContext?.imageIntake ?? null)
        : null;
      if (
        decision &&
        !imagePlan &&
        decision.route !== "evaluate_jd" &&
        decision.route !== "evaluate_offer"
      ) {
        state.phase = "responding";
        yield { type: "phase", phase: "responding" };
        yield {
          type: "text",
          content: buildImageRouteAssistantReply(decision, runtimeContext?.imageIntake ?? null),
        };
        yield { type: "done" };
        return;
      }
      if (imagePlan) {
        forcedImageToolConsumed = true;
        forcedToolCall = {
          id: `forced-image-${imagePlan.name}-${Date.now()}`,
          name: imagePlan.name,
          arguments: JSON.stringify(imagePlan.params),
        };
      }
    }

    let thinkText: string;
    let toolCalls: NativeToolCall[];
    let finishReason: string;
    try {
      if (forcedToolCall) {
        thinkText = "";
        toolCalls = [forcedToolCall];
        finishReason = "tool_calls";
        forcedToolCall = null;
      } else {
        if (willTruncateOutboundMessages(ctx, searchProgress, skipResearchProtocol)) {
          state.phase = "compressing_context";
          yield { type: "phase", phase: "compressing_context" };
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
        const thinkResponse = await fetchFromThinkProxy(systemPrompt, ctx, signal, searchProgress, skipResearchProtocol, tools);
        if (!thinkResponse.ok) {
          yield { type: "phase", phase: "responding" };
          yield { type: "text", content: `AI 请求失败: ${thinkResponse.status}` };
          yield { type: "done" };
          return;
        }

        // Use streaming collector — yields text chunks as they arrive
        const streamGen = collectThinkResponseStreaming(thinkResponse, signal);
        let streamResult: IteratorResult<SSEEvent, { text: string; toolCalls: NativeToolCall[]; finishReason: string }>;
        while (true) {
          streamResult = await streamGen.next();
          if (streamResult.done) break;
          yield streamResult.value;
        }
        thinkText = streamResult.value.text;
        toolCalls = streamResult.value.toolCalls;
        finishReason = streamResult.value.finishReason;
        console.log("[loop] thinkText length:", thinkText.length, "toolCalls:", toolCalls.length, "finishReason:", finishReason);
      }
    } catch (err) {
      yield { type: "phase", phase: "responding" };
      yield { type: "text", content: `请求失败: ${err instanceof Error ? err.message : "未知错误"}` };
      yield { type: "done" };
      return;
    }

    if (signal?.aborted) {
      yield { type: "done" };
      return;
    }

    // ── forceTextOnly guard: after permanent error, LLM must respond with text, no tools ──
    if (forceTextOnly) {
      state.phase = "responding";
      yield { type: "phase", phase: "responding" };
      if (thinkText.trim()) {
        // Text was already yielded in streaming, just break
      } else {
        yield { type: "text", content: "抱歉，操作未能完成。请换个方式提问或稍后重试。" };
      }
      ctx.push({ role: "assistant", content: thinkText });
      break;
    }

    // ── Decide: continue or stop? Model controls this via finish_reason (Anthropic pattern) ──
    // Backward compat: if finish_reason is missing (old think proxy), fall back to toolCalls.length
    const shouldContinue = finishReason === "tool_calls" || (toolCalls.length > 0 && !finishReason);
    if (!shouldContinue) {
      // ── Model says stop → Respond ──
      state.phase = "responding";
      yield { type: "phase", phase: "responding" };

      let responseText = thinkText.trim();
      if (!responseText) {
        yield { type: "text", content: "操作完成。" };
      }

      ctx.push({ role: "assistant", content: thinkText });
      break;
    }

    // ── Phase 2: Executing (native tool calls) ──
    // Anthropic parallel tool_use pattern: independent query tools run concurrently
    const allIndependent = toolCalls.length > 1 && toolCalls.every(tc => {
      try { const p = JSON.parse(tc.arguments); return p && typeof p === "object"; } catch { return false; }
    }) && toolCalls.every(tc => isToolAllowedInMode(tc.name, toolWhitelist))
      && toolCalls.every(tc => {
        try {
          return !enforceToolPolicy({
            toolName: tc.name,
            params: JSON.parse(tc.arguments) as Record<string, unknown>,
            messages: ctx,
            toolWhitelist,
            interviewState: runtimeContext?.interviewState,
            interviewRebindAction: runtimeContext?.interviewRebindAction,
          });
        } catch {
          return false;
        }
      });

    if (allIndependent) {
      state.phase = "executing";
      yield { type: "phase", phase: "executing" };
      const parallelParams = toolCalls.map(tc => {
        const params = JSON.parse(tc.arguments) as Record<string, unknown>;
        injectLatestImagesForImageTool(tc.name, params, ctx);
        injectTaskContractForWriteTool(tc.name, params, runtimeContext?.taskContract);
        return { tc, params };
      });
      for (const { tc, params } of parallelParams) yield { type: "tool_call", name: tc.name, params };

      const timeoutResult = { success: false, data: null, error: '工具执行超时', errorCategory: 'transient' as const, recoverable: true };

      const parallelResults = await Promise.race([
        Promise.all(parallelParams.map(({ tc, params }) =>
          executeTool(tc.name, params).catch(err => ({ success: false, data: null, error: err instanceof Error ? err.message : "Tool error", errorCategory: "transient" as const, recoverable: true }))
        )),
        new Promise<typeof timeoutResult[]>((resolve) => setTimeout(() => resolve(parallelParams.map(() => ({ ...timeoutResult }))), 30_000)),
      ]);

      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        const params = parallelParams[i].params;
        const paramsKey = JSON.stringify(params);
        const toolResult = parallelResults[i];
        const formatted = formatToolResult(toolResult, tc.name);

        yield { type: "tool_result", name: tc.name, result: formatted, success: toolResult.success, data: toolResult.data, uiPayload: (toolResult as ToolResult).uiPayload, verifiedAction: (toolResult as ToolResult).verifiedAction };
        if (!toolResult.success) yield { type: "tool_error", name: tc.name, error: toolResult.error || "未知错误", recoverable: toolResult.recoverable !== false };

        const category = resolveErrorCategory(toolResult);
        const action = ERROR_CATEGORY_ACTIONS[category];
        if (action.degradeToUser) {
          const errorObs = `[TOOL_ERROR tool=${tc.name} category=${category}] ${toolResult.error || "操作失败"}\n\n请基于此错误告知用户发生了什么，并给出具体的下一步建议。`;
          ctx.push({ role: "user", content: errorObs });
          forceTextOnly = true;
        } else if (tc.name === "evaluate_jd_full" && toolResult.success && toolResult.data && typeof toolResult.data === "object") {
          const jdData = toolResult.data as Record<string, unknown>;
          ctx.push({
            role: "assistant",
            content: formatJDEvaluationSummary(jdData),
          });
          yield { type: "phase", phase: "responding" };
          yield { type: "text", content: formatJDEvaluationSummary(jdData) };
          yield { type: "done" };
          return;
        } else {
          if (action.autoRetry) autoRetryCount++; else autoRetryCount = 0;
          // Terminal export tools: don't feed content back to LLM context — just confirm download
          if (tc.name === "export_file" || tc.name === "download_report_pdf") {
            const d = (toolResult.data as { filename?: string }) || {};
            ctx.push({ role: "user", content: `<!-- tool:${tc.name} result -->已导出文件: ${d.filename || "download"}。用户设备已自动下载，你不需要再提下载操作。` });
          } else {
            const catHints: Record<ErrorCategory, string> = { ok: "", transient: "\n<!-- ⚠️ 请换参数重试。 -->", permanent: "", need_user_input: "" };
            // Parallel path: aggressive cap (500 chars) — LLM just needs to know which results to dig into
            const ctxCap = 500;
            const llmText = getLLMContext(toolResult, tc.name);
            const capped = llmText.length > ctxCap ? llmText.slice(0, ctxCap) + "\n<!-- 并行结果截断，需要详情的工具结果请在下一轮单读 -->" : llmText;
            ctx.push({ role: "user", content: `<!-- tool:${tc.name} result -->\n${capped}${catHints[category]}\n\n【请基于以上工具返回数据简洁回答。不要把简历全文或完整报告正文粘贴到聊天框。】` });
          }
        }
        intermediateSteps.push({ tool: tc.name, params: paramsKey, category, summary: toolResult.success ? formatted.slice(0, 100) : (toolResult.error || "失败").slice(0, 100) });
        if (!requiresReadBackVerification(tc.name)) {
          recentCalls.push({ name: tc.name, params: paramsKey, result: formatted });
          if (recentCalls.length > 5) recentCalls.shift();
        }
        state.contextSize = estimateTokens(ctx);
      }
      // Push summary after parallel batch
      if (toolCalls.length > 1) {
        ctx.push({ role: "user", content: `<!-- system -->并行调用了 ${toolCalls.length} 个工具。如果需要某个工具的完整结果，请单独调用该工具。现在请基于已有数据继续分析。` });
      }
      firstIteration = false;
      continue; // Skip the serial for loop below
    }

    for (const tc of toolCalls) {
      let params: Record<string, unknown>;
      try { params = JSON.parse(tc.arguments); } catch { continue; }
      if (tc.name === "evaluate_jd_full" && typeof params.target_company !== "string") {
        const inferredCompany = inferCompanyFromMessages(ctx);
        if (inferredCompany) params.target_company = inferredCompany;
      }
      injectLatestImagesForImageTool(tc.name, params, ctx);
      injectTaskContractForWriteTool(tc.name, params, runtimeContext?.taskContract);
      if (tc.name === "decode_black_market_terms") {
        const hasDecodeText = [params.text, params.phrase, params.jd_text]
          .some((value) => typeof value === "string" && value.trim());
        if (!hasDecodeText) {
          const inferredText = inferDecodeTextFromMessages(ctx);
          if (inferredText) params.text = inferredText;
        }
      }

      const paramsKey = JSON.stringify(params);
      const recent = requiresReadBackVerification(tc.name)
        ? undefined
        : recentCalls.find((c) => c.name === tc.name && c.params === paramsKey);
      let toolResult: ToolResult;
      let formatted: string;
      if (recent) {
        toolResult = { success: true, data: recent.result, errorCategory: "ok" as const };
        formatted = recent.result;
        console.log(`[loop] dedup: skipping repeat call to ${tc.name}`);
      } else {
        state.phase = "executing";
        yield { type: "phase", phase: "executing" };
        yield { type: "tool_call", name: tc.name, params };

        if (!isToolAllowedInMode(tc.name, toolWhitelist)) {
          const errMsg = `工具 ${tc.name} 不在当前 Agent 模式下可用`;
          console.warn(`[loop] blocked: ${errMsg}`);
          yield { type: "tool_result", name: tc.name, result: errMsg, success: false };
          ctx.push({ role: "user", content: `<!-- tool:${tc.name} result -->${errMsg}。请使用可用工具重新尝试，或直接基于已有知识回答。` });
          state.consecutiveFailures++;
          continue;
        }

        const policyResult = enforceToolPolicy({
          toolName: tc.name,
          params,
          messages: ctx,
          toolWhitelist,
          interviewState: runtimeContext?.interviewState,
          interviewRebindAction: runtimeContext?.interviewRebindAction,
        });
        if (policyResult) {
          toolResult = policyResult;
          formatted = formatToolResult(toolResult, tc.name);
          yield { type: "tool_result", name: tc.name, result: formatted, success: false, data: toolResult.data, uiPayload: toolResult.uiPayload, verifiedAction: toolResult.verifiedAction };
          yield { type: "tool_error", name: tc.name, error: toolResult.error || "工具调用被策略拦截", recoverable: false };
          ctx.push({ role: "user", content: `[TOOL_BLOCKED tool=${tc.name}] ${toolResult.llmSummary || toolResult.error || "工具调用被策略拦截"}\n\n请不要改用其它大工具重试。请基于已有本地上下文回答；缺少必要信息时只向用户索要那一项。` });
          forceTextOnly = true;
          continue;
        }

        try {
          toolResult = await executeTool(tc.name, params);
        } catch (execErr) {
          toolResult = { success: false, data: null, error: execErr instanceof Error ? execErr.message : "Tool execution error", errorCategory: "transient" as const };
        }

        // ═════════════════════════════════════════════════════════
        // Stream Delegation: if tool returned a ReadableStream,
        // read it and yield events through the generator loop.
        // ═════════════════════════════════════════════════════════
        const isStreaming = toolResult._streaming && toolResult.data;
        const toolStream = isStreaming
          ? (toolResult.data as Record<string, unknown>)?._stream as ReadableStream<Uint8Array> | undefined
          : undefined;

        if (toolStream) {
          const reader = toolStream.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          let finalData: Record<string, unknown> = {};
          let streamError = "";

          try {
            while (true) {
              if (signal?.aborted) { reader.cancel(); break; }
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              const streamLines = buf.split("\n");
              buf = streamLines.pop() || "";
              for (const streamLine of streamLines) {
                if (!streamLine.startsWith("data: ")) continue;
                try {
                  const event = JSON.parse(streamLine.slice(6));
                  // Forward stream events to UI
                  yield event as SSEEvent;
                  if (event.type === "error" && typeof event.message === "string") {
                    streamError = event.message;
                  }
                  // Extract finalData from the done event (flat fields, NOT nested under .data).
                  // Some valid evaluations may only have fallback company/role after OCR,
                  // while fatal OCR failures emit a bare done event with no jdText/blocks.
                  if (
                    event.type === "done" &&
                    (event.company || event.role || event.blocks || event.jdText || event.overallScore)
                  ) {
                    finalData = event as Record<string, unknown>;
                  }
                } catch { /* skip malformed */ }
              }
            }
          } finally {
            reader.releaseLock();
          }

          const hasUsableEvalData = Boolean(finalData.jdText || finalData.blocks || finalData.overallScore);
          if (streamError && !hasUsableEvalData) {
            formatted = `评估失败: ${streamError}`;
            yield { type: "tool_result", name: tc.name, result: formatted, success: false, data: { error: streamError } };
            yield { type: "tool_error", name: tc.name, error: streamError, recoverable: false };
            yield { type: "phase", phase: "responding" };
            const retryHint = tc.name === "evaluate_jd_full"
              ? "可以重新上传一张更清晰的原始 JD 截图，或直接粘贴 JD 文本/链接。"
              : tc.name === "evaluate_offer"
                ? "可以重新上传一张更清晰的原始 Offer 截图，或直接粘贴 Offer 文本。"
                : "可以重新上传一张更清晰的原始截图，或直接粘贴对应文本。";
            yield { type: "text", content: `${streamError}\n\n${retryHint}` };
            yield { type: "done" };
            return;
          }

          // Persist after stream completes
          console.log("[loop] persist check:", { company: finalData.company, role: finalData.role, hasBlocks: !!finalData.blocks });
          if (finalData.company && finalData.role) {
            try {
              const persistRes = await fetch("/api/agent/persist-eval", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(finalData),
              });
              const persistJson = await persistRes.json();
              console.log("[loop] persist result:", persistJson);
              if (persistJson.success) {
                // Inject real reportNum into finalData so formatResult uses it
                const d = finalData;
                const reportNum = persistJson.reportNum || 0;
                (d as Record<string, unknown>).reportNum = reportNum;
                (d as Record<string, unknown>).jdId = persistJson.jdId || null;
                (d as Record<string, unknown>).jdReadBackVerified = persistJson.jdReadBackVerified !== false;
                const blocks = (d.blocks || {}) as Record<string, { content: string; score: number }>;
                const today = new Date().toISOString().split("T")[0];
                try {
                  await db.reports.add({
                    reportNum,
                    date: (d.date as string) || today,
                    company: (d.company as string) || "",
                    role: (d.role as string) || "",
                    archetype: (d.archetype as string) || "",
                    overallScore: (d.overallScore as number) || 0,
                    legitimacy: (d.legitimacy as string) || "",
                    blocks: {
                      a: typeof blocks.a === "string" ? blocks.a : blocks.a?.content || "",
                      b: typeof blocks.b === "string" ? blocks.b : blocks.b?.content || "",
                      c: typeof blocks.c === "string" ? blocks.c : blocks.c?.content || "",
                      d: typeof blocks.d === "string" ? blocks.d : blocks.d?.content || "",
                      e: typeof blocks.e === "string" ? blocks.e : blocks.e?.content || "",
                      f: typeof blocks.f === "string" ? blocks.f : blocks.f?.content || "",
                      g: typeof blocks.g === "string" ? blocks.g : blocks.g?.content || "",
                    },
                    scores: {
                      a: blocks.a?.score || 0, b: blocks.b?.score || 0, c: blocks.c?.score || 0,
                      d: blocks.d?.score || 0, e: blocks.e?.score || 0, f: blocks.f?.score || 0, g: "",
                    },
                    keywords: Array.isArray(d.keywords) ? d.keywords as string[] : [],
                    createdAt: new Date(),
                  });
                } catch (e) { console.warn("[loop] dexie report save failed:", e); }

                // Save JD to client-side Dexie
                const jdText = (d.jdText as string) || "";
                if (jdText.trim().length >= 50) {
                  try {
                    await createJD({
                      company: (d.company as string) || "",
                      role: (d.role as string) || "",
                      sourceType: "agent",
                      body: jdText,
                      keywords: (Array.isArray(d.keywords) ? d.keywords : []) as string[],
                      reportId: reportNum,
                    });
                  } catch (e) { console.warn("[loop] dexie JD save failed:", e); }
                }

                let reportReadBackVerified = false;
                let reportReadBackError = "";
                if (reportNum > 0) {
                  try {
                    const verifyRes = await fetch(`/api/data/reports/${reportNum}`, { cache: "no-store" });
                    const verifyJson = await verifyRes.json().catch(() => ({}));
                    const row = (verifyJson.data || {}) as Record<string, unknown>;
                    reportReadBackVerified =
                      verifyRes.ok &&
                      verifyJson.success === true &&
                      Number(row.report_num) === Number(reportNum);
                    if (!reportReadBackVerified) {
                      reportReadBackError = verifyJson.error || `report #${reportNum} read-back did not match`;
                    }
                  } catch (error) {
                    reportReadBackError = error instanceof Error ? error.message : "report read-back failed";
                  }
                } else {
                  reportReadBackError = "persist API did not return reportNum";
                }
                (d as Record<string, unknown>).reportReadBackVerified = reportReadBackVerified;
                if (reportReadBackError) {
                  (d as Record<string, unknown>).reportReadBackError = reportReadBackError;
                }

                yield {
                  type: "persist_done",
                  reportNum: reportNum,
                  company: d.company as string,
                  role: d.role as string,
                  score: (d.overallScore as number) || 0,
                  readBackVerified: reportReadBackVerified,
                  readBackError: reportReadBackError || undefined,
                };
              }
            } catch (err) {
              console.error("[loop] persist failed:", err);
            }
          } else {
            console.warn("[loop] persist skipped: missing company or role");
          }

          if (requiresReadBackVerification(tc.name) && finalData.reportReadBackVerified !== true) {
            const readBackError = String(finalData.reportReadBackError || "High-risk streaming tool completed without read-back verification evidence.");
            formatted = `评估未完成可靠落库校验: ${readBackError}`;
            yield {
              type: "tool_result",
              name: tc.name,
              result: formatted,
              success: false,
              data: finalData,
              uiPayload: { readBackVerified: false, readBackError, gatedByReadBack: true },
            };
            yield { type: "tool_error", name: tc.name, error: readBackError, recoverable: false };
            yield { type: "phase", phase: "responding" };
            yield { type: "text", content: `${formatted}\n\n我已经阻止把这次结果当成已完成报告。请稍后重试，或把 JD 文本直接粘贴后重新评估。` };
            yield { type: "done" };
            return;
          }

          formatted = formatToolResult({ success: true, data: finalData, errorCategory: "ok" as const }, tc.name);
          yield { type: "tool_result", name: tc.name, result: formatted, success: true, data: finalData, uiPayload: toolResult.uiPayload, verifiedAction: toolResult.verifiedAction };

          if (tc.name === "evaluate_jd_full") {
            const summary = formatJDEvaluationSummary(finalData);
            yield { type: "phase", phase: "responding" };
            yield { type: "text", content: summary };
            yield { type: "done" };
            return;
          }

          // Push formatted result to context for LLM summary in next iteration
          if (tc.name === "export_file" || tc.name === "download_report_pdf") {
            const d = (finalData as { filename?: string }) || {};
            ctx.push({ role: "user", content: `<!-- tool:${tc.name} result -->已导出文件: ${d.filename || "download"}。用户设备已自动下载。` });
          } else {
            const llmText2 = getLLMContext(toolResult, tc.name);
            const followupInstruction = tc.name === "evaluate_jd_full"
              ? "【正式回复只输出结果摘要：最多 6 行。不要说“已读取/我先/正在/加载完毕”。不要输出完整 A-G 报告正文，不要输出表格。完整内容已保存到报告详情和 PDF。】"
              : tc.name === "generate_interview_questions"
                ? "【面试题已由 UI 卡片展示。你只允许输出一句话：请开始回答这一题。不要复述题目，不要输出题型/考察点/JD关联/简历关联，不要说已读取文件。】"
              : tc.name === "get_report_detail"
                ? "【聊天框只输出一句摘要和提示用户点击报告卡片。不要说“已读取/我先/正在/加载完毕”。禁止输出完整 A-G 报告正文。】"
                : tc.name === "read_file" || tc.name === "get_profile"
                  ? "【不要说明读取过程，直接继续完成用户原任务。不要说“已读取/我先读取/加载完毕/让我再读”。不要把简历全文粘贴到聊天框。】"
                  : tc.name === "update_report_metadata"
                    ? "【只确认已更新报告信息。不要重新评估，不要输出完整报告。】"
                    : "【正式回复直接给结果或下一步。不要说“已读取/我先/正在/加载完毕”。不要扩写成长报告；缺关键信息时只问缺的那一项。】";
            ctx.push({
              role: "user",
              content: `<!-- tool:${tc.name} result -->
${llmText2}

${followupInstruction}`,
            });
            // If a report was persisted, also push the reportNum so LLM can retrieve it later
            if ((finalData as Record<string, unknown>).reportNum) {
              ctx.push({
                role: "user",
                content: `<!-- system -->评估报告已保存，报告编号: ${(finalData as Record<string, unknown>).reportNum}。当用户说"看完整报告""展开报告"时，请调用 get_report_detail 并传入此报告编号。`,
              });
            }
          }
          state.contextSize = estimateTokens(ctx);
          state.consecutiveFailures = 0;
          if (!requiresReadBackVerification(tc.name)) {
            recentCalls.push({ name: tc.name, params: paramsKey, result: formatted });
            if (recentCalls.length > 5) recentCalls.shift();
          }
          continue; // Skip the normal post-tool logic below
        }

        // ── Non-streaming tool: existing logic ──
        formatted = formatToolResult(toolResult, tc.name);
      }

      yield { type: "tool_result", name: tc.name, result: formatted, success: toolResult.success, data: toolResult.data, uiPayload: toolResult.uiPayload, verifiedAction: toolResult.verifiedAction };

      if ((tc.name === "apply_resume_edit_proposal" || tc.name === "discard_resume_edit_proposal" || tc.name === "rollback_resume_edit_proposal" || tc.name === "save_resume_section") && toolResult.success) {
        yield { type: "phase", phase: "responding" };
        yield { type: "text", content: formatted || "简历已保存。" };
        yield { type: "done" };
        return;
      }

      if (tc.name === "save_reference_resume" && toolResult.success) {
        yield { type: "phase", phase: "responding" };
        yield { type: "text", content: toolResult.llmSummary || formatted || "优秀简历已保存。" };
        yield { type: "done" };
        return;
      }

      // ── Self-healing ──
      if (!toolResult.success) {
        yield { type: "tool_error", name: tc.name, error: toolResult.error || "未知错误", recoverable: toolResult.recoverable !== false };
      }

      state.phase = "verifying";
      yield { type: "phase", phase: "verifying" };

      const quality = checkResultQuality(formatted);
      yield { type: "result_quality", quality };

      if (toolResult.success) {
        state.consecutiveFailures = 0;
      } else {
        state.consecutiveFailures++;
      }

      // ── Error category dispatch (replaces qualityHint string splicing) ──
      const category = resolveErrorCategory(toolResult);
      const action = ERROR_CATEGORY_ACTIONS[category];

      if (action.degradeToUser) {
        // Anthropic pattern: errors are data, not exit signals.
        // Send the error as an Observation so the model can tell the user naturally.
        const errorObs = `[TOOL_ERROR tool=${tc.name} category=${category}] ${toolResult.error || "操作失败"}\n\n请基于此错误告知用户发生了什么，并给出具体的下一步建议。`;
        ctx.push({ role: "user", content: errorObs });
        state.contextSize = estimateTokens(ctx);
        forceTextOnly = true;
        intermediateSteps.push({ tool: tc.name, params: paramsKey, category, summary: (toolResult.error || "操作失败").slice(0, 100) });
        continue; // Let the model process the error in next iteration — DO NOT cache
      }

      // Only cache successful / non-degraded results
      if (!requiresReadBackVerification(tc.name)) {
        recentCalls.push({ name: tc.name, params: paramsKey, result: formatted });
        if (recentCalls.length > 5) recentCalls.shift();
      }

      if (action.autoRetry) {
        autoRetryCount++;
      } else {
        autoRetryCount = 0;
      }

      // Accumulate structured step record (LangChain pattern)
      intermediateSteps.push({
        tool: tc.name,
        params: paramsKey,
        category,
        summary: toolResult.success ? (formatted.slice(0, 100)) : (toolResult.error || "失败").slice(0, 100),
      });

      // Still build quality context for the LLM (lightweight, based on category)
      const categoryHints: Record<ErrorCategory, string> = {
        ok:              "",
        transient:       "\n<!-- ⚠️ 搜索未找到理想结果，请换参数重试。 -->",
        permanent:       "",
        need_user_input: "",
      };
      const hint = categoryHints[category]
        || (quality === "empty" ? "\n<!-- ⚠️ 搜索结果为空，请在下一轮换不同关键词重新搜索。不要直接回复用户。 -->"
            : quality === "irrelevant" ? "\n<!-- ⚠️ 搜索结果不相关（可能是同名文化作品等），请换更精确的关键词重新搜索。不要直接回复用户。 -->"
            : "");

      if (tc.name === "export_file" || tc.name === "download_report_pdf") {
        const d = (toolResult.data as { filename?: string }) || {};
        ctx.push({ role: "user", content: `<!-- tool:${tc.name} result -->已导出文件: ${d.filename || "download"}。用户设备已自动下载。` });
      } else {
        ctx.push({
          role: "user",
          content: `<!-- tool:${tc.name} result -->\n${getLLMContext(toolResult, tc.name)}${hint}\n\n${tc.name === "get_report_detail"
            ? "【聊天框只输出一句摘要和提示用户点击报告卡片。不要说“已读取/我先/正在/加载完毕”。禁止输出完整 A-G 报告正文。】"
            : tc.name === "generate_interview_questions"
              ? "【面试题已由 UI 卡片展示。你只允许输出一句话：请开始回答这一题。不要复述题目，不要输出题型/考察点/JD关联/简历关联，不要说已读取文件。】"
            : tc.name === "read_file" || tc.name === "get_profile"
              ? "【不要说明读取过程，直接继续完成用户原任务。不要说“已读取/我先读取/加载完毕/让我再读”。不要把简历全文粘贴到聊天框。】"
              : tc.name === "update_report_metadata"
                ? "【只确认已更新报告信息。不要重新评估，不要输出完整报告。】"
                : "【正式回复直接给结果或下一步。不要说“已读取/我先/正在/加载完毕”。不要扩写成长报告；缺关键信息时只问缺的那一项。】"}`,
        });
      }
      state.contextSize = estimateTokens(ctx);
    }

    // Hard stop: consecutively bad results
    if (state.consecutiveFailures >= 2) {
      yield { type: "phase", phase: "responding" };
      yield { type: "text", content: `工具连续失败 ${state.consecutiveFailures} 次，请检查配置或稍后重试。` };
      yield { type: "done" };
      return;
    }

    // Auto-retry limit
    if (autoRetryCount > MAX_AUTO_RETRY) {
      yield { type: "phase", phase: "responding" };
      yield { type: "text", content: `搜索暂不可用（已尝试 ${autoRetryCount} 次），以下是我基于已有知识的分析：` };
      const forceResponse = await fetchFromThinkProxy(systemPrompt, ctx, signal, "", skipResearchProtocol, tools);
      if (forceResponse.ok) {
        const streamGen = collectThinkResponseStreaming(forceResponse, signal);
        let streamResult: IteratorResult<SSEEvent, { text: string; toolCalls: NativeToolCall[] }>;
        while (true) {
          streamResult = await streamGen.next();
          if (streamResult.done) break;
          yield streamResult.value;
        }
      }
      yield { type: "done" };
      return;
    }

    firstIteration = false;
  }

  // Max iterations — force respond with structured summary (LangChain pattern)
  if (state.iteration >= config.maxIterations && state.phase !== "responding") {
    state.phase = "responding";
    yield { type: "phase", phase: "responding" };
    if (intermediateSteps.length > 0) {
      yield { type: "text", content: "任务未完成，请补充更多信息后再试一次。" };
    } else {
      yield { type: "text", content: "暂未完成，请重新提问。" };
    }
  }

  yield { type: "done" };
}
