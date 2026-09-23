/**
 * Server-side Agent ReAct Loop
 *
 * Runs inside /api/agent/run. Directly calls DeepSeek API (API key on server)
 * and executes tools via registry.execute() (no fetch proxy).
 *
 * Quality-gated loop logic ported from client-runner.ts.
 */
import type { LoopConfig, LoopState, SSEEvent, AgentPhase, ResultQuality, ModelRecoveryPolicy } from "./types";
import { DEFAULT_LOOP_CONFIG } from "./types";
import { isGarbledText } from "./text-quality";
import { executeTool, formatToolResult, getTool, registry } from "@/lib/agent/tools";
import { getAgentById } from "@/lib/agent/registry";
import type { ToolExecutionContext, ToolResult, ErrorCategory } from "@/lib/agent/tools/types";
import type { AgentDefinition } from "@/lib/agent/registry/types";
import { enforceToolPolicy, inferCompanyFromMessages, isToolAllowedInMode } from "./tool-policy";
import { ModelGatewayError, getDefaultModelChain, parseToolCallStream, streamChat, type GatewayMessage, type ModelChainEntry } from "@/lib/ai/model-gateway";
import type { InterviewSessionState } from "@/types";
import type { InterviewRebindAction } from "@/lib/agent/interview-rebind-policy";
import { requiresReadBackVerification } from "@/lib/agent/tools/readback-verification";
import { inferCompletedCriteriaFromToolResult, type AgentTaskContract } from "@/lib/agent/task-contract";
import { createTaskProgramStopGuard } from "@/lib/agent/task-program";
import { enforceToolGovernance } from "@/lib/agent/tool-governance";
import { executeGovernedRuntimeTool } from "@/lib/agent/runtime/governed-tool-runtime";
import { extractDsmlToolCalls } from "@/lib/agent/loop/dsml-tool-calls";

/* ── Context cap (per-tool) ── */
const DEFAULT_TOOL_CTX_CAP = 800;
function getLLMContext(result: ToolResult, toolName: string): string {
  let text = result.llmSummary ?? "";
  if (!text) {
    const toolDef = getTool(toolName);
    if (toolDef?.formatResult) text = toolDef.formatResult(result);
  }
  const toolDef = getTool(toolName);
  const max = toolDef?.toolCtxCap ?? DEFAULT_TOOL_CTX_CAP;
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n<!-- 结果已截断，完整数据仅展示在 UI 中 -->";
}

/* ── Quality check ── */

const GARBLED_RECOVERY_HINT =
  "内容编码异常（乱码），无法自动解析。请直接告知用户文档可能存在编码问题，" +
  "并引导用户：1) 直接粘贴简历文本内容 2) 将文档另存为 UTF-8 编码的 .txt 文件后重新上传 3) 发送截图";

function checkResultQuality(formatted: string): ResultQuality {
  const trimmed = formatted.trim();
  if (!trimmed || trimmed === "未找到相关结果" || trimmed === "搜索失败: 未找到相关结果") {
    return "empty";
  }
  // Detect obviously irrelevant Wikipedia results (e.g., TV dramas for company queries)
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
  policy_denied:   { autoRetry: false, degradeToUser: false },
};

function resolveErrorCategory(result: ToolResult): ErrorCategory {
  if (result.errorCategory) return result.errorCategory;
  return result.success ? "ok" : "permanent";
}

function inferDecodeTextFromMessages(messages: DeepSeekMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    const text = msg.content?.trim();
    if (!text || text.startsWith("<!--")) continue;
    return text.length > 4000 ? text.slice(0, 4000) : text;
  }
  return null;
}

function latestUserText(messages: DeepSeekMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    const text = msg.content?.trim();
    if (text) return text;
  }
  return "";
}

/* ── LLM API：统一走 ModelGateway ── */

function resolveLoopChain(modelPreference?: string, modelRecovery?: ModelRecoveryPolicy): ModelChainEntry[] {
  const chain = getDefaultModelChain();
  const preferredProvider = chain.find((candidate) => candidate.model === modelPreference)?.provider;
  const eligible = modelRecovery?.switchProvider && preferredProvider
    ? chain.filter((candidate) => candidate.provider !== preferredProvider)
    : chain;
  if (modelPreference && !modelRecovery?.switchProvider) {
    return [...eligible].sort((a) => (a.model === modelPreference ? -1 : 1));
  }
  return eligible;
}

interface DeepSeekMessage {
  role: string;
  content: string;
  images?: string[];
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

interface NativeToolCall {
  id: string;
  name: string;
  arguments: string;
}

/* ── Forced tool call builders (ported from the deleted client-runner) ──
 * Enforced product rule: a resume_edit run must produce a confirmable draft
 * before it may end. The remaining first-iteration forced calls from the
 * legacy loop land here as Task Program stages in M3. */

function inferResumeOptimizationSection(text: string): string {
  if (/个人概述|个人总结|简介|summary/i.test(text)) return "summary";
  if (/项目经验|项目经历|项目|projects?/i.test(text)) return "projects";
  if (/技能|技术栈|skills?/i.test(text)) return "skills";
  if (/教育背景|教育经历|学历|education/i.test(text)) return "education";
  return "experience";
}

export function buildRequiredResumeDraftToolCall(input: {
  contract?: AgentTaskContract | null;
  userText: string;
  successfulTools: Set<string>;
  allowedTools?: string[];
}): NativeToolCall | null {
  if (input.contract?.taskType !== "resume_edit") return null;
  const instruction = input.contract.target.trim() || input.userText.trim();
  if (!input.successfulTools.has("read_file")) return null;
  if ([
    "optimize_resume_section",
    "create_resume_edit_proposal",
    "apply_resume_edit_proposal",
    "save_resume_section",
  ].some((toolName) => input.successfulTools.has(toolName))) return null;
  if (input.allowedTools?.length && !input.allowedTools.includes("optimize_resume_section")) return null;

  return {
    id: `forced-optimize-resume-section-${Date.now()}`,
    name: "optimize_resume_section",
    arguments: JSON.stringify({
      section: inferResumeOptimizationSection(instruction),
      instruction,
      operation: "full",
      effort: 3,
    }),
  };
}

async function callLLM(
  messages: DeepSeekMessage[],
  systemPrompt: string,
  tools?: Array<{ type: string; function: object }>,
  modelPreference?: string,
  modelRecovery?: ModelRecoveryPolicy,
): Promise<{ text: string; toolCalls: NativeToolCall[] }> {
  const result = await streamChat({
    messages: messages as GatewayMessage[],
    systemPrompt,
    tools,
    stream: true,
    preferredModel: modelPreference && !modelRecovery?.switchProvider ? modelPreference : undefined,
    chain: resolveLoopChain(modelPreference, modelRecovery),
  });
  const parsed = await parseToolCallStream(result.response);
  const dsml = extractDsmlToolCalls(parsed.text);
  return {
    text: dsml.text,
    toolCalls: parsed.toolCalls.length > 0 ? parsed.toolCalls : dsml.toolCalls,
  };
}

/* ── Agent Loop ── */

const MAX_CONTEXT_TOKENS = 64000;

function estimateTokens(messages: { role: string; content: string }[]): number {
  // CJK-aware: Chinese chars ≈ 1.5-2 tokens, English chars ≈ 0.25 tokens.
  // Replacing CJK with "aa" brings chars-to-token ratio to ~1:1 for mixed text.
  return messages.reduce((sum, m) => sum + m.content.replace(/[\u4e00-\u9fff]/g, 'aa').length, 0);
}

export async function* agentLoopServer(opts: {
  agent?: AgentDefinition;
  systemPrompt: string;
  messages: { role: string; content: string; images?: string[] }[];
  config?: LoopConfig;
  tools?: Array<{ type: string; function: object }>;
  signal?: AbortSignal;
  interviewState?: InterviewSessionState;
  interviewRebindAction?: InterviewRebindAction;
  taskContract?: AgentTaskContract | null;
  executionContext?: ToolExecutionContext;
  modelRecovery?: ModelRecoveryPolicy;
  frozenToolCall?: { name: string; args: Record<string, unknown> };
}): AsyncGenerator<SSEEvent> {
  const { systemPrompt, messages, config = DEFAULT_LOOP_CONFIG, signal, interviewState, interviewRebindAction, taskContract, executionContext, modelRecovery } = opts;
  // M4: agent identity is mutable — transfer_to_agent hands responsibility to
  // another specialist mid-run (handoff swaps prompt context and tool table).
  let agent = opts.agent;
  let tools = opts.tools;
  let modelPreference = agent?.model;
  let toolWhitelist = agent?.toolNames?.length ? agent.toolNames : undefined;
  const state: LoopState = {
    iteration: 0,
    consecutiveFailures: 0,
    contextSize: estimateTokens(messages) + systemPrompt.replace(/[\u4e00-\u9fff]/g, 'aa').length,
    phase: "understanding",
  };

  let ctx: DeepSeekMessage[] = messages.map((message) => ({
    role: message.role,
    content: message.content,
    images: message.images ? [...message.images] : undefined,
  }));
  let autoRetryCount = 0;
  let forceTextOnly = false; // Set after degradeToUser: next LLM response is text-only, no tools
  const MAX_AUTO_RETRY = 2;
  const recentCalls: { name: string; params: string; result: string }[] = [];
  const intermediateSteps: { tool: string; params: string; category: ErrorCategory; summary: string }[] = [];
  const successfulTools = new Set<string>();
  const completedProgramCriteria = new Set<string>();
  let stopGuardNudged = false;
  let frozenToolCall = opts.frozenToolCall;

  while (state.iteration < config.maxIterations) {
    if (signal?.aborted) {
      yield { type: "done" };
      return;
    }
    state.iteration++;

    if (state.contextSize > MAX_CONTEXT_TOKENS) {
      ctx = ctx.slice(-15);
      state.contextSize = estimateTokens(ctx);
    }

    const phase: AgentPhase = state.iteration === 1 ? "understanding" : "reflecting";
    state.phase = phase;
    yield { type: "phase", phase };

    // Call DeepSeek
    let thinkText: string;
    let toolCalls: NativeToolCall[];
    try {
      if (frozenToolCall) {
        thinkText = "";
        toolCalls = [{
          id: `approved-gate-${state.iteration}`,
          name: frozenToolCall.name,
          arguments: JSON.stringify(frozenToolCall.args),
        }];
        frozenToolCall = undefined;
      } else {
        const resp = await callLLM(ctx, systemPrompt, tools, modelPreference, modelRecovery);
        thinkText = resp.text;
        toolCalls = resp.toolCalls;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      if (executionContext?.workerId && Number.isFinite(executionContext.fencingToken)) {
        yield { type: "error", message };
        yield { type: "done" };
        return;
      }
      yield { type: "phase", phase: "responding" };
      yield { type: "text", content: `AI 请求失败: ${message}` };
      yield { type: "done" };
      return;
    }

    // ── forceTextOnly guard: after permanent error, respond with text only, no tools ──
    if (forceTextOnly) {
      state.phase = "responding";
      yield { type: "phase", phase: "responding" };
      const responseText = thinkText.trim();
      if (responseText) {
        yield { type: "text", content: responseText };
      } else {
        yield { type: "text", content: "抱歉，操作未能完成。请换个方式提问或稍后重试。" };
      }
      ctx.push({ role: "assistant", content: thinkText });
      break;
    }

    if (toolCalls.length === 0) {
      // M3 stop-guard (ADR-0019): a deterministic Program may not end while any
      // success criterion is unmet. One nudge, then an explicit incomplete
      // response — the model never gets to claim success past this gate.
      const stopGuard = taskContract ? createTaskProgramStopGuard(taskContract.taskType) : null;
      const missingCriteria = stopGuard
        ? stopGuard.missingCriteria(completedProgramCriteria)
        : [];
      if (stopGuard && missingCriteria.length > 0 && !stopGuardNudged) {
        stopGuardNudged = true;
        ctx.push({ role: "user", content: stopGuard.nudgeMessage(missingCriteria) });
        state.contextSize = estimateTokens(ctx);
        continue;
      }
      if (stopGuard && missingCriteria.length > 0) {
        state.phase = "responding";
        yield { type: "phase", phase: "responding" };
        yield { type: "text", content: stopGuard.incompleteResponse(missingCriteria) };
        ctx.push({ role: "assistant", content: stopGuard.incompleteResponse(missingCriteria) });
        break;
      }

      // Enforced product rule: a resume_edit run must produce a confirmable
      // draft before it may end.
      const requiredDraftCall = buildRequiredResumeDraftToolCall({
        contract: taskContract,
        userText: latestUserText(ctx),
        successfulTools,
        allowedTools: toolWhitelist,
      });
      if (requiredDraftCall) {
        toolCalls = [requiredDraftCall];
        ctx.push({
          role: "user",
          content: "<!-- system:resume-draft-required -->当前是简历优化任务。已读取简历但尚未生成可确认草稿，请先生成优化方案，再等待用户选择；不要直接结束任务。",
        });
        state.contextSize = estimateTokens(ctx);
      } else {
        state.phase = "responding";
        yield { type: "phase", phase: "responding" };

        const responseText = thinkText.trim();
        if (responseText) {
          yield { type: "text", content: responseText };
        } else {
          yield { type: "text", content: "操作完成。" };
        }

        ctx.push({ role: "assistant", content: thinkText });
        break;
      }
    }

    // Execute tool calls
    for (const tc of toolCalls) {
      let params: Record<string, unknown>;
      try { params = JSON.parse(tc.arguments); } catch { continue; }
      injectLatestImagesForImageTool(tc.name, params, ctx);
      if (tc.name === "evaluate_jd_full" && typeof params.target_company !== "string") {
        const inferredCompany = inferCompanyFromMessages(ctx);
        if (inferredCompany) params.target_company = inferredCompany;
      }
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
      let durableRunDirective: "continue" | "recover" | "wait_user" = "continue";

      if (recent) {
        toolResult = { success: true, data: recent.result, errorCategory: "ok" as const };
        formatted = recent.result;
      } else {
        state.phase = "executing";
        yield { type: "phase", phase: "executing" };
        yield { type: "tool_call", name: tc.name, params };

        const durableExecution = Boolean(
          executionContext?.workerId
          && Number.isFinite(executionContext.fencingToken),
        );
        if (durableExecution) {
          const modeDenial: ToolResult | undefined = !isToolAllowedInMode(tc.name, toolWhitelist)
            ? {
                success: false,
                data: null,
                error: `工具 ${tc.name} 不在当前 Agent 模式下可用`,
                errorCategory: "policy_denied",
                recoverable: true,
              }
            : undefined;
          const policyDenial = modeDenial
            || enforceToolPolicy({ toolName: tc.name, params, messages: ctx, toolWhitelist, interviewState, interviewRebindAction })
            || enforceToolGovernance({ toolName: tc.name, params, taskContract, agentId: agent?.id })
            || undefined;
          const outcome = await executeGovernedRuntimeTool({
            principal: executionContext!.principal,
            runId: executionContext!.runId,
            workerId: executionContext!.workerId!,
            fencingToken: executionContext!.fencingToken!,
            toolName: tc.name,
            args: params,
            allowlist: toolWhitelist || executionContext!.allowlist,
            requestId: executionContext!.requestId,
            policyDenial,
            signal: executionContext!.signal,
          });
          durableRunDirective = outcome.runDirective;
          toolResult = outcome.attempt.result || {
            success: false,
            data: null,
            error: outcome.observation?.userSafeSummary || "工具执行未返回结果",
            errorCategory: "transient",
            recoverable: true,
          };
          formatted = formatToolResult(toolResult, tc.name);
          if (outcome.runDirective !== "continue") {
            yield {
              type: "run_directive",
              directive: outcome.runDirective,
              reason: outcome.observation?.userSafeSummary,
            };
          }
          // M1 gap closure: emit the JD persistence completion card for the
          // browser observer. Legacy synthesized this while draining the tool
          // stream; the durable path already verified read-back server-side.
          if (
            tc.name === "evaluate_jd_full"
            && toolResult.success
            && toolResult.data
            && typeof toolResult.data === "object"
            && Number((toolResult.data as Record<string, unknown>).reportNum) > 0
            && (toolResult.data as Record<string, unknown>).reportReadBackVerified !== false
            && (toolResult.data as Record<string, unknown>).jdReadBackVerified !== false
          ) {
            const d = toolResult.data as Record<string, unknown>;
            yield {
              type: "persist_done",
              reportNum: Number(d.reportNum || 0),
              company: typeof d.company === "string" ? d.company : "",
              role: typeof d.role === "string" ? d.role : "",
              score: Number(d.overallScore || 0),
              readBackVerified: true,
            };
          }
        } else {
        if (!isToolAllowedInMode(tc.name, toolWhitelist)) {
          const errMsg = `工具 ${tc.name} 不在当前 Agent 模式下可用`;
          yield { type: "tool_result", name: tc.name, result: errMsg, success: false };
          ctx.push({ role: "user", content: `<!-- tool:${tc.name} result -->${errMsg}` });
          state.consecutiveFailures++;
          continue;
        }

        const policyResult = enforceToolPolicy({ toolName: tc.name, params, messages: ctx, toolWhitelist, interviewState, interviewRebindAction });
        if (policyResult) {
          toolResult = policyResult;
          formatted = formatToolResult(toolResult, tc.name);
          yield { type: "tool_result", name: tc.name, result: formatted, success: false };
          yield { type: "tool_error", name: tc.name, error: toolResult.error || "工具调用被策略拦截", recoverable: true };
          ctx.push({ role: "user", content: `[TOOL_DENIED tool=${tc.name}] ${toolResult.llmSummary || toolResult.error || "工具调用被策略拦截"}\n请改用尚未尝试且被允许的安全路径；如果缺少批准，只询问一个精确问题。` });
          continue;
        }

        const governanceResult = enforceToolGovernance({
          toolName: tc.name,
          params,
          taskContract,
          agentId: agent?.id,
        });
        if (governanceResult) {
          toolResult = governanceResult;
          formatted = formatToolResult(toolResult, tc.name);
          yield { type: "tool_result", name: tc.name, result: formatted, success: false, data: toolResult.data, uiPayload: toolResult.uiPayload, verifiedAction: toolResult.verifiedAction };
          yield { type: "tool_error", name: tc.name, error: toolResult.error || "工具调用被治理策略阻止", recoverable: true };
          ctx.push({ role: "user", content: `[TOOL_DENIED tool=${tc.name}] ${toolResult.llmSummary || toolResult.error || "工具调用被治理策略阻止"}\n请改用尚未尝试且被允许的安全路径；如果缺少批准，只询问一个精确问题。` });
          continue;
        }

        try {
          toolResult = await executeTool(tc.name, params, executionContext
            ? { ...executionContext, allowlist: toolWhitelist || executionContext.allowlist }
            : undefined);
        } catch (execErr) {
          toolResult = { success: false, data: null, error: execErr instanceof Error ? execErr.message : "Tool execution error", errorCategory: "transient" as const };
        }
        formatted = formatToolResult(toolResult, tc.name);
        }
      }

      // M3 loop protocol: outcome-driven wait_user (falls back to the legacy
      // name check for tools that have not declared an outcome).
      const outcomeMeta = getTool(tc.name)?.outcome;
      const waitsForUser = outcomeMeta?.waitsForUser
        ? outcomeMeta.waitsForUser(toolResult) === true
        : shouldWaitForUserAfterToolResult(tc.name, toolResult.data);
      if (
        toolResult.success
        && waitsForUser
      ) {
        durableRunDirective = "wait_user";
        yield {
          type: "run_directive",
          directive: "wait_user",
          reason: "等待用户回答当前问题",
        };
      }

      yield {
        type: "tool_result",
        name: tc.name,
        result: formatted,
        success: toolResult.success,
        data: toolResult.data,
        uiPayload: toolResult.uiPayload,
        verifiedAction: toolResult.verifiedAction,
      };

      // ── Self-healing: yield error info so LLM can adapt ──
      if (!toolResult.success) {
        yield {
          type: "tool_error",
          name: tc.name,
          error: toolResult.error || "未知错误",
          recoverable: toolResult.recoverable !== false,
          category: resolveErrorCategory(toolResult),
        };
      }

      if (durableRunDirective === "wait_user") {
        yield { type: "done" };
        return;
      }

      state.phase = "verifying";
      yield { type: "phase", phase: "verifying" };

      const quality = checkResultQuality(formatted);
      yield { type: "result_quality", quality };

      const category = resolveErrorCategory(toolResult);
      if (toolResult.success) {
        state.consecutiveFailures = 0;
        successfulTools.add(tc.name);
        if (taskContract) {
          for (const criterion of inferCompletedCriteriaFromToolResult(taskContract, {
            toolName: tc.name,
            toolSuccess: true,
            data: toolResult.data,
            uiPayload: toolResult.uiPayload,
            verifiedAction: toolResult.verifiedAction,
            readBackVerified: toolResult.uiPayload?.readBackVerified === true,
          })) {
            completedProgramCriteria.add(criterion);
          }
        }
      } else if (category !== "policy_denied") {
        state.consecutiveFailures++;
      }

      // M3 loop protocol: declared-terminal tools end the run with their own
      // response instead of looping back through the model.
      if (toolResult.success && outcomeMeta?.terminal) {
        state.phase = "responding";
        yield { type: "phase", phase: "responding" };
        const response = outcomeMeta.terminalResponse?.(toolResult)
          || toolResult.llmSummary
          || formatted
          || "操作完成。";
        yield { type: "text", content: response };
        ctx.push({ role: "assistant", content: response });
        yield { type: "done" };
        return;
      }

      // M4: governed handoff — a successful transfer_to_agent swaps the
      // responsible agent (prompt soul + tool table) within the same run.
      const handoff = (toolResult.success
        && toolResult.data
        && typeof toolResult.data === "object"
        && (toolResult.data as Record<string, unknown>).handoff) as
        | { agentId: string; toTask?: string; reason?: string }
        | undefined;
      if (handoff) {
        const nextAgent = getAgentById(handoff.agentId);
        if (nextAgent) {
          agent = nextAgent;
          modelPreference = agent.model;
          const nextToolNames = agent.toolNames?.length ? agent.toolNames : agent.tools.map((t) => t.name);
          toolWhitelist = nextToolNames;
          tools = registry.toOpenAITools(nextToolNames, executionContext?.workerId !== undefined)
            .filter((t) => nextToolNames.includes(t.function.name));
          yield { type: "agent_switch", agentId: agent.id, agentName: agent.name };
          ctx.push({
            role: "user",
            content: `<!-- system:handoff -->主责已交接给 ${agent.name}。交接原因：${handoff.reason || ""}。请以当前主责身份继续完成用户目标。`,
          });
          state.contextSize = estimateTokens(ctx);
          continue;
        }
      }

      // ── Error category dispatch ──
      const action = ERROR_CATEGORY_ACTIONS[category];

      if (action.degradeToUser) {
        const errorObs = `[TOOL_ERROR tool=${tc.name} category=${category}] ${toolResult.error || "操作失败"}\n\n请基于此错误告知用户发生了什么，并给出具体的下一步建议。`;
        ctx.push({ role: "user", content: errorObs });
        forceTextOnly = true;
        state.contextSize = estimateTokens(ctx);
        state.consecutiveFailures++;
        intermediateSteps.push({ tool: tc.name, params: paramsKey, category, summary: (toolResult.error || "操作失败").slice(0, 100) });
        continue; // DO NOT cache degraded results
      }

      // Only cache successful / non-degraded results
      if (toolResult.success && !requiresReadBackVerification(tc.name)) {
        recentCalls.push({ name: tc.name, params: paramsKey, result: formatted });
        if (recentCalls.length > 5) recentCalls.shift();
      }

      if (action.autoRetry) {
        autoRetryCount++;
      } else {
        autoRetryCount = 0;
      }

      intermediateSteps.push({
        tool: tc.name, params: paramsKey, category,
        summary: toolResult.success ? (formatted.slice(0, 100)) : (toolResult.error || "失败").slice(0, 100),
      });

      const categoryHints: Record<ErrorCategory, string> = {
        ok:              "",
        transient:       "\n<!-- ⚠️ 搜索未找到理想结果，请换参数重试。 -->",
        permanent:       "",
        need_user_input: "",
        policy_denied:   "\n<!-- 当前动作不被允许，请改用安全能力继续原任务。 -->",
      };
      const hint = categoryHints[category]
        || (quality === "empty" ? "\n<!-- ⚠️ 搜索结果为空，请在下一轮换不同关键词重新搜索。不要直接回复用户。 -->"
            : quality === "irrelevant" ? "\n<!-- ⚠️ 搜索结果不相关（可能是同名文化作品等），请换更精确的关键词重新搜索。不要直接回复用户。 -->"
            : "");

      if (outcomeMeta?.suppressLlmContext) {
        const d = (toolResult.data as { filename?: string }) || {};
        ctx.push({ role: "user", content: `<!-- tool:${tc.name} result -->已导出文件: ${d.filename || "download"}。用户设备已自动下载。` });
      } else {
        const llmText = getLLMContext(toolResult, tc.name);
        const followup = outcomeMeta?.followup
          || "【请基于以上工具结果简洁回答。不要扩写成长报告；缺关键信息时只问缺的那一项。】";
        ctx.push({
          role: "user",
          content: `<!-- tool:${tc.name} result -->\n${llmText}${hint}\n\n${followup}`,
        });
      }
      state.contextSize = estimateTokens(ctx);
    }

    if (state.consecutiveFailures >= 2) {
      yield { type: "phase", phase: "responding" };
      yield { type: "text", content: `工具连续失败 ${state.consecutiveFailures} 次，请检查配置或稍后重试。` };
      yield { type: "done" };
      return;
    }

    if (autoRetryCount > MAX_AUTO_RETRY) {
      yield { type: "phase", phase: "responding" };
      yield { type: "text", content: `搜索暂不可用（已尝试 ${autoRetryCount} 次），以下是我基于已有知识的分析：` };
      try {
        const forceResp = await callLLM(ctx, systemPrompt, tools, modelPreference, modelRecovery);
        const clean = forceResp.text.trim();
        if (clean) yield { type: "text", content: clean };
      } catch { /* ignore */ }
      yield { type: "done" };
      return;
    }
  }

  if (state.iteration >= config.maxIterations && state.phase !== "responding") {
    state.phase = "responding";
    yield { type: "phase", phase: "responding" };
    if (intermediateSteps.length > 0) {
      const lines = intermediateSteps.map(s => `- ${s.tool}: ${s.summary} [${s.category}]`);
      yield { type: "text", content: `已尝试 ${intermediateSteps.length} 次工具调用，未能完成任务：\n${lines.join("\n")}\n\n请换个方式提问。` };
    } else {
      yield { type: "text", content: "达到处理上限，请重新提问。" };
    }
  }

  yield { type: "done" };
}

function injectLatestImagesForImageTool(
  toolName: string,
  params: Record<string, unknown>,
  messages: DeepSeekMessage[],
): void {
  const tool = getTool(toolName);
  if (!tool?.parameters?.images || (Array.isArray(params.images) && params.images.length > 0)) return;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user" || !message.images?.length) continue;
    const images = message.images
      .filter((image) => typeof image === "string" && image.startsWith("data:image/"))
      .slice(0, 5);
    if (images.length > 0) params.images = images;
    return;
  }
}

function isWaitingProfileResult(value: unknown): boolean {
  const data = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return data.done !== true && typeof data.prompt === "string" && data.prompt.trim().length > 0;
}

function hasGeneratedInterviewQuestion(value: unknown): boolean {
  const data = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Array.isArray(data.questions) && data.questions.length > 0;
}

export function shouldWaitForUserAfterToolResult(toolName: string, value: unknown): boolean {
  return (toolName === "mine_profile" && isWaitingProfileResult(value))
    || (toolName === "generate_interview_questions" && hasGeneratedInterviewQuestion(value));
}
