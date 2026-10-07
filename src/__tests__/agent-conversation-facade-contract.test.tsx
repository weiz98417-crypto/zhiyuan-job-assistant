// @vitest-environment jsdom
/** spec 35 契约测试:use-agent-conversation 组合门面的 API 面 + 抽出模块的边界面。
 *  本文件在拆分提交中零改动;「测试不改一字全绿」是拆分验收。
 *  生命周期主干被 5 个 0.12 源码契约测试的 readFileSync 路径钉在门面文件,
 *  故拆分形态 = 门面(生命周期)+ helpers(模块级纯函数)+ ui-state(界面状态)。 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import { useAgentConversation } from "@/components/agent/use-agent-conversation";
import {
  activeNoticeFromRun,
  buildSavedJDEvaluationPrompt,
  CONTEXT_COMPRESSION_STATUS_MS,
  hasConsumedHandoff,
  IMAGE_INTAKE_TIMEOUT_MS,
  LEDGER_TEXT_LIMIT,
  markHandoffConsumed,
  NON_TERMINAL_DURABLE_RUN_STATUSES,
  readConsumedHandoffKeys,
  TERMINAL_DURABLE_RUN_STATUSES,
  triggerSessionAnomalyReview,
  truncateLedgerText,
  summarizeLedgerParams,
  userFacingAgentRunError,
  waitForStatusPaint,
  WELCOME,
} from "@/components/agent/use-agent-conversation-helpers";

beforeEach(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: [] }) })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** 门面导出的全部键(与 return 对象逐项对应)——page.tsx 消费的契约。 */
const FACADE_SURFACE_KEYS = [
  "messages", "setMessages", "streaming", "setStreaming", "streamText", "setStreamText",
  "phase", "setPhase", "executingTool", "setExecutingTool", "thinkingContent", "setThinkingContent",
  "startTime", "setStartTime", "sessions", "setSessions", "currentSessionId", "setCurrentSessionId",
  "undoToast", "setUndoToast", "mounted", "setMounted", "activeAgent", "setActiveAgent",
  "agentSwitchedAt", "setAgentSwitchedAt", "evalProgress", "setEvalProgress",
  "programProgress", "setProgramProgress", "analystCanvas", "setAnalystCanvas",
  "completionInfo", "setCompletionInfo", "resultQuality", "setResultQuality",
  "sessionLoadError", "setSessionLoadError", "storedRunNotice", "setActiveRunNotice",
  "activeRunNotice", "activeRunAction", "setActiveRunAction",
  "latestRollbackProposal", "setLatestRollbackProposal", "rollbackAction", "setRollbackAction",
  "abortRef", "streamContentRef", "interviewBootstrapRef", "seenSignalKeys", "seenSignalSessionRef",
  "handoffKeyRef", "handoffSessionCreateKeyRef", "createdHandoffSessionIdRef", "manualSessionSwitchRef",
  "durableRunCursorsRef", "pendingRunInputRef", "currentSessionIdRef", "sessionGenerationRef",
  "observerGenerationRef", "turnGenerationRef", "itemAssemblerRef", "itemSequenceRef",
  "turnItemPrefixRef", "rafRef",
  "clearSessionActivity", "makeSessionTitle", "generateMemoryDigestWithStatus",
  "renameSessionFromFirstUserMessage", "appendAssistantStatusMessage", "handleGateDecision",
  "refreshLatestRollbackProposal", "clearConsumedHandoffParams", "replaceUrlForSelectedSession",
  "handleResumeActiveRun", "handlePauseActiveRun", "handleRollbackLatestProposal",
  "handleCancelActiveRun", "sendMessage", "handleStopStreaming", "handleNewSession",
  "handleSelectSession", "handleDeleteSession", "handleUndoDelete", "handlePinSession",
  "currentSession", "showActiveRunToolbar", "displayMessages",
] as const;

describe("useAgentConversation 组合门面契约(spec 35)", () => {
  it("导出面完整:page.tsx 消费的每个键都存在", () => {
    const { result } = renderHook(() => useAgentConversation());
    const surface = result.current as Record<string, unknown>;
    const missing = FACADE_SURFACE_KEYS.filter((key) => !(key in surface));
    expect(missing).toEqual([]);
  });

  it("初始状态:空消息、空会话、非流式(欢迎语由挂载 effect 注入)", () => {
    const { result } = renderHook(() => useAgentConversation());
    const surface = result.current as Record<string, unknown>;
    expect(surface.messages).toEqual([]);
    expect(surface.sessions).toEqual([]);
    expect(surface.streaming).toBe(false);
    expect(surface.currentSessionId).toBeNull();
  });

  it("界面状态子面:流式五件套与画布开关的初始值", () => {
    const { result } = renderHook(() => useAgentConversation());
    const surface = result.current as Record<string, unknown>;
    expect(surface.phase).toBeNull();
    expect(surface.streamText).toBe("");
    expect(surface.thinkingContent).toBe("");
    expect(surface.executingTool).toBeUndefined();
    expect(surface.startTime).toBeUndefined();
    expect(surface.analystCanvas).toMatchObject({ open: false, maximized: false, payload: null });
  });
});

describe("use-agent-conversation-helpers 模块边界契约(spec 35)", () => {
  it("抽出符号全部存在且类型正确", () => {
    expect(typeof activeNoticeFromRun).toBe("function");
    expect(typeof buildSavedJDEvaluationPrompt).toBe("function");
    expect(typeof hasConsumedHandoff).toBe("function");
    expect(typeof markHandoffConsumed).toBe("function");
    expect(typeof readConsumedHandoffKeys).toBe("function");
    expect(typeof triggerSessionAnomalyReview).toBe("function");
    expect(typeof truncateLedgerText).toBe("function");
    expect(typeof summarizeLedgerParams).toBe("function");
    expect(typeof userFacingAgentRunError).toBe("function");
    expect(typeof waitForStatusPaint).toBe("function");
    expect(CONTEXT_COMPRESSION_STATUS_MS).toBe(120);
    expect(typeof LEDGER_TEXT_LIMIT).toBe("number");
    expect(typeof IMAGE_INTAKE_TIMEOUT_MS).toBe("number");
    expect(NON_TERMINAL_DURABLE_RUN_STATUSES).toBeInstanceOf(Set);
    expect(TERMINAL_DURABLE_RUN_STATUSES).toEqual(new Set(["succeeded", "failed", "cancelled"]));
    expect(typeof WELCOME).toBe("object");
    expect((WELCOME as { content: string }).content).toContain("纸鸢");
  });

  it("handoff 消费标记读写闭环(sessionStorage)", () => {
    expect(hasConsumedHandoff("spec35-probe")).toBe(false);
    markHandoffConsumed("spec35-probe");
    expect(hasConsumedHandoff("spec35-probe")).toBe(true);
    expect(readConsumedHandoffKeys().has("spec35-probe")).toBe(true);
  });

  it("ledger 截断与运行错误话术", () => {
    expect(truncateLedgerText("一".repeat(400), 10)).toBe("一".repeat(10) + "...");
    expect(summarizeLedgerParams(undefined)).toBe("");
    expect(userFacingAgentRunError(new Error("x"))).toBeTruthy();
  });
});
