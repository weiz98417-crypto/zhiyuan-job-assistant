"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, User, Bot, RotateCcw, XCircle, Pause, Play } from "lucide-react";
import { HandwritingTitle, WarmButton } from "@/components/design";
import AgentChat from "@/components/agent/AgentChat";
import type { EvalBlockProgress, CompletionInfo } from "@/components/agent/AgentChat";
import SessionList from "@/components/agent/SessionList";
import { DEFAULT_SUGGESTIONS } from "@/components/agent/SuggestionChips";
import type { SuggestionChip } from "@/components/agent/SuggestionChips";
import { logInteraction } from "@/lib/agent/memory";
import { migrateExploreToAgent } from "@/lib/agent/migrate";
import type { ClientAgentDefinition } from "@/lib/agent/orchestrator/client";
import { inferPreferredDocumentTypeFromText, type ImageDocumentType, type ImageIntakeResult } from "@/lib/agent/image-intake";
import { buildImageIntakeStatusText, buildImageIntakeToolSummary, routeImageIntake } from "@/lib/agent/image-intake-router";
import { collectArtifactRefsFromSafePayloads, type AgentArtifactRef } from "@/lib/agent/task-journey";
import { mergeServerTranscript, type MergeableMessage } from "@/lib/agent/transcript-merge";
import { AnalystCanvas, type AnalystCanvasPayload } from "@/components/agent/AnalystCanvas";
import {
  createResumeBaseSnapshot,
  inferCompletedCriteriaFromToolResult,
  resolveTaskContractRunOutcome,
  type AgentTaskBaseSnapshot,
  type AgentTaskContract,
} from "@/lib/agent/task-contract";
import type { AgentTaskType } from "@/lib/agent/task-contract";
import type { VerifiedActionResult } from "@/lib/agent/verified-action";
import {
  createDurableAgentRunClient,
  type DurableRunCreateResponse,
  DurableRunRequestError,
  DurableRunOwnershipUnknownError,
  getDurableAgentRunClient,
  listActiveDurableAgentRunsClient,
  observeDurableAgentRun,
  requestDurableAgentRunCancelClient,
  requestDurableAgentRunPauseClient,
  requestDurableAgentRunResumeClient,
  respondDurableAgentRunGateClient,
  submitDurableAgentRunInputClient,
} from "@/lib/agent/runtime/durable-run-client";
import { reconcileRunGateMessages } from "@/lib/agent/run-gate-message-status";
import type { AgentRunSnapshot } from "@/lib/agent/runtime/durable-agent-run";
import type { AgentRunStatus } from "@/lib/agent/run-ledger";
import {
  buildRunRecoveryMessage,
  shortRunId,
  upsertRunRecoveryStatusMessage,
} from "@/lib/agent/run-recovery-message";
import {
  buildAgentSessionUrl,
  replaceAgentSessionUrl,
  resolveAgentSessionUrlSync,
} from "@/lib/agent/agent-session-url";
import { triggerProfileUpdate } from "@/lib/profile-update";
import {
  clearPendingRunCreate,
  pendingRunCreateRequestId,
  rememberPendingRunCreate,
} from "@/lib/agent/pending-run-create";
import { scanMessage, deduplicateSignals, maybeRawContext } from "@/lib/agent/signal-extractor";
import type { ExtractedSignal } from "@/lib/agent/signal-extractor";
import {
  createSession,
  listSessions,
  getSession,
  updateSession,
  softDeleteSession,
  undoDeleteSession,
  pinSession,
  ensureDefaultSession,
  resolveMemoryDigestUpdate,
  MEMORY_DIGEST_USER_MESSAGE_THRESHOLD,
} from "@/lib/agent/sessions";
import {
  persistInterviewRecap,
  shouldPersistInterviewRecap,
  countAnsweredInterviewRounds,
  updateInterviewStateWithAssistantMessage,
  updateInterviewStateWithExchange,
  updateInterviewStateWithToolResult,
} from "@/lib/agent/interview-session-state";
import {
  classifyInterviewMaterialReference,
  formatInterviewRebindRuntimeDirective,
  matchInterviewMaterialReference,
  resolveInterviewRebindAction,
  type InterviewMaterialRecord,
  type InterviewRebindResolution,
} from "@/lib/agent/interview-rebind-policy";
import { markOfferStateStaleFromText } from "@/lib/agent/offer-session-state";
import {
  buildPendingReferenceResumeSave,
  buildPendingReferenceResumeSaveFromImage,
  buildReferenceResumeRoleQuestion,
  isPendingReferenceResumeSaveCancelled,
  type PendingReferenceResumeSaveAction,
  type ReferenceResumeSaveSessionState,
} from "@/lib/agent/reference-resume-save-flow";
import { sanitizeUnsupportedResumeSaveClaim } from "@/lib/agent/resume-save-guard";
import {
  buildGuidedSessionRuntimeDirective,
  finishGuidedSession,
  inferRequestedTaskFromText,
  isConfirmedGuidedTaskSwitch,
  isExplicitGuidedTaskCancel,
  isGuidedTaskType,
  resolveActiveGuidedSession,
  startOrContinueGuidedSession,
  taskAgentId,
  type GuidedSessionState,
} from "@/lib/agent/guided-session-state";
import type { ResumeEditProposalDTO } from "@/lib/agent/resume-edit-proposals";
import { getReadBackRequirementStatus } from "@/lib/agent/tools/readback-verification";
import { projectAgentMessages, projectToolResultForUser, sanitizeSafeReasoningSummary } from "@/lib/agent/surface-projection";
import { AgentItemAssembler } from "@/lib/agent/item-projection";
import { createBrowserRequestId } from "@/lib/browser-request-id";
import {
  buildCareerPositioningArtifact,
  buildCareerPositioningFallback,
  isCareerPositioningConfirmation,
  parseCareerPositioningArtifact,
  type CareerPositioningArtifact,
} from "@/lib/agent/career-positioning-result";
import type { AgentMessage, AgentInteraction, ChatSession } from "@/types";


/* ── Agent phase ── */

type AgentPhase = "understanding" | "executing" | "verifying" | "reflecting" | "responding" | "done" | "compressing_context" | "extracting_ocr" | "extracting_jd" | "jd_extracted" | "detecting_archetype" | "archetype_detected" | null;

const CONTEXT_COMPRESSION_STATUS_MS = 120;
const LEDGER_TEXT_LIMIT = 240;
const IMAGE_INTAKE_TIMEOUT_MS = 180_000;

type SendMessageOptions = {
  hideUserMessage?: boolean;
  forcedAgentId?: string;
};

type SavedJDForEvaluation = {
  id?: number;
  company?: string;
  role?: string;
  sourceUrl?: string;
  body?: string;
};

function buildSavedJDEvaluationPrompt(jdId: string, jd: SavedJDForEvaluation): string {
  const body = (jd.body || "").trim();
  const clippedBody = body.length > 12000 ? `${body.slice(0, 12000)}\n\n[JD 正文过长，已截断到前 12000 字用于本次评估]` : body;
  return [
    "请结合我的简历评估这份已保存 JD。",
    "",
    "执行要求：",
    "- 你现在就是 JD 评估 Agent，直接进入评估流程。",
    "- 先读取我的简历或求职画像，再调用 evaluate_jd_full。",
    "- 不要要求我重新粘贴 JD，不要说你没有 get_recent_jd_context。",
    "- 如果需要引用来源，用下面的原 JD 链接。",
    "",
    `JD ID：${jd.id || jdId}`,
    `公司：${jd.company || "未知公司"}`,
    `岗位：${jd.role || "未知岗位"}`,
    `原 JD 链接：${jd.sourceUrl || "无"}`,
    "",
    "JD 正文：",
    clippedBody || "（这条 JD 暂无正文，请读取 JD 库上下文后再评估。）",
  ].join("\n");
}

type ActiveRunNotice = {
  id: string;
  conversationId: number | null;
  taskType: string;
  agentId: string;
  status: string;
  createdAt?: string;
  phase?: string;
  guidedTaskId?: string;
  guidedTaskPhase?: string;
  toolName?: string;
  verifierSummary?: string;
  updatedAt?: string;
  eventCursor?: number;
  journeyGraphVersion?: string;
  artifacts?: AgentArtifactRef[];
};

const NON_TERMINAL_DURABLE_RUN_STATUSES = new Set([
  "queued",
  "running",
  "waiting_user",
  "recovering",
  "verifying",
  "cancel_requested",
  "paused",
]);
const TERMINAL_DURABLE_RUN_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

const HANDOFF_CONSUMED_STORAGE_KEY = "agent:consumed-handoffs:v1";

function readConsumedHandoffKeys(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(HANDOFF_CONSUMED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function hasConsumedHandoff(key: string): boolean {
  return readConsumedHandoffKeys().has(key);
}

function markHandoffConsumed(key: string): void {
  if (typeof window === "undefined") return;
  const keys = readConsumedHandoffKeys();
  keys.add(key);
  const latest = Array.from(keys).slice(-80);
  try {
    window.sessionStorage.setItem(HANDOFF_CONSUMED_STORAGE_KEY, JSON.stringify(latest));
  } catch {
    // Storage may be unavailable in private modes; the in-memory ref still guards this mount.
  }
}

type LastToolResultInfo = {
  name: string;
  result: string;
  success: boolean;
  data?: unknown;
  uiPayload?: Record<string, unknown>;
  verifiedAction?: VerifiedActionResult;
};

function waitForStatusPaint(ms = CONTEXT_COMPRESSION_STATUS_MS): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function truncateLedgerText(value: unknown, max = LEDGER_TEXT_LIMIT): string {
  if (value === undefined || value === null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const clean = text.replace(/data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+/g, "[image]").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}...`;
}

function summarizeLedgerParams(params: Record<string, unknown> | undefined): string {
  if (!params) return "";
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.toLowerCase().includes("image")) {
      safe[key] = Array.isArray(value) ? `[${value.length} image(s)]` : "[image]";
    } else if (typeof value === "string") {
      safe[key] = truncateLedgerText(value, 120);
    } else {
      safe[key] = value;
    }
  }
  return truncateLedgerText(safe);
}

async function persistCareerPositioningArtifact(
  artifact: CareerPositioningArtifact,
  sessionId?: number | null,
): Promise<{ role: string; readBackVerified: boolean }> {
  const profileRes = await fetch("/api/data/profile", { cache: "no-store" });
  const profileJson = await profileRes.json().catch(() => ({}));
  if (!profileRes.ok || !profileJson.success) {
    throw new Error(profileJson.error || `读取画像失败 HTTP ${profileRes.status}`);
  }

  const current = (profileJson.data || {}) as {
    data?: Record<string, unknown>;
    goals?: Record<string, unknown>;
    history?: unknown[];
  };
  const currentGoals = current.goals && typeof current.goals === "object" ? current.goals : {};
  const currentCompanyPrefs = currentGoals.companyPrefs && typeof currentGoals.companyPrefs === "object"
    ? currentGoals.companyPrefs as Record<string, unknown>
    : {};
  const currentIndustries = Array.isArray(currentCompanyPrefs.industry)
    ? currentCompanyPrefs.industry.filter((item): item is string => typeof item === "string")
    : [];
  const goals = {
    ...currentGoals,
    targetRoles: artifact.targetRoles,
    positioningSummary: artifact.positioningSummary,
    positioningEvidence: artifact.evidence,
    positioningScenario: artifact.targetScenario,
    positioningMvp: artifact.mvp,
    nextActions: artifact.nextActions,
    companyPrefs: {
      ...currentCompanyPrefs,
      industry: Array.from(new Set([
        ...currentIndustries,
        "餐饮培训",
        "智能餐饮设备",
        "AI 产品",
      ])),
    },
  };
  const history = [
    ...(Array.isArray(current.history) ? current.history : []),
    artifact.historyEntry,
  ];

  const saveRes = await fetch("/api/data/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: current.data || {},
      goals,
      history,
    }),
  });
  const saveJson = await saveRes.json().catch(() => ({}));
  if (!saveRes.ok || !saveJson.success) {
    throw new Error(saveJson.error || `写入画像失败 HTTP ${saveRes.status}`);
  }

  const signalRes = await fetch("/api/data/signals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "dingwei",
      signal_type: "role_preference",
      session_id: sessionId ? String(sessionId) : undefined,
      content_json: {
        role: artifact.roleSignal.role,
        reason: artifact.roleSignal.reason,
        evidence: artifact.roleSignal.evidence,
        confidence: artifact.roleSignal.confidence,
        status: "confirmed",
      },
    }),
  });
  const signalJson = await signalRes.json().catch(() => ({}));
  if (!signalRes.ok || !signalJson.success || signalJson.data?.readBackVerified !== true) {
    throw new Error(signalJson.error || `画像信号写入校验失败 HTTP ${signalRes.status}`);
  }

  const verifyRes = await fetch("/api/data/profile", { cache: "no-store" });
  const verifyJson = await verifyRes.json().catch(() => ({}));
  const readBackRoles = verifyJson.data?.goals?.targetRoles;
  const role = artifact.targetRoles[0]?.role || artifact.roleSignal.role;
  const readBackVerified =
    verifyRes.ok &&
    verifyJson.success &&
    Array.isArray(readBackRoles) &&
    readBackRoles.some((item: unknown) =>
      item && typeof item === "object" && (item as { role?: unknown }).role === role
    );
  if (!readBackVerified) {
    throw new Error("画像写入后读回校验失败，未在 goals.targetRoles 中读到确认方向");
  }

  return { role, readBackVerified };
}


function activeNoticeFromRun(run: AgentRunSnapshot): ActiveRunNotice {
  const contract = run.contract && typeof run.contract === "object" && !Array.isArray(run.contract)
    ? run.contract as Record<string, unknown>
    : {};
  const journey = contract.journey && typeof contract.journey === "object" && !Array.isArray(contract.journey)
    ? contract.journey as Record<string, unknown>
    : {};
  const artifacts = Array.isArray(journey.artifacts)
    ? journey.artifacts.filter((item): item is AgentArtifactRef => Boolean(item && typeof item === "object" && typeof (item as AgentArtifactRef).artifactId === "string" && typeof (item as AgentArtifactRef).kind === "string"))
    : [];
  return {
    id: run.id,
    conversationId: run.conversationId,
    taskType: run.taskType,
    agentId: run.agentId,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    eventCursor: Number.isFinite(Number(run.eventCursor)) ? Number(run.eventCursor) : undefined,
    journeyGraphVersion: typeof journey.graphVersion === "string" ? journey.graphVersion : undefined,
    artifacts,
  };
}

function runStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: "排队中",
    planned: "已计划",
    running: "运行中",
    waiting_user: "等待用户",
    paused: "已暂停",
    recovering: "恢复中",
    cancel_requested: "取消中",
    verifying: "自检中",
    repairing: "自愈中",
    recovered: "已恢复",
    needs_engineering: "需工程处理",
    succeeded: "成功",
    failed: "失败",
    rolled_back: "已回滚",
    cancelled: "已取消",
  };
  return labels[status] || status || "未知";
}

async function extractReadOnlyPdfContext(attachments: string[]): Promise<{
  context: string;
  pdfCount: number;
  readableCount: number;
}> {
  let context = "";
  let pdfCount = 0;
  let readableCount = 0;
  for (const dataUri of attachments) {
    if (!dataUri.startsWith("data:application/pdf")) continue;
    pdfCount += 1;
    try {
      const fileResponse = await fetch(dataUri);
      const formData = new FormData();
      formData.append("file", await fileResponse.blob(), "resume.pdf");
      // 0.11.0-A: a hung PDF extraction must not stall the whole turn.
      const response = await fetch("/api/agent/document-extract", { method: "POST", body: formData, signal: AbortSignal.timeout(30_000) });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.success && typeof payload.data?.text === "string" && payload.data.text.trim()) {
        readableCount += 1;
        context += "\n\n---\n已读取的 PDF 文本（仅用于本次分析，不会自动保存）：\n" + payload.data.text;
      } else {
        context += "\n\n---\n这份 PDF 暂时无法读取文本；请在当前对话粘贴简历文字后继续，我不会修改或保存简历。\n";
      }
    } catch {
      context += "\n\n---\n这份 PDF 暂时无法读取文本；请在当前对话粘贴简历文字后继续，我不会修改或保存简历。\n";
    }
  }
  return { context, pdfCount, readableCount };
}

function userFacingAgentRunError(error: unknown): string {
  if (error instanceof DurableRunOwnershipUnknownError) {
    return `${error.message} 刷新当前对话后，系统会继续查找已提交的任务。`;
  }
  if (error instanceof DurableRunRequestError) {
    if (error.status === 401 || error.status === 403 || error.status === 428) {
      return "登录状态或安全校验已失效，请刷新页面后重试。";
    }
    if (error.status === 503) return "Agent 服务暂时不可用，当前对话仍可继续；请稍后重试。";
    if (error.code === "REQUEST_TIMEOUT") return "Agent 响应较慢，任务状态正在确认；请稍后刷新当前对话。";
    if (error.status && error.status >= 500) return "Agent 服务暂时忙，当前对话仍可继续；请稍后重试。";
    if (error.status === 409) return "这条消息的提交状态已变化，请刷新当前对话后继续。";
    return error.status === 400 ? error.message : "Agent 请求未完成，请在当前对话继续尝试。";
  }
  return "Agent 执行暂时中断，你可以在当前对话继续尝试。";
}

function runPhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    understanding: "理解意图",
    executing: "执行工具",
    verifying: "自检验证",
    repairing: "自愈修复",
    responding: "生成回复",
    "image-intake": "图片识别",
  };
  return labels[phase] || phase || "未知阶段";
}

function triggerSessionAnomalyReview(input: {
  sessionId: number | null;
  messages: AgentMessage[];
  activeTask?: GuidedSessionState | null;
  recentRuns?: unknown[];
}): void {
  if (!input.sessionId) return;
  fetch("/api/agent/session-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: input.sessionId,
      messages: input.messages.slice(-8),
      activeTask: input.activeTask || null,
      recentRuns: input.recentRuns || [],
    }),
  }).catch(() => {});
}


async function loadInterviewMaterialRecords(): Promise<InterviewMaterialRecord[]> {
  const [jdResult, refResult] = await Promise.allSettled([
    fetch("/api/data/jds", { cache: "no-store" }).then((res) => res.json()),
    fetch("/api/cv/references", { cache: "no-store" }).then((res) => res.json()),
  ]);
  const records: InterviewMaterialRecord[] = [];

  if (jdResult.status === "fulfilled" && jdResult.value?.success && Array.isArray(jdResult.value.data)) {
    for (const jd of jdResult.value.data as Array<Record<string, unknown>>) {
      records.push({
        id: jd.id as number | undefined,
        kind: "jd",
        title: `${jd.company || ""} ${jd.role || ""} JD`.trim(),
        company: String(jd.company || ""),
        role: String(jd.role || ""),
        body: String(jd.body || ""),
        keywords: Array.isArray(jd.keywords) ? jd.keywords.filter((item): item is string => typeof item === "string") : [],
      });
    }
  }

  if (refResult.status === "fulfilled" && refResult.value?.success && Array.isArray(refResult.value.data)) {
    for (const resume of refResult.value.data as Array<Record<string, unknown>>) {
      const tags = Array.isArray(resume.tags) ? resume.tags.filter((item): item is string => typeof item === "string") : [];
      records.push({
        id: resume.id as number | undefined,
        kind: "resume",
        title: String(resume.name || ""),
        name: String(resume.name || ""),
        label: String(resume.source || ""),
        body: [resume.notes, tags.join(" ")].filter(Boolean).join("\n"),
        keywords: tags,
      });
    }
  }

  return records;
}

/* ── Welcome message ── */

const WELCOME: AgentMessage = {
  role: "assistant",
  content:
    "你好！我是纸鸢，你的 AI 求职伙伴。\n\n" +
    "我可以帮你：\n" +
    "- 查询投递记录和 Pipeline 状态\n" +
    "- 评估职位 JD 和 Offer\n" +
    "- 根据你的画像推荐岗位\n" +
    "- 生成定制化简历\n" +
    "- 导出求职报告\n\n" +
    "也可以和你聊聊职业方向，帮你理清思路。\n\n" +
    "直接告诉我你需要什么，或者随便聊聊吧。",
  timestamp: new Date().toISOString(),
};


/* ── Inner page ── */

function AgentPageInner() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [phase, setPhase] = useState<AgentPhase>(null);
  const [executingTool, setExecutingTool] = useState<string | undefined>(undefined);
  const [thinkingContent, setThinkingContent] = useState<string>("");
  const [startTime, setStartTime] = useState<number | undefined>(undefined);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [undoToast, setUndoToast] = useState<{ id: number; title: string } | null>(null);
  const [sessionSidebarOpen, setSessionSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeAgent, setActiveAgent] = useState<ClientAgentDefinition | null>(null);
  const [evalProgress, setEvalProgress] = useState<EvalBlockProgress[]>([]);
  const [programProgress, setProgramProgress] = useState<{ done: number; total: number } | null>(null);
  const [analystCanvas, setAnalystCanvas] = useState<{ open: boolean; maximized: boolean; payload: AnalystCanvasPayload | null }>({ open: false, maximized: false, payload: null });
  const [completionInfo, setCompletionInfo] = useState<CompletionInfo | null>(null);
  const [resultQuality, setResultQuality] = useState<string | null>(null);
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null);
  const [storedRunNotice, setActiveRunNotice] = useState<ActiveRunNotice | null>(null);
  const activeRunNotice = storedRunNotice?.conversationId === currentSessionId ? storedRunNotice : null;
  const [activeRunAction, setActiveRunAction] = useState<"resume" | "pause" | "cancel" | null>(null);
  const [latestRollbackProposal, setLatestRollbackProposal] = useState<ResumeEditProposalDTO | null>(null);
  const [rollbackAction, setRollbackAction] = useState<"rollback" | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const streamContentRef = useRef("");
  const interviewBootstrapRef = useRef<number | null>(null);
  const seenSignalKeys = useRef<Map<string, Set<string>>>(new Map());
  const seenSignalSessionRef = useRef<string | null>(null);
  const handoffKeyRef = useRef<string>("");
  const handoffSessionCreateKeyRef = useRef<string>("");
  const createdHandoffSessionIdRef = useRef<number | null>(null);
  const manualSessionSwitchRef = useRef<number | null>(null);
  const durableRunCursorsRef = useRef<Record<string, number>>({});
  const pendingRunInputRef = useRef<{
    runId: string;
    originalContent: string;
    originalImages: string[];
    submittedContent: string;
    requestId: string;
  } | null>(null);
  const currentSessionIdRef = useRef<number | null>(null);
  const sessionGenerationRef = useRef(0);
  const observerGenerationRef = useRef(0);
  const turnGenerationRef = useRef(0);
  const itemAssemblerRef = useRef<AgentItemAssembler | null>(null);
  const itemSequenceRef = useRef(0);
  const turnItemPrefixRef = useRef("");

  const rafRef = useRef<number>(0);

  const clearSessionActivity = useCallback(() => {
    sessionGenerationRef.current += 1;
    turnGenerationRef.current += 1;
    observerGenerationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    pendingRunInputRef.current = null;
    currentSessionIdRef.current = null;
    setStreaming(false);
    setPhase(null);
    setExecutingTool(undefined);
    setThinkingContent("");
    setActiveAgent(null);
    setActiveRunNotice(null);
    setActiveRunAction(null);
    setStreamText("");
    streamContentRef.current = "";
    setEvalProgress([]);
    setCompletionInfo(null);
    setResultQuality(null);
  }, []);

  const makeSessionTitle = useCallback((text: string) => {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) return "新对话";
    return cleaned.length <= 10 ? cleaned : cleaned.slice(0, 10) + "...";
  }, []);

  const generateMemoryDigestWithStatus = useCallback(async (
    fullMessages: AgentMessage[],
    fallbackDigest?: string,
  ): Promise<string | undefined> => {
    const userMsgCount = fullMessages.filter((m) => m.role === "user").length;
    if (userMsgCount < MEMORY_DIGEST_USER_MESSAGE_THRESHOLD) return fallbackDigest;
    const { digest, shouldAnnounce } = resolveMemoryDigestUpdate(fullMessages, fallbackDigest);
    if (!shouldAnnounce) return digest;
    setPhase("compressing_context");
    setExecutingTool(undefined);
    await waitForStatusPaint();
    return digest;
  }, []);

  const renameSessionFromFirstUserMessage = useCallback(async (sessionId: number, firstText: string) => {
    const session = await getSession(sessionId);
    if (!session) return;
    if (session.interviewState?.planSnapshot) return;
    if (session.messages.some((m) => m.role === "user")) return;
    await updateSession(sessionId, { title: makeSessionTitle(firstText) });
    setSessions(await listSessions());
  }, [makeSessionTitle]);

  // rAF loop: copy ref -> state at ~60fps for smooth typewriter effect
  useEffect(() => {
    if (!streaming) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      const latest = streamContentRef.current;
      setStreamText((prev) => (prev !== latest ? latest : prev));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [streaming]);

  useEffect(() => {
    // Best-effort migration from legacy localStorage
    migrateExploreToAgent()
      .then(async () => {
        const loaded = await listSessions();
        setSessions(loaded);

        if (loaded.length > 0) {
          const latest = loaded[0];
          currentSessionIdRef.current = latest.id!;
          setCurrentSessionId(latest.id!);
          setMessages(latest.messages);
        } else {
          // Create default session with welcome message
          const id = await createSession([WELCOME]);
          currentSessionIdRef.current = id;
          setCurrentSessionId(id);
          setMessages([WELCOME]);
          setSessions(await listSessions());
        }
      })
      .catch((error) => {
        setSessionLoadError(error instanceof Error ? error.message : "Failed to load sessions");
      })
      .finally(() => setMounted(true));
     
  }, []);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    if (!mounted) return;
    const requestedSessionId = searchParams.get("sessionId");
    if (!requestedSessionId) return;
    const id = Number(requestedSessionId);
    if (!Number.isFinite(id)) return;
    const manualTargetSessionId = manualSessionSwitchRef.current;
    if (manualTargetSessionId !== null) {
      const syncDecision = resolveAgentSessionUrlSync({
        requestedSessionId: id,
        currentSessionId,
        manualTargetSessionId,
      });
      if (syncDecision === "await_target_url") return;
      manualSessionSwitchRef.current = null;
      if (syncDecision === "acknowledge_target_url" && currentSessionId === id) return;
    }
    if (currentSessionId === id) return;

    let cancelled = false;
    getSession(id, { preferServer: true }).then((session) => {
      if (cancelled || !session) return;
      clearSessionActivity();
      currentSessionIdRef.current = id;
      setCurrentSessionId(id);
      setMessages(mergeServerTranscript(messages as MergeableMessage[], session.messages as MergeableMessage[]) as typeof messages);
      // 0.11.0-B: the header agent belongs to the conversation, not the app.
      setActiveAgent(null);
    });
    return () => { cancelled = true; };
  }, [mounted, searchParams, currentSessionId, clearSessionActivity]);

  useEffect(() => {
    if (!mounted || streaming) return;
    if (searchParams.get("newSession") !== "1" || searchParams.get("sessionId")) return;

    const jdId = searchParams.get("jdId");
    const offerId = searchParams.get("offerId");
    const offerReportId = searchParams.get("offerReportId");
    const applicationId = searchParams.get("applicationId");
    if (!jdId && !offerId && !offerReportId && !applicationId) return;

    const createKey = `handoff:${jdId || ""}:${offerId || ""}:${offerReportId || ""}:${applicationId || ""}:${searchParams.get("intent") || ""}`;
    if (handoffSessionCreateKeyRef.current === createKey) return;
    handoffSessionCreateKeyRef.current = createKey;

    const createDedicatedSession = async () => {
      const title = applicationId
        ? `Pipeline #${applicationId}`
        : offerId
        ? `Offer评估 #${offerId}`
        : offerReportId
          ? `Offer报告 #${offerReportId}`
          : `JD评估 #${jdId}`;
      const id = await createSession([], { title });
      createdHandoffSessionIdRef.current = id;
      clearSessionActivity();
      currentSessionIdRef.current = id;
      setCurrentSessionId(id);
      setMessages([]);
      setStreamText("");
      setThinkingContent("");
      streamContentRef.current = "";
      setSessions(await listSessions());

      replaceAgentSessionUrl(window.location.href, { sessionId: id }, window.history);
    };

    createDedicatedSession().catch((error) => {
      setSessionLoadError(error instanceof Error ? error.message : "Failed to create handoff session");
    });
  }, [mounted, streaming, searchParams, clearSessionActivity]);

  useEffect(() => {
    if (!mounted || !currentSessionId) return;
    let cancelled = false;
    const sessionId = currentSessionId;
    const generation = sessionGenerationRef.current;

    setActiveRunNotice(null);
    listActiveDurableAgentRunsClient(sessionId)
      .then(async (data) => {
        if (cancelled || currentSessionIdRef.current !== sessionId || sessionGenerationRef.current !== generation) return;
        const run = data.find((item) => item.conversationId === sessionId);
        if (run?.status === "waiting_user") {
          const session = await getSession(sessionId, { preferServer: true }).catch(() => undefined);
          if (cancelled || currentSessionIdRef.current !== sessionId || sessionGenerationRef.current !== generation) return;
          if (session) {
            setMessages(mergeServerTranscript(messages as MergeableMessage[], session.messages as MergeableMessage[]) as typeof messages);
            setSessions((current) => current.map((item) => item.id === sessionId ? session : item));
            durableRunCursorsRef.current[run.id] = Math.max(durableRunCursorsRef.current[run.id] || 0, run.eventCursor);
          }
        }
        setActiveRunNotice((current) => current?.conversationId === sessionId ? current : run ? activeNoticeFromRun(run) : null);
      })
      .catch(() => {
        if (!cancelled && currentSessionIdRef.current === sessionId && sessionGenerationRef.current === generation) {
          setActiveRunNotice((current) => current?.conversationId === sessionId ? current : null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mounted, currentSessionId]);

  useEffect(() => {
    const notice = activeRunNotice;
    if (!mounted || !notice || !NON_TERMINAL_DURABLE_RUN_STATUSES.has(notice.status)) return;
    if (notice.conversationId !== currentSessionId) return;
    const runId = notice.id;
    const sessionId = currentSessionId;
    const sessionGeneration = sessionGenerationRef.current;
    const generation = ++observerGenerationRef.current;
    const isCurrentConversation = () => sessionGenerationRef.current === sessionGeneration
      && currentSessionIdRef.current === sessionId;
    const isCurrentObserver = () => observerGenerationRef.current === generation && isCurrentConversation();
    const refreshPersistedMessages = async () => {
      if (sessionId === null) return;
      const turnGeneration = turnGenerationRef.current;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        if (!isCurrentConversation()) return;
        if (turnGenerationRef.current !== turnGeneration) return;
        const session = await getSession(sessionId, { preferServer: true }).catch(() => undefined);
        if (!isCurrentConversation()) return;
        if (turnGenerationRef.current !== turnGeneration) return;
        if (session?.messages) {
          setMessages(mergeServerTranscript(messages as MergeableMessage[], session.messages as MergeableMessage[]) as typeof messages);
          setSessions((current) => current.map((item) => item.id === sessionId ? session : item));
        }
        if (attempt === 7) return;
        await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
      }
    };
    if (notice.status === "paused") {
      setStreaming(false);
      setPhase(null);
      return;
    }
    setStreaming(notice.status !== "waiting_user");
    if (notice.status === "waiting_user") setPhase(null);
    itemAssemblerRef.current = new AgentItemAssembler(`run:${runId}`);

    const stopObserving = observeDurableAgentRun(runId, {
      afterCursor: Math.max(
        durableRunCursorsRef.current[runId] || 0,
        notice.status === "waiting_user" ? notice.eventCursor || 0 : 0,
      ),
      onEvents(events, cursor) {
        if (!isCurrentObserver()) return;
        durableRunCursorsRef.current[runId] = cursor;
        for (const runEvent of events) {
          if (runEvent.type === "run.status_changed") {
            const status = String(runEvent.payload.status || "");
            if (status) {
              setActiveRunNotice((current) => current?.id === runId ? { ...current, status } : current);
            }
            if (status === "waiting_user") {
              void refreshPersistedMessages();
            }
            if (!NON_TERMINAL_DURABLE_RUN_STATUSES.has(status)) {
              setStreaming(false);
              setPhase(null);
              setExecutingTool(undefined);
              if (TERMINAL_DURABLE_RUN_STATUSES.has(status)) {
                setActiveRunNotice((current) => (current?.id === runId ? null : current));
              }
              if (sessionId) {
                const refreshPersistedMessages = async () => {
                  for (let attempt = 0; attempt < 8; attempt += 1) {
                    if (!isCurrentConversation()) return;
                    const session = await getSession(sessionId, { preferServer: true }).catch(() => undefined);
                    if (!isCurrentConversation()) return;
                    if (session?.messages) {
                      setMessages(mergeServerTranscript(messages as MergeableMessage[], session.messages as MergeableMessage[]) as typeof messages);
                      setSessions((current) => current.map((item) => item.id === sessionId ? session : item));
                    }
                    if (attempt === 7) return;
                    await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
                  }
                };
                void refreshPersistedMessages();
              }
            }
            continue;
          }
          if (runEvent.type !== "run.ui_event") continue;
          const uiEvent = runEvent.payload.event;
          if (!uiEvent || typeof uiEvent !== "object" || !("type" in uiEvent)) continue;
          const event = uiEvent as Record<string, unknown>;
          const eventType = String(event.type || "");
          if (eventType === "phase") {
            setPhase((event.phase || null) as AgentPhase);
          } else if (eventType === "thinking_content") {
            setThinkingContent(sanitizeSafeReasoningSummary(event.summary));
          } else if (eventType === "tool_call") {
            setExecutingTool(String(event.name || ""));
          } else if (eventType === "text") {
            const content = String(event.content || "");
            const item = itemAssemblerRef.current?.apply({
              cursor: runEvent.sequence,
              type: "delta",
              itemId: `run:${runId}:assistant`,
              content,
            });
            streamContentRef.current += content;
            setStreamText(streamContentRef.current);
            setMessages((current) => {
              const next = [...current];
              const lastIndex = next.length - 1;
              const last = next[lastIndex];
              const result = last?.toolResult;
              const sameRun = Boolean(
                result && typeof result === "object" &&
                "durableRunId" in result &&
                String((result as Record<string, unknown>).durableRunId) === runId,
              );
              const assistant: AgentMessage = {
                role: "assistant",
                itemId: item?.itemId,
                content: streamContentRef.current,
                timestamp: new Date().toISOString(),
                toolResult: { durableRunId: runId },
              };
              if (last?.role === "assistant" && sameRun) next[lastIndex] = assistant;
              else if (assistant.content.trim()) next.push(assistant);
              return next;
            });
          } else if (eventType === "tool_result") {
            const name = String(event.name || "");
            const uiPayload = event.uiPayload && typeof event.uiPayload === "object"
              ? event.uiPayload as Record<string, unknown>
              : undefined;
            const safeView = projectToolResultForUser({ toolName: name, success: event.success === true, uiPayload });
            if (safeView.kind === "silent") continue;
            const observedArtifacts = collectArtifactRefsFromSafePayloads([{ uiPayload: safeView.uiPayload }]);
            if (observedArtifacts.length > 0) {
              setActiveRunNotice((current) => {
                if (!current || current.id !== runId) return current;
                const refs = new Map((current.artifacts || []).map((artifact) => [`${artifact.kind}:${artifact.artifactId}:${artifact.version}`, artifact]));
                for (const artifact of observedArtifacts) refs.set(`${artifact.kind}:${artifact.artifactId}:${artifact.version}`, artifact);
                return { ...current, artifacts: Array.from(refs.values()).slice(-12) };
              });
            }
            const item = itemAssemblerRef.current?.apply({
              cursor: runEvent.sequence,
              type: "completed",
              itemId: `run:${runId}:tool:${name}:${runEvent.sequence}`,
              content: safeView.summary,
              toolView: safeView,
            });
            const toolMessage: AgentMessage = {
              role: "tool",
              itemId: item?.itemId,
              toolName: name,
              content: safeView.summary,
              toolResult: { ...safeView, success: event.success === true, durableRunId: runId },
              timestamp: new Date().toISOString(),
            };
            setMessages((current) => projectAgentMessages([...current, toolMessage]));
          } else if (eventType === "tool_error") {
            setExecutingTool(undefined);
            setPhase("reflecting");
          } else if (eventType === "persist_done") {
            // M1 gap closure: JD evaluation persistence card (was legacy-only).
            setCompletionInfo({
              reportNum: Number(event.reportNum || 0),
              company: String(event.company || ""),
              role: String(event.role || ""),
              score: Number(event.score || 0),
            });
            // 0.11.0-D: reports open the analyst face — evidence lives there,
            // not in the chat column.
            setAnalystCanvas({
              open: true,
              maximized: false,
              payload: {
                kind: "report",
                title: [String(event.company || ""), String(event.role || "")].filter(Boolean).join(" · "),
                subtitle: "JD 评估 · 读回校验通过",
                score: Number(event.score || 0),
                reportNum: Number(event.reportNum || 0),
                readBackVerified: true,
              },
            });
          } else if (eventType === "search_start") {
            const block = String(event.block || "");
            if (block) {
              setEvalProgress((current) => (
                current.some((entry) => entry.block === block)
                  ? current
                  : [...current, { block, label: block, status: "running" as const }]
              ));
            }
          } else if (eventType === "search_result") {
            const block = String(event.block || "");
            if (block) {
              setEvalProgress((current) => {
                const index = current.findIndex((entry) => entry.block === block);
                if (index === -1) return current;
                const next = [...current];
                next[index] = { ...next[index], status: "done" };
                return next;
              });
            }
          } else if (eventType === "agent_switch") {
            // 0.11.0-B: the server decided who owns the task now — the header
            // follows the event instead of the browser's pre-turn guess.
            const nextAgentId = String(event.agentId || "");
            if (nextAgentId) {
              setActiveAgent({ id: nextAgentId, name: String(event.agentName || nextAgentId), description: "", toolNames: [], priority: 0, suggestions: [] });
            }
          } else if (eventType === "step.started" || eventType === "step.finished") {
            const criteriaTotal = Number(event.criteriaTotal || 0);
            const criteriaDone = Number(event.criteriaDone || 0);
            if (criteriaTotal > 0) setProgramProgress({ done: criteriaDone, total: criteriaTotal });
            else setProgramProgress(null);
          } else if (eventType === "done") {
            setExecutingTool(undefined);
          }
        }
      },
    });
    return () => {
      observerGenerationRef.current += 1;
      stopObserving();
    };
  }, [activeRunNotice, currentSessionId, mounted]);

  // 0.11.0-C (ADR-0030): status notices are UI-transient. The worker owns the
  // transcript; these messages render from run state and never hit the server.
  const appendAssistantStatusMessage = useCallback(async (content: string) => {
    setMessages((current) => [...current, {
      role: "assistant",
      content,
      timestamp: new Date().toISOString(),
      itemId: `status:${Date.now()}`,
    }]);
  }, []);

  const handleGateDecision = useCallback(async (gateId: string, decision: "approved" | "denied") => {
    const sessionId = currentSessionId;
    const generation = sessionGenerationRef.current;
    const gate = await respondDurableAgentRunGateClient(gateId, decision, createBrowserRequestId());
    if (currentSessionIdRef.current !== sessionId || sessionGenerationRef.current !== generation) return;
    if (!gate) {
      await appendAssistantStatusMessage("确认请求未提交成功，请重试。");
      return;
    }
    const nextMessages = projectAgentMessages(reconcileRunGateMessages(messages, [{
      gateId: gate.id,
      toolName: gate.toolName,
      status: gate.status,
      scopeHash: gate.scopeHash,
      request: gate.request,
      resolvedAt: gate.resolvedAt,
    }]));
    setMessages(nextMessages);
    if (currentSessionId) {
      await updateSession(currentSessionId, { messages: nextMessages }).catch(() => {});
    }
    setActiveRunNotice((current) => current?.id === gate.runId ? { ...current, status: "queued" } : current);
  }, [appendAssistantStatusMessage, currentSessionId, messages]);

  const refreshLatestRollbackProposal = useCallback(async () => {
    try {
      const res = await fetch("/api/cv/edit-proposals?status=applied&limit=1", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const data = Array.isArray(json.data) ? json.data as ResumeEditProposalDTO[] : [];
      setLatestRollbackProposal(res.ok && json.success ? data[0] || null : null);
    } catch {
      setLatestRollbackProposal(null);
    }
  }, []);

  useEffect(() => {
    if (!mounted || !currentSessionId) return;
    refreshLatestRollbackProposal().catch(() => {});
  }, [mounted, currentSessionId, refreshLatestRollbackProposal]);

  const clearConsumedHandoffParams = useCallback(() => {
    const nextUrl = buildAgentSessionUrl(window.location.href, { consumeHandoff: true });
    if (nextUrl === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
    replaceAgentSessionUrl(window.location.href, { consumeHandoff: true }, window.history);
    createdHandoffSessionIdRef.current = null;
  }, []);

  const replaceUrlForSelectedSession = useCallback((sessionId: number) => {
    replaceAgentSessionUrl(window.location.href, { sessionId, consumeHandoff: true }, window.history);
    createdHandoffSessionIdRef.current = null;
    handoffSessionCreateKeyRef.current = "";
  }, []);

  const handleResumeActiveRun = useCallback(async () => {
    const runId = activeRunNotice?.id;
    if (!runId || activeRunAction) return;
    const sessionId = currentSessionId;
    const generation = sessionGenerationRef.current;
    const isCurrentAction = () => currentSessionIdRef.current === sessionId && sessionGenerationRef.current === generation;
    setActiveRunAction("resume");
    try {
      if (activeRunNotice?.status === "paused") {
        const resumed = await requestDurableAgentRunResumeClient(runId, createBrowserRequestId());
        if (!isCurrentAction()) return;
        if (resumed) {
          setActiveRunNotice(activeNoticeFromRun(resumed));
          setStreaming(true);
          return;
        }
      }
      const run = await getDurableAgentRunClient(runId);
      if (!isCurrentAction()) return;
      if (!run) {
        setActiveRunNotice(null);
        await appendAssistantStatusMessage(`没有找到 Agent run #${shortRunId(runId)}，可能已经结束或被清理。`);
        return;
      }
      setActiveRunNotice(activeNoticeFromRun(run));
      const content = buildRunRecoveryMessage(run);
      const nextMessages = upsertRunRecoveryStatusMessage(messages, runId, content, new Date().toISOString());
      setMessages(nextMessages);
    } finally {
      if (isCurrentAction()) setActiveRunAction(null);
    }
  }, [activeRunAction, activeRunNotice?.id, activeRunNotice?.status, appendAssistantStatusMessage, currentSessionId, messages]);

  const handlePauseActiveRun = useCallback(async () => {
    const runId = activeRunNotice?.id;
    if (!runId || activeRunAction || activeRunNotice?.status === "paused") return;
    const sessionId = currentSessionId;
    const generation = sessionGenerationRef.current;
    const isCurrentAction = () => currentSessionIdRef.current === sessionId && sessionGenerationRef.current === generation;
    setActiveRunAction("pause");
    try {
      const run = await requestDurableAgentRunPauseClient(runId, createBrowserRequestId());
      if (!isCurrentAction()) return;
      if (run) {
        setActiveRunNotice(activeNoticeFromRun(run));
        setStreaming(false);
        setPhase(null);
        await appendAssistantStatusMessage(`已暂停 Agent run #${shortRunId(runId)}，它仍可恢复。`);
      } else {
        await appendAssistantStatusMessage(`暂停 Agent run #${shortRunId(runId)} 失败，它可能已经结束。`);
      }
    } catch {
      if (isCurrentAction()) await appendAssistantStatusMessage("暂停请求暂未成功，当前任务仍可继续；请稍后重试。");
    } finally {
      if (isCurrentAction()) setActiveRunAction(null);
    }
  }, [activeRunAction, activeRunNotice?.id, activeRunNotice?.status, appendAssistantStatusMessage, currentSessionId]);

  const handleRollbackLatestProposal = useCallback(async () => {
    const proposal = latestRollbackProposal;
    if (!proposal?.id || rollbackAction) return;
    setRollbackAction("rollback");
    try {
      const res = await fetch(`/api/cv/edit-proposals/${encodeURIComponent(proposal.id)}/rollback`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      const readBackVerified = json.data?.readBackVerified === true;
      if (res.ok && json.success && readBackVerified) {
        setLatestRollbackProposal(null);
        await appendAssistantStatusMessage(`已撤销最近一次简历修改（${proposal.sectionId}），并完成回读校验。`);
        triggerProfileUpdate({ force: true }).catch(() => {});
      } else {
        await appendAssistantStatusMessage(`撤销最近一次简历修改失败：${json.error || `HTTP ${res.status}`}`);
        await refreshLatestRollbackProposal();
      }
    } finally {
      setRollbackAction(null);
    }
  }, [appendAssistantStatusMessage, latestRollbackProposal, refreshLatestRollbackProposal, rollbackAction]);

  const handleCancelActiveRun = useCallback(async () => {
    const runId = activeRunNotice?.id;
    if (!runId || activeRunAction) return;
    const sessionId = currentSessionId;
    const generation = sessionGenerationRef.current;
    const isCurrentAction = () => currentSessionIdRef.current === sessionId && sessionGenerationRef.current === generation;
    setActiveRunAction("cancel");
    try {
      const run = await requestDurableAgentRunCancelClient(runId, createBrowserRequestId());
      if (!isCurrentAction()) return;
      if (run) {
        setActiveRunNotice(activeNoticeFromRun(run));
        await appendAssistantStatusMessage(`已提交 Agent run #${shortRunId(runId)} 的取消请求，Worker 会在安全位置停止。`);
      } else {
        await appendAssistantStatusMessage(`取消 Agent run #${shortRunId(runId)} 失败，它可能已经结束。`);
      }
    } finally {
      if (isCurrentAction()) setActiveRunAction(null);
    }
  }, [activeRunAction, activeRunNotice?.id, appendAssistantStatusMessage, currentSessionId]);

  const sendMessage = useCallback(
    async (content: string, images?: string[], options?: SendMessageOptions) => {
      const turnGeneration = ++turnGenerationRef.current;
      const sessionId = currentSessionId;
      const originalContent = content;
      const isCurrentTurn = () => turnGenerationRef.current === turnGeneration
        && currentSessionIdRef.current === sessionId;
      const hideUserMessage = options?.hideUserMessage === true;
      const explicitForcedAgentId = options?.forcedAgentId;
      const requestImages = [...(images || [])];
      const pendingStorage = (() => {
        try {
          return typeof window === "undefined" ? null : window.localStorage;
        } catch {
          return null;
        }
      })();
      const rememberedCreateRequestId = pendingRunCreateRequestId(
        sessionId,
        originalContent,
        requestImages,
        pendingStorage,
      );
      const createRequestId = rememberedCreateRequestId || createBrowserRequestId();
      const rememberCreateRequest = () => rememberPendingRunCreate(
        sessionId,
        originalContent,
        requestImages,
        createRequestId,
        pendingStorage,
      );
      const clearCreateRequest = () => clearPendingRunCreate(sessionId, createRequestId, pendingStorage);
      const userMsg: AgentMessage = {
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      } as AgentMessage;
      if (images?.length) userMsg.images = images;
      const updated = [...messages, userMsg];
      if (!hideUserMessage) setMessages(updated);
      if (currentSessionId && !hideUserMessage) {
        const isFirstUserMsg = messages.filter((m) => m.role === "user").length === 0;
        if (isFirstUserMsg) {
          renameSessionFromFirstUserMessage(currentSessionId, content).catch(() => {});
        }
      }

      /* ── Auto-scan user message for profile signals ── */
      const sesId = currentSessionId ? String(currentSessionId) : "default";
      // 0.11.0-B: signal dedup is per-conversation, not global.
      if (seenSignalSessionRef.current !== sesId) {
        seenSignalSessionRef.current = sesId;
        seenSignalKeys.current = new Map();
      }
      const bucketKey = String(sesId ?? "default");
      if (!seenSignalKeys.current.has(bucketKey)) seenSignalKeys.current.set(bucketKey, new Set());
      const sessionSeen = seenSignalKeys.current.get(bucketKey)!;
      const extracted = deduplicateSignals(scanMessage(content, sesId), sessionSeen);

      // If regex found few signals but message is substantial, add raw_context for LLM enrichment
      const rawCtx = maybeRawContext(content, extracted.length, sesId);
      if (rawCtx) {
        const rawDeduped = deduplicateSignals([rawCtx], sessionSeen);
        if (rawDeduped.length > 0) extracted.push(rawDeduped[0]);
      }

      if (extracted.length > 0) {
        fetch("/api/data/signals/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signals: extracted }),
        }).catch(() => { /* fire-and-forget */ });
      }

      // Show thinking indicator immediately
      const assistantMsg: AgentMessage = {
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
      };
      setMessages(hideUserMessage ? messages : updated);
      streamContentRef.current = "";
      setStreamText("");
      setStreaming(true);
      setPhase("understanding");
      setExecutingTool(undefined);
      setThinkingContent("");
      setStartTime(Date.now());
      setEvalProgress([]);
      setCompletionInfo(null);
      turnItemPrefixRef.current = `turn:${createBrowserRequestId()}`;
      itemSequenceRef.current = 0;
      itemAssemblerRef.current = new AgentItemAssembler(turnItemPrefixRef.current);

      const priorPendingInput = pendingRunInputRef.current;
      const matchingPendingInput = priorPendingInput
        && priorPendingInput.runId === activeRunNotice?.id
        && priorPendingInput.originalContent === originalContent
        && priorPendingInput.originalImages.length === (images?.length || 0)
        && priorPendingInput.originalImages.every((image, index) => image === images?.[index])
          ? priorPendingInput
          : null;
      const pdfExtraction = matchingPendingInput
        ? { context: "", pdfCount: 0, readableCount: 0 }
        : await extractReadOnlyPdfContext(images || []);
      content = matchingPendingInput?.submittedContent || (content + pdfExtraction.context);
      if (!isCurrentTurn()) return;
      if (
        pdfExtraction.pdfCount > 0
        && pdfExtraction.readableCount === 0
        && !(images || []).some((attachment) => attachment.startsWith("data:image/"))
        && originalContent.trim().length < 100
      ) {
        const response: AgentMessage = {
          role: "assistant",
          content: "这份 PDF 没有读到可分析的文字。请在当前对话粘贴简历或 JD 正文，我会接着评估；这次没有修改或保存你的简历。",
          timestamp: new Date().toISOString(),
        };
        setMessages(hideUserMessage ? [...messages, response] : [...updated, response]);
        setStreaming(false);
        setPhase(null);
        setExecutingTool(undefined);
        if (sessionId && !activeRunNotice) {
          const session = await getSession(sessionId).catch(() => undefined);
          if (!isCurrentTurn()) return;
          if (session) {
            const requestedTask = inferRequestedTaskFromText(originalContent);
            const guidedSession = isGuidedTaskType(requestedTask)
              ? startOrContinueGuidedSession({
                  existing: resolveActiveGuidedSession({ agentState: session.agentState, interviewState: session.interviewState }),
                  taskType: requestedTask,
                  phase: "document_text_retry",
                  expectedInput: "粘贴简历或 JD 正文，或重新上传清晰文件",
                  summary: "等待补充可读取的文档文字",
                })
              : undefined;
            await updateSession(sessionId, {
              messages: hideUserMessage ? [...session.messages, response] : [...session.messages, userMsg, response],
              agentState: guidedSession ? { ...(session.agentState || {}), guidedSession } : undefined,
            });
          }
        }
        return;
      }
      const sessionForActiveRun = currentSessionId ? await getSession(currentSessionId).catch(() => undefined) : undefined;
      if (!isCurrentTurn()) return;
      const activeGuidedForSubmit = resolveActiveGuidedSession({
        agentState: sessionForActiveRun?.agentState,
        interviewState: sessionForActiveRun?.interviewState,
      });
      const requestedTaskForSubmit = inferRequestedTaskFromText(content);
      const confirmedTaskSwitchForSubmit = Boolean(
        activeGuidedForSubmit
        && requestedTaskForSubmit
        && requestedTaskForSubmit !== activeGuidedForSubmit.taskType
        && isConfirmedGuidedTaskSwitch(content),
      );

      if (
        activeRunNotice?.conversationId === sessionId
        && NON_TERMINAL_DURABLE_RUN_STATUSES.has(activeRunNotice.status)
        && activeRunNotice.status !== "paused"
        && !confirmedTaskSwitchForSubmit
      ) {
        const pendingInput = matchingPendingInput?.runId === activeRunNotice.id
          ? matchingPendingInput
          : {
              runId: activeRunNotice.id,
              originalContent,
              originalImages: [...(images || [])],
              submittedContent: content,
              requestId: createBrowserRequestId(),
            };
        pendingRunInputRef.current = pendingInput;
        try {
          const submitted = await submitDurableAgentRunInputClient(activeRunNotice.id, {
            requestId: pendingInput.requestId,
            input: {
              content: pendingInput.submittedContent,
              images: images?.filter((source) => source.startsWith("data:image/")),
              persistInConversation: !hideUserMessage,
            },
          });
          if (!isCurrentTurn()) return;
          if (!submitted) throw new Error("消息未确认写入当前任务");
          pendingRunInputRef.current = null;
          setActiveRunNotice(activeNoticeFromRun(submitted.run));
        } catch (error) {
          if (!isCurrentTurn()) return;
          if (error instanceof DurableRunRequestError && !error.retryable) pendingRunInputRef.current = null;
          setStreaming(false);
          setPhase(null);
          setExecutingTool(undefined);
          setMessages((current) => {
            const next = current.filter((message) => message.timestamp !== userMsg.timestamp);
            return [...next, {
              role: "assistant",
              content: `这条消息暂时未确认送达，请重新发送；当前对话可以继续。 ${userFacingAgentRunError(error)}`,
              timestamp: new Date().toISOString(),
            }];
          });
          throw error;
        }
        return;
      }

      if (activeRunNotice?.conversationId === sessionId && confirmedTaskSwitchForSubmit) {
        try {
          const paused = await requestDurableAgentRunPauseClient(activeRunNotice.id, createBrowserRequestId());
          if (!isCurrentTurn()) return;
          if (!paused) throw new Error("当前任务暂停状态未确认");
          setActiveRunNotice(activeNoticeFromRun(paused));
        } catch (error) {
          if (!isCurrentTurn()) return;
          setStreaming(false);
          setPhase(null);
          setExecutingTool(undefined);
          setMessages((current) => [
            ...current.filter((message) => message.timestamp !== userMsg.timestamp),
            { role: "assistant", content: "切换任务暂未成功，请重新发送这条消息；当前对话可以继续。", timestamp: new Date().toISOString() },
          ]);
          throw error;
        }
      }

      const imageDataUris = (images || []).filter((src) => typeof src === "string" && src.startsWith("data:image/"));
      const runAttachments = imageDataUris.length > 0 ? imageDataUris : undefined;
      const requestedImageTask = inferRequestedTaskFromText(content);
      const directImageTask = imageDataUris.length > 0 && imageDataUris.length === images?.length
        && (requestedImageTask === "jd_evaluation" || requestedImageTask === "resume_diagnosis")
          ? requestedImageTask
          : null;
      const imageIntakeToolTimestamp = imageDataUris.length ? new Date().toISOString() : "";
      let imageIntakeToolMessage: AgentMessage | null = null;

      const upsertImageIntakeToolMessage = (message: AgentMessage) => {
        imageIntakeToolMessage = message;
        setMessages((prev) => {
          const copy = [...prev];
          const existingIndex = copy.findIndex((item) =>
            item.role === "tool" &&
            item.toolName === "recognize_document_image" &&
            item.timestamp === imageIntakeToolTimestamp
          );
          if (existingIndex >= 0) {
            copy[existingIndex] = message;
            return copy;
          }
          const anchorIndex = copy.length > 0 && copy[copy.length - 1]?.role === "assistant" && copy[copy.length - 1]?.content === ""
            ? copy.length - 1
            : copy.length;
          copy.splice(anchorIndex, 0, message);
          return copy;
        });
      };

      const beginImageIntake = () => {
        setPhase("extracting_ocr");
        setExecutingTool("recognize_document_image");
        upsertImageIntakeToolMessage({
          role: "tool",
          toolName: "recognize_document_image",
          content: `正在识别 ${imageDataUris.length} 张图片...`,
          toolResult: {
            success: true,
            result: `正在识别 ${imageDataUris.length} 张图片...`,
            uiPayload: {
              type: "image_intake",
              status: "running",
              imagesCount: imageDataUris.length,
            },
          },
          timestamp: imageIntakeToolTimestamp,
        });
      };
      if (imageDataUris.length > 0 && !directImageTask) beginImageIntake();

      if (!isCurrentTurn()) return;

      const controller = new AbortController();
      abortRef.current = controller;
      let durableRunId: string | null = null;
      let workerOwnedRun = false;

      try {
        // ── Durable worker orchestration ──
        let earlyCreatedRun: DurableRunCreateResponse | null = null;
        const sessionMessages = updated.map((m, index) => ({
          role: m.role,
          content: index === updated.length - 1 ? content : m.content,
        }));

        const currentSessionForRun = currentSessionId ? await getSession(currentSessionId) : undefined;
        if (!isCurrentTurn()) return;
        const memoryDigest = currentSessionForRun?.memoryDigest;
        const agentState = markOfferStateStaleFromText(currentSessionForRun?.agentState, content) || currentSessionForRun?.agentState;
        const journeyArtifacts = collectArtifactRefsFromSafePayloads([
          ...(currentSessionForRun?.messages || []).filter((message) => message.role === "tool").map((message) => message.toolResult),
        ]);
        const activeGuidedSession = resolveActiveGuidedSession({
          agentState,
          interviewState: currentSessionForRun?.interviewState,
        });
        if (directImageTask && currentSessionId &&
          (!activeGuidedSession || activeGuidedSession.taskType === directImageTask)) {
          try {
            rememberCreateRequest();
            earlyCreatedRun = await createDurableAgentRunClient({
              requestId: createRequestId,
              conversationId: currentSessionId,
              input: { content, images: runAttachments, persistInConversation: !hideUserMessage },
              entryHints: {
                ...({ imageDocumentType: "resume" as const }),
                ...(journeyArtifacts.length > 0 ? { journeyArtifacts } : {}), agentId: explicitForcedAgentId || taskAgentId(directImageTask), source: "agent_chat" },
            });
            if (!isCurrentTurn()) return;
            if (earlyCreatedRun?.admission?.kind === "defer_switch") {
              setStreaming(false);
              setPhase(null);
              setMessages((current) => {
                const next = [...current];
                const lastIndex = next.length - 1;
                if (next[lastIndex]?.role === "assistant" && !next[lastIndex]?.content) {
                  next[lastIndex] = {
                    ...next[lastIndex],
                    content: earlyCreatedRun?.admission?.safeMessage || "当前任务尚未到达安全切换点，请先完成、取消或暂停它。",
                  };
                }
                return next;
              });
              return;
            }
            if (earlyCreatedRun?.assignment.owner === "worker" && earlyCreatedRun.run) {
              clearCreateRequest();
              workerOwnedRun = true;
              durableRunId = earlyCreatedRun.run.id;
              setActiveRunNotice({ ...activeNoticeFromRun(earlyCreatedRun.run), phase: "understanding" });
              abortRef.current = null;
              return;
            }
            clearCreateRequest();
          } catch (error) {
            if (error instanceof DurableRunOwnershipUnknownError) throw error;
            clearCreateRequest();
            earlyCreatedRun = null;
          }
        }
        const pendingCareerPositioningArtifact =
          activeGuidedSession?.taskType === "career_positioning_guidance" &&
          activeGuidedSession.phase === "awaiting_positioning_confirmation"
            ? parseCareerPositioningArtifact(activeGuidedSession.sourceText)
            : null;
        if (
          pendingCareerPositioningArtifact &&
          isCareerPositioningConfirmation(content) &&
          currentSessionId &&
          currentSessionForRun
        ) {
          setPhase("executing");
          setExecutingTool("save_career_positioning");
          let finalAssistantContent = "";
          let nextGuidedSession: GuidedSessionState | undefined = activeGuidedSession || undefined;
          try {
            const saved = await persistCareerPositioningArtifact(pendingCareerPositioningArtifact, currentSessionId);
            if (!isCurrentTurn()) return;
            nextGuidedSession = finishGuidedSession(
              activeGuidedSession,
              "completed",
              `自我定位已写入画像：${saved.role}`,
            );
            finalAssistantContent = [
              `已把这次自我定位写入求职画像：${saved.role}。`,
              "",
              "我也记录了一条已确认的定位信号，后续 JD 评估、简历优化和推荐方向都会优先参考它。",
            ].join("\n");
            triggerProfileUpdate({ force: true }).catch(() => {});
          } catch (err) {
            if (!isCurrentTurn()) return;
            finalAssistantContent = `这次定位结果没有写入画像：${err instanceof Error ? err.message : "未知错误"}。我没有把任务标记为完成，你可以再回复“确认”重试，或告诉我要调整哪里。`;
          }

          const finalAssistant: AgentMessage = {
            ...assistantMsg,
            content: finalAssistantContent,
            agent_id: "profile",
          };
          streamContentRef.current = finalAssistantContent;
          setStreamText(finalAssistantContent);
          setPhase(null);
          setExecutingTool(undefined);
          setStreaming(false);
          setEvalProgress([]);
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === "assistant" && last.content === "") copy[copy.length - 1] = finalAssistant;
            else copy.push(finalAssistant);
            return copy;
          });

          const fullMessages = [...currentSessionForRun.messages];
          if (!hideUserMessage) fullMessages.push({ ...userMsg, agent_id: "profile" });
          fullMessages.push(finalAssistant);
          const nextMemoryDigest = await generateMemoryDigestWithStatus(
            fullMessages,
            currentSessionForRun.memoryDigest,
          );
          if (!isCurrentTurn()) return;
          await updateSession(currentSessionId, {
            messages: fullMessages,
            memoryDigest: nextMemoryDigest,
            interviewState: currentSessionForRun.interviewState,
            agentState: {
              ...(agentState || {}),
              guidedSession: nextGuidedSession,
            },
          });
          const refreshedSessions = await listSessions();
          if (isCurrentTurn()) setSessions(refreshedSessions);
          return;
        }
        const requestedTaskForSwitch = inferRequestedTaskFromText(content);
        const confirmedGuidedSwitch =
          Boolean(activeGuidedSession && requestedTaskForSwitch && requestedTaskForSwitch !== activeGuidedSession.taskType && isConfirmedGuidedTaskSwitch(content));
        let rebindResolution: InterviewRebindResolution | null = null;
        if (!explicitForcedAgentId && currentSessionForRun?.interviewState?.planSnapshot) {
          const decision = classifyInterviewMaterialReference(content);
          if (decision.intent !== "continue_current_session") {
            const materialRecords = await loadInterviewMaterialRecords();
            if (!isCurrentTurn()) return;
            const match = matchInterviewMaterialReference(decision, materialRecords);
            rebindResolution = resolveInterviewRebindAction(decision, match);
          }
        }

        const preferredDocumentType = imageDataUris.length
          ? inferPreferredDocumentTypeFromText(content)
          : undefined;
        let imageIntake: ImageIntakeResult | null = null;
        if (imageDataUris.length > 0) {
          if (directImageTask) beginImageIntake();
          const intakeController = new AbortController();
          const intakeTimeout = window.setTimeout(() => intakeController.abort(), IMAGE_INTAKE_TIMEOUT_MS);
          let intakeFailure = "";
          try {
            const intakeRes = await fetch("/api/agent/image-intake", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: intakeController.signal,
              body: JSON.stringify({
                images: imageDataUris,
                userText: content,
                preferredDocumentType,
              }),
            });
            const intakeJson = await intakeRes.json().catch(() => ({}));
            if (intakeRes.ok && intakeJson.success) {
              imageIntake = intakeJson.data as ImageIntakeResult;
            } else {
              intakeFailure = String(intakeJson.error || `image intake HTTP ${intakeRes.status}`);
            }
          } catch (err) {
            intakeFailure = err instanceof Error ? err.message : "image intake failed";
          } finally {
            window.clearTimeout(intakeTimeout);
          }
          if (!isCurrentTurn()) return;
          if (!imageIntake) {
            imageIntake = {
              documentType: "unknown",
              confidence: 0,
              extractedText: "",
              quality: "unknown",
              reason: intakeFailure || "图片识别失败",
              errors: [intakeFailure || "图片识别失败"],
              perImage: [],
            };
          }
          const intakeDecision = routeImageIntake(content, imageIntake);
          upsertImageIntakeToolMessage({
            role: "tool",
            toolName: "recognize_document_image",
            content: buildImageIntakeStatusText(content, imageIntake),
            toolResult: {
              success: intakeDecision.route !== "retry_image",
              result: buildImageIntakeToolSummary(intakeDecision, imageIntake),
              data: imageIntake,
              uiPayload: {
                type: "image_intake",
                status: intakeDecision.route === "retry_image" ? "failed" : "done",
                imagesCount: imageDataUris.length,
                documentType: intakeDecision.documentType,
                route: intakeDecision.route,
                confidence: intakeDecision.confidence,
                quality: intakeDecision.quality || "unknown",
                reason: intakeDecision.reason,
                clarificationQuestion: intakeDecision.clarificationQuestion,
                retryHint: intakeDecision.retryHint,
                preview: imageIntake.extractedText ? imageIntake.extractedText.slice(0, 180) : "",
                perImage: imageIntake.perImage || [],
              },
            },
            timestamp: imageIntakeToolTimestamp,
          });
          setPhase("understanding");
          setExecutingTool(undefined);
        }

        const currentReferenceResumeSaveState =
          (agentState?.referenceResumeSave && typeof agentState.referenceResumeSave === "object"
            ? agentState.referenceResumeSave
            : undefined) as ReferenceResumeSaveSessionState | undefined;
        let pendingReferenceResumeSaveForRun: PendingReferenceResumeSaveAction | undefined =
          currentReferenceResumeSaveState?.pending;
        const detectedReferenceResumeSave = imageDataUris.length > 0
          ? buildPendingReferenceResumeSaveFromImage(content, imageDataUris.length, imageIntake)
          : buildPendingReferenceResumeSave({
              userText: content,
              resumeText: content,
              source: "paste",
            });

        if (detectedReferenceResumeSave) {
          if (!detectedReferenceResumeSave.roleCategory) {
            const askedPending: PendingReferenceResumeSaveAction = {
              ...detectedReferenceResumeSave,
              askedRoleCategoryAt: new Date().toISOString(),
            };
            const roleQuestion = buildReferenceResumeRoleQuestion(askedPending);
            const finalAssistant: AgentMessage = {
              ...assistantMsg,
              content: roleQuestion,
              agent_id: "resume",
            };
            streamContentRef.current = roleQuestion;
            setStreamText(roleQuestion);
            setPhase(null);
            setExecutingTool(undefined);
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === "assistant" && last.content === "") copy[copy.length - 1] = finalAssistant;
              else copy.push(finalAssistant);
              return copy;
            });

            if (currentSessionId && currentSessionForRun) {
              const fullMessages = [...currentSessionForRun.messages];
              const taggedUserMsg = { ...userMsg, agent_id: "resume" };
              if (!hideUserMessage) fullMessages.push(taggedUserMsg);
              const persistedImageIntakeToolMessage = imageIntakeToolMessage as AgentMessage | null;
              if (!hideUserMessage && persistedImageIntakeToolMessage) {
                fullMessages.push({ ...persistedImageIntakeToolMessage, agent_id: "resume" });
              }
              fullMessages.push(finalAssistant);

              const isFirstUserMsg = currentSessionForRun.messages.filter((m) => m.role === "user").length === 0;
              const needsTitle =
                !currentSessionForRun.interviewState?.planSnapshot &&
                (isFirstUserMsg ||
                  !currentSessionForRun.title ||
                  currentSessionForRun.title === "新对话" ||
                  currentSessionForRun.title === "新的对话");
              const nextMemoryDigest = await generateMemoryDigestWithStatus(fullMessages, memoryDigest);
              if (!isCurrentTurn()) return;
              await updateSession(currentSessionId, {
                messages: fullMessages,
                title: needsTitle ? makeSessionTitle(content) : undefined,
                memoryDigest: nextMemoryDigest,
                interviewState: currentSessionForRun.interviewState,
                agentState: {
                  ...(agentState || {}),
                  referenceResumeSave: { pending: askedPending },
                  guidedSession: startOrContinueGuidedSession({
                    existing: activeGuidedSession,
                    taskType: "reference_resume_save",
                    agentId: "resume",
                    phase: "role_category_confirmation",
                    expectedInput: "确认优秀简历要保存到哪个岗位类别，例如 AI产品经理、AI运营、AI售前",
                    summary: "等待确认优秀简历岗位类别",
                    source: "reference_resume_save",
                  }),
                },
              });
              const refreshedSessions = await listSessions();
              if (isCurrentTurn()) setSessions(refreshedSessions);
            }

            triggerProfileUpdate({ force: true }).catch(() => {});
            return;
          }

          pendingReferenceResumeSaveForRun = detectedReferenceResumeSave;
        }

        const routedContent = content;
        const shouldBypassConversationLocks = Boolean(explicitForcedAgentId);
        const activeGuidedSessionForRun = shouldBypassConversationLocks ? null : activeGuidedSession;
        const forcedAgentId =
          explicitForcedAgentId
            ? explicitForcedAgentId
            : pendingReferenceResumeSaveForRun
            ? "resume"
            : confirmedGuidedSwitch && requestedTaskForSwitch
            ? taskAgentId(requestedTaskForSwitch)
            : activeGuidedSessionForRun
            ? taskAgentId(activeGuidedSessionForRun.taskType)
            : !shouldBypassConversationLocks && currentSessionForRun?.interviewState?.planSnapshot
            ? "interview"
            : undefined;
        // 0.11.0-A: the browser no longer routes. The turn goes straight to
        // run creation with hints; the worker's envelope decides the task and
        // streams intent/agent_switch events back. Labels update from events.
        const routeForcedAgentId = forcedAgentId;
        const interviewState = shouldBypassConversationLocks ? undefined : currentSessionForRun?.interviewState;
        if (!earlyCreatedRun) rememberCreateRequest();
        const created = earlyCreatedRun || await createDurableAgentRunClient({
          requestId: createRequestId,
          conversationId: currentSessionId,
          input: { content, images: runAttachments, persistInConversation: !hideUserMessage },
          entryHints: {
            ...(routeForcedAgentId ? { agentId: routeForcedAgentId } : {}),
            ...(["jd", "offer", "resume"].includes(String(imageIntake?.documentType))
              ? { imageDocumentType: imageIntake!.documentType as "jd" | "offer" | "resume" }
              : {}),
            ...(journeyArtifacts.length > 0 ? { journeyArtifacts } : {}),
            source: "agent_chat",
          },
        });
        if (!isCurrentTurn()) return;
        if (created?.admission?.kind === "defer_switch") {
          setStreaming(false);
          setPhase(null);
          setMessages((current) => {
            const next = [...current];
            const lastIndex = next.length - 1;
            if (next[lastIndex]?.role === "assistant" && !next[lastIndex]?.content) {
              next[lastIndex] = {
                ...next[lastIndex],
                content: created.admission?.safeMessage || "当前任务尚未到达安全切换点，请先完成、取消或暂停它。",
              };
            }
            return next;
          });
          return;
        }
        const createdRun = created?.run || null;
        if (createdRun && created?.assignment.owner !== "worker") {
          throw new Error(`Agent runtime 返回了不支持的执行模式：${created?.assignment.owner ?? "unknown"}。请将服务端 AGENT_RUNTIME_MODE 设置为 worker_all。`);
        }
        if (createdRun) {
          clearCreateRequest();
          workerOwnedRun = true;
          durableRunId = createdRun.id;
          const admittedAgentId = (createdRun as { agentId?: string }).agentId;
          setActiveAgent({
            id: admittedAgentId || routeForcedAgentId || "general",
            name: admittedAgentId ? admittedAgentId : (routeForcedAgentId || "通用助手"),
            description: "",
            toolNames: [],
            priority: 0,
            suggestions: [],
          });
          setActiveRunNotice({
            ...activeNoticeFromRun(createdRun),
            phase: "understanding",
            guidedTaskId: activeGuidedSessionForRun?.taskId,
            guidedTaskPhase: activeGuidedSessionForRun?.phase,
          });
          abortRef.current = null;
          return;
        }

        setStreaming(false);
        setPhase(null);
        setMessages((current) => {
          const next = [...current];
          const lastIndex = next.length - 1;
          if (next[lastIndex]?.role === "assistant" && !next[lastIndex]?.content) {
            next[lastIndex] = {
              ...next[lastIndex],
              content: "这个请求没有创建可执行的 Agent 任务。请换个说法，或到岗位发现工作台直接发起扫描。",
            };
          } else if (!next[lastIndex] || next[lastIndex]?.role !== "assistant") {
            next.push({
              role: "assistant",
              content: "这个请求没有创建可执行的 Agent 任务。请换个说法，或到岗位发现工作台直接发起扫描。",
              timestamp: new Date().toISOString(),
            });
          }
          return next;
        });
        return;

      } catch (err: unknown) {
        if (!isCurrentTurn()) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!(err instanceof DurableRunOwnershipUnknownError)) clearCreateRequest();
        const errorMsg = userFacingAgentRunError(err);
        console.error("[agent] turn failed", {
          sessionId: currentSessionId,
          runId: durableRunId,
          error: err instanceof Error ? err.message : String(err),
        });
        if (durableRunId) {
          setActiveRunNotice((prev) => (prev?.id === durableRunId ? { ...prev, status: "failed" } : prev));
          window.setTimeout(() => {
            setActiveRunNotice((prev) => (prev?.id === durableRunId ? null : prev));
          }, 2500);
        }
        setStreaming(false);
        setPhase(null);
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === "assistant" && last.content.trim() === "") {
            copy[copy.length - 1] = { ...last, content: `⚠️ ${errorMsg}` };
          } else if (!last || last.role !== "assistant") {
            copy.push({ role: "assistant", content: `⚠️ ${errorMsg}`, timestamp: new Date().toISOString() });
          }
          return copy;
        });
        throw err;
      } finally {
        if (isCurrentTurn() && !workerOwnedRun) {
          setStreaming(false);
          setPhase(null);
        }
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [activeRunNotice, messages, currentSessionId, makeSessionTitle, renameSessionFromFirstUserMessage, generateMemoryDigestWithStatus, refreshLatestRollbackProposal],
  );

  useEffect(() => {
    if (!mounted || streaming || !currentSessionId || messages.length > 0) return;

    let cancelled = false;
    const bootstrapInterview = async () => {
      const session = await getSession(currentSessionId);
      if (cancelled || !session?.interviewState?.planSnapshot) return;
      if (session.messages.some((m) => m.role === "user" || m.role === "assistant")) return;
      if (interviewBootstrapRef.current === currentSessionId) return;

      interviewBootstrapRef.current = currentSessionId;
      await sendMessage("开始模拟面试：请根据当前面试准备快照直接出第一题，不要先解释。", undefined, { hideUserMessage: true });
    };

    bootstrapInterview().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mounted, streaming, currentSessionId, messages.length, sendMessage]);

  const handleStopStreaming = useCallback(async () => {
    const activeRun = activeRunNotice;
    if (activeRun && NON_TERMINAL_DURABLE_RUN_STATUSES.has(activeRun.status)) {
      if (activeRunAction) return;
      const sessionId = currentSessionId;
      const generation = sessionGenerationRef.current;
      const isCurrentAction = () => currentSessionIdRef.current === sessionId && sessionGenerationRef.current === generation;
      setActiveRunAction("cancel");
      try {
        const cancelled = await requestDurableAgentRunCancelClient(activeRun.id, createBrowserRequestId());
        if (!isCurrentAction()) return;
        if (!cancelled) throw new Error("取消请求未确认");
        setActiveRunNotice(activeNoticeFromRun(cancelled));
        setStreaming(false);
        setPhase(null);
        setExecutingTool(undefined);
      } catch {
        if (!isCurrentAction()) return;
        setMessages((current) => [...current, {
          role: "assistant",
          content: "停止请求暂未成功，任务可能仍在运行。你可以使用上方“取消”重试。",
          timestamp: new Date().toISOString(),
        }]);
      } finally {
        if (isCurrentAction()) setActiveRunAction(null);
      }
      return;
    }
    turnGenerationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setPhase(null);
    setExecutingTool(undefined);
    setThinkingContent("");
    setActiveAgent(null);
  }, [activeRunAction, activeRunNotice, currentSessionId]);

  const handleNewSession = useCallback(async () => {
    // Trigger profile update before switching
    triggerProfileUpdate({ force: true }).catch(() => {});

    const id = await createSession([WELCOME]);
    clearSessionActivity();
    manualSessionSwitchRef.current = id;
    replaceUrlForSelectedSession(id);
    currentSessionIdRef.current = id;
    setCurrentSessionId(id);
    setMessages([WELCOME]);
    setSessions(await listSessions());
  }, [clearSessionActivity, replaceUrlForSelectedSession]);

  useEffect(() => {
    if (!mounted || streaming || !currentSessionId) return;
    const requestedSessionId = searchParams.get("sessionId");
    if (requestedSessionId && Number(requestedSessionId) !== currentSessionId) return;
    if (searchParams.get("newSession") === "1" && !requestedSessionId && createdHandoffSessionIdRef.current !== currentSessionId) return;
    const jdId = searchParams.get("jdId");
    const intent = searchParams.get("intent");
    if (!jdId || intent !== "evaluate") return;
    const handoffKey = `${currentSessionId}:jd:evaluate:${jdId}`;
    if (handoffKeyRef.current === handoffKey || hasConsumedHandoff(handoffKey)) {
      clearConsumedHandoffParams();
      return;
    }
    handoffKeyRef.current = handoffKey;
    markHandoffConsumed(handoffKey);
    clearConsumedHandoffParams();
    const startEvaluation = async () => {
      let prompt = "";
      try {
        const res = await fetch(`/api/data/jds?id=${encodeURIComponent(jdId)}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.success && json.data) {
          prompt = buildSavedJDEvaluationPrompt(jdId, json.data as SavedJDForEvaluation);
        }
      } catch {
        // Fall back to the JD context tool below.
      }
      if (!prompt) {
        prompt = [
          "请结合我的简历评估 JD 库里的这份职位。",
          `JD ID：${jdId}`,
          "你现在就是 JD 评估 Agent。请先读取我的简历或求职画像，再用 get_recent_jd_context 读取这个 jdId，最后调用 evaluate_jd_full。",
          "不要让我重新粘贴 JD；如果读取失败，请说明读取失败的具体原因。",
        ].join("\n");
      }
      queueMicrotask(() => {
        sendMessage(prompt, undefined, { hideUserMessage: true, forcedAgentId: "evaluate" }).catch(() => {});
      });
    };
    startEvaluation().catch(() => {});
  }, [mounted, streaming, currentSessionId, searchParams, sendMessage, clearConsumedHandoffParams]);

  useEffect(() => {
    if (!mounted || streaming || !currentSessionId) return;
    const requestedSessionId = searchParams.get("sessionId");
    if (requestedSessionId && Number(requestedSessionId) !== currentSessionId) return;
    if (searchParams.get("newSession") === "1" && !requestedSessionId && createdHandoffSessionIdRef.current !== currentSessionId) return;
    const applicationId = searchParams.get("applicationId");
    if (!applicationId) return;
    const intent = searchParams.get("intent") || "open";
    const company = searchParams.get("company") || "";
    const role = searchParams.get("role") || "";
    const handoffKey = `${currentSessionId}:application:${intent}:${applicationId}`;
    if (handoffKeyRef.current === handoffKey || hasConsumedHandoff(handoffKey)) {
      clearConsumedHandoffParams();
      return;
    }
    handoffKeyRef.current = handoffKey;
    markHandoffConsumed(handoffKey);
    clearConsumedHandoffParams();

    const intentText = intent === "negotiate"
      ? "生成谈薪策略"
      : intent === "ask_hr"
        ? "整理 HR 问询点"
        : intent === "interview"
          ? "准备面试"
          : intent === "retro"
            ? "做阶段复盘"
            : "给出下一步建议";
    queueMicrotask(() => {
      sendMessage(
        [
          `请围绕投递追踪里的 applicationId=${applicationId} ${intentText}。`,
          company || role ? `已知上下文：${company} ${role}` : "",
          "先调用 get_application_context 读取 application 上下文和事件，不要让我重新粘贴 JD 或 Offer 信息。",
          "如果上下文不足，请明确说明缺什么；不要编造不存在的 JD、Offer 或 HR 回复。",
        ].filter(Boolean).join("\n"),
        undefined,
        { hideUserMessage: true },
      ).catch(() => {});
    });
  }, [mounted, streaming, currentSessionId, searchParams, sendMessage, clearConsumedHandoffParams]);

  useEffect(() => {
    if (!mounted || streaming || !currentSessionId) return;
    const requestedSessionId = searchParams.get("sessionId");
    if (requestedSessionId && Number(requestedSessionId) !== currentSessionId) return;
    if (searchParams.get("newSession") === "1" && !requestedSessionId && createdHandoffSessionIdRef.current !== currentSessionId) return;
    const offerId = searchParams.get("offerId");
    const offerReportId = searchParams.get("offerReportId");
    const intent = searchParams.get("intent");
    if (!offerId && !offerReportId) return;

    const handoffKey = `${currentSessionId}:offer:${intent || "open"}:${offerId || ""}:${offerReportId || ""}`;
    if (handoffKeyRef.current === handoffKey || hasConsumedHandoff(handoffKey)) {
      clearConsumedHandoffParams();
      return;
    }
    handoffKeyRef.current = handoffKey;
    markHandoffConsumed(handoffKey);
    clearConsumedHandoffParams();

    if (offerId && intent === "evaluate") {
      queueMicrotask(() => {
        sendMessage(`请评估 Offer 工作台里的 offerId=${offerId}。直接调用 evaluate_offer，不要让我重新粘贴 Offer。`, undefined, { hideUserMessage: true, forcedAgentId: "offer" }).catch(() => {});
      });
      return;
    }
    if (offerReportId && intent === "negotiate") {
      queueMicrotask(() => {
        sendMessage(`请基于已保存的 Offer 报告 offerReportId=${offerReportId} 生成谈判策略。优先调用 generate_offer_negotiation_strategy，不要重新评估 Offer。`, undefined, { hideUserMessage: true, forcedAgentId: "offer" }).catch(() => {});
      });
      return;
    }
    if (offerReportId && intent === "ask_hr") {
      queueMicrotask(() => {
        sendMessage(`请基于已保存的 Offer 报告 offerReportId=${offerReportId} 生成 HR 问询清单。优先调用 generate_offer_hr_question_list，不要重新评估 Offer。`, undefined, { hideUserMessage: true, forcedAgentId: "offer" }).catch(() => {});
      });
      return;
    }
    if (offerReportId) {
      queueMicrotask(() => {
        sendMessage(`请读取并解释已保存的 Offer 报告 offerReportId=${offerReportId}。优先调用 read_offer_report，不要重新评估 Offer。`, undefined, { hideUserMessage: true, forcedAgentId: "offer" }).catch(() => {});
      });
    }
  }, [mounted, streaming, currentSessionId, searchParams, sendMessage, clearConsumedHandoffParams]);

  const handleSelectSession = useCallback(async (id: number) => {
    if (id === currentSessionId) return;
    // Trigger profile update before switching
    triggerProfileUpdate({ force: true }).catch(() => {});

    const session = await getSession(id, { preferServer: true });
    if (session) {
      clearSessionActivity();
      manualSessionSwitchRef.current = id;
      replaceUrlForSelectedSession(id);
      currentSessionIdRef.current = id;
      setCurrentSessionId(id);
      setMessages(mergeServerTranscript(messages as MergeableMessage[], session.messages as MergeableMessage[]) as typeof messages);
    }
  }, [clearSessionActivity, currentSessionId, replaceUrlForSelectedSession]);

  const handleDeleteSession = useCallback(async (id: number) => {
    const session = await getSession(id);
    if (!session) return;
    await softDeleteSession(id);
    setUndoToast({ id, title: session.title });

    // Trigger profile update after deleting session
    triggerProfileUpdate({ force: true }).catch(() => {});

    // If deleting current session, switch to another
    if (id === currentSessionId) {
      const remaining = await listSessions();
      if (remaining.length > 0) {
        const nextId = remaining[0].id!;
        clearSessionActivity();
        manualSessionSwitchRef.current = nextId;
        replaceUrlForSelectedSession(nextId);
        currentSessionIdRef.current = nextId;
        setCurrentSessionId(nextId);
        setMessages(remaining[0].messages);
      } else {
        const newId = await createSession([WELCOME]);
        clearSessionActivity();
        manualSessionSwitchRef.current = newId;
        replaceUrlForSelectedSession(newId);
        currentSessionIdRef.current = newId;
        setCurrentSessionId(newId);
        setMessages([WELCOME]);
      }
    }
    setSessions(await listSessions());
  }, [clearSessionActivity, currentSessionId, replaceUrlForSelectedSession]);

  const handleUndoDelete = useCallback(async (id: number) => {
    await undoDeleteSession(id);
    setUndoToast(null);
    setSessions(await listSessions());
    // If no current session (deleted was the only one), select restored
    if (!currentSessionId) {
      const session = await getSession(id);
      if (session) {
        manualSessionSwitchRef.current = id;
        replaceUrlForSelectedSession(id);
        setCurrentSessionId(id);
        setMessages(mergeServerTranscript(messages as MergeableMessage[], session.messages as MergeableMessage[]) as typeof messages);
      }
    }
  }, [currentSessionId, replaceUrlForSelectedSession]);

  const handlePinSession = useCallback(async (id: number, pinned: boolean) => {
    await pinSession(id, pinned);
    setSessions(await listSessions());
  }, []);

  if (!mounted) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-[var(--color-divider)] rounded w-40" />
        <div className="h-96 bg-[var(--color-divider)] rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  if (sessionLoadError) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-text-soft)]">
        会话数据加载失败：{sessionLoadError}
      </div>
    );
  }

  const currentSession = currentSessionId
    ? sessions.find((session) => session.id === currentSessionId)
    : undefined;
  const showActiveRunToolbar = Boolean(
    activeRunNotice && NON_TERMINAL_DURABLE_RUN_STATUSES.has(activeRunNotice.status),
  );

  return (
    <div className="flex h-[calc(100dvh-(var(--space-section)*2)-3.5rem)] min-h-0 max-h-[calc(100dvh-(var(--space-section)*2)-3.5rem)] w-full min-w-0 max-w-full flex-1 gap-0 overflow-hidden lg:h-[calc(100vh-(var(--space-section)*2))] lg:min-h-[560px] lg:max-h-[calc(100vh-(var(--space-section)*2))]">
      {/* Desktop SessionList Sidebar (>=1280px) */}
      <div className="hidden h-full w-[220px] flex-shrink-0 overflow-hidden border-r border-[var(--color-divider)] bg-[var(--color-bg)]/50 pr-3 lg:flex">
        <SessionList
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelect={handleSelectSession}
          onNew={handleNewSession}
          onDelete={handleDeleteSession}
          onUndoDelete={handleUndoDelete}
          onPin={handlePinSession}
          showUndoToast={undoToast}
        />
      </div>

      {/* Mobile SessionList Drawer */}
      <AnimatePresence>
        {sessionSidebarOpen && (
          <>
            <motion.button
              type="button"
              aria-label="关闭会话列表"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSessionSidebarOpen(false)}
              className="lg:hidden fixed inset-0 z-30 bg-black/30"
            />
            <motion.aside
              initial={{ x: -280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -280, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.19, 1, 0.22, 1] }}
              className="lg:hidden fixed left-0 top-0 bottom-0 z-40 bg-[var(--color-surface)] border-r border-[var(--color-divider)] w-[280px] overflow-hidden"
            >
              <SessionList
                sessions={sessions}
                currentSessionId={currentSessionId}
                onSelect={(id) => {
                  handleSelectSession(id);
                  setSessionSidebarOpen(false);
                }}
                onNew={() => {
                  handleNewSession();
                  setSessionSidebarOpen(false);
                }}
                onDelete={handleDeleteSession}
                onUndoDelete={handleUndoDelete}
                onPin={handlePinSession}
                showUndoToast={undoToast}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Chat Area */}
      <div className="ml-4 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" style={{ cursor: "default" }}>
        {/* Header + Tab bar */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-divider)] pb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSessionSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-bg)] text-[var(--color-muted)]"
              title="会话列表"
            >
              <Menu size={18} />
            </button>
            <div>
              <p className="text-[var(--color-muted)] text-sm mb-1">
                AI 求职伙伴
              </p>
              <div className="flex items-center gap-2">
                <HandwritingTitle as="h1">纸鸢 Agent</HandwritingTitle>
                {activeAgent && activeAgent.id !== "general" && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                    <Bot size={12} />
                    {activeAgent.name}
                    <button
                      onClick={() => setActiveAgent(null)}
                      className="ml-1 hover:text-blue-800 dark:hover:text-blue-200"
                      title="退出当前模式"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              在线
            </span>
            <Link
              href="/profile"
              className="p-2 rounded-[var(--radius-sm)] hover:bg-[var(--color-bg)] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
              title="求职档案"
            >
              <User size={16} />
            </Link>
            <WarmButton
              variant="ghost"
              size="sm"
              onClick={handleNewSession}
              disabled={streaming && !activeRunNotice}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mr-1">
                <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              新建对话
            </WarmButton>
          </div>
        </div>

        {activeRunNotice && (
          showActiveRunToolbar ? <div data-testid="agent-run-toolbar" className="mt-2 flex h-8 w-fit max-w-full flex-shrink-0 items-center gap-1 overflow-hidden text-xs text-[var(--color-muted)]">
            <div className="flex min-w-0 items-center gap-2 rounded-full bg-[var(--color-bg)] px-3">
              <span className="font-medium text-[var(--color-text)]">
                {activeRunNotice.status === "waiting_user"
                  ? "等待你的回复"
                  : activeRunNotice.status === "paused"
                    ? "任务已暂停"
                    : "纸鸢正在处理"}
              </span>
              <span>{runStatusLabel(activeRunNotice.status)}</span>
              {activeRunNotice.phase && <span>{runPhaseLabel(activeRunNotice.phase)}</span>}
              {activeRunNotice.artifacts && activeRunNotice.artifacts.length > 0 && <span>材料 {activeRunNotice.artifacts.length}</span>}
            </div>
            <div className="flex items-center gap-1">
              {activeRunNotice.status === "paused" ? (
                <button
                  type="button"
                  onClick={handleResumeActiveRun}
                  disabled={activeRunAction !== null}
                  title="恢复运行"
                  className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play size={13} />
                  {activeRunAction === "resume" ? "恢复中" : "恢复"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePauseActiveRun}
                  disabled={activeRunAction !== null}
                  title="暂停运行"
                  className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Pause size={13} />
                  {activeRunAction === "pause" ? "暂停中" : "暂停"}
                </button>
              )}
              <button
                type="button"
                onClick={handleCancelActiveRun}
                disabled={activeRunAction !== null}
                title="取消运行"
                className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/30"
              >
                <XCircle size={13} />
                {activeRunAction === "cancel" ? "取消中" : "取消"}
              </button>
            </div>
          </div> : null
        )}

        {latestRollbackProposal && (
          <div className="mt-2 flex flex-shrink-0 flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="min-w-0 flex-1">
              <span className="font-medium">最近简历修改可撤销</span>
              <span className="ml-2">section: {latestRollbackProposal.sectionId}</span>
              {latestRollbackProposal.updatedAt && <span className="ml-2">updated: {latestRollbackProposal.updatedAt}</span>}
            </div>
            <button
              type="button"
              onClick={handleRollbackLatestProposal}
              disabled={streaming || rollbackAction !== null}
              title="撤销最近一次已应用的简历修改"
              className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-sm)] border border-amber-300 bg-white px-2 text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/40"
            >
              <RotateCcw size={13} />
              {rollbackAction === "rollback" ? "撤销中" : "撤销"}
            </button>
          </div>
        )}

        {/* 0.11.0-D dual canvas: chat face + analyst face */}
        <div className="flex min-h-0 flex-1 gap-3">
        <AgentChat
          currentSessionId={currentSessionId}
          messages={messages}
          streaming={streaming}
          phase={phase}
          thinkingContent={thinkingContent}
          startTime={startTime}
          evalProgress={evalProgress}
          completionInfo={completionInfo}
          resultQuality={resultQuality}
          runStatus={activeRunNotice?.status}
          contextArtifacts={activeRunNotice?.artifacts}
          interviewState={currentSession?.interviewState}
          suggestions={activeAgent?.suggestions?.length ? activeAgent.suggestions.map(s => ({ icon: null as unknown as React.ReactNode, label: s.label, prompt: s.prompt })) : DEFAULT_SUGGESTIONS}
          onSend={sendMessage}
          onGateDecision={handleGateDecision}
          onStop={handleStopStreaming}
          emptyState={null}
        />
        {analystCanvas.open ? (
          <AnalystCanvas
            payload={analystCanvas.payload}
            maximized={analystCanvas.maximized}
            onClose={() => setAnalystCanvas((current) => ({ ...current, open: false, maximized: false }))}
            onMaximize={() => setAnalystCanvas((current) => ({ ...current, maximized: !current.maximized }))}
          />
        ) : null}
        </div>
      </div>

    </div>
  );
}

/* ── Page export with Suspense boundary ── */

export default function AgentPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 animate-pulse">
          <div className="h-8 bg-[var(--color-divider)] rounded w-40" />
          <div className="h-96 bg-[var(--color-divider)] rounded-[var(--radius-lg)]" />
        </div>
      }
    >
      <AgentPageInner />
    </Suspense>
  );
}

