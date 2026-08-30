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
import { orchestrate, type ClientAgentDefinition } from "@/lib/agent/orchestrator/client";
import { agentLoopRemote } from "@/lib/agent/loop/remote-runner";
import { inferPreferredDocumentTypeFromText, type ImageDocumentType, type ImageIntakeResult } from "@/lib/agent/image-intake";
import { buildImageIntakeStatusText, buildImageIntakeToolSummary, routeImageIntake } from "@/lib/agent/image-intake-router";
import { routeAgentTask } from "@/lib/agent/task-routing";
import { collectArtifactRefsFromSafePayloads, TASK_JOURNEY_GRAPH_VERSION, type AgentArtifactRef } from "@/lib/agent/task-journey";
import {
  createAgentTaskContract,
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
  taskLabelZh,
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

function buildRunTarget(
  content: string,
  agentId: string,
  imageIntake?: ImageIntakeResult | null,
): string {
  const structured = imageIntake?.structured || {};
  const company = typeof structured.company === "string" ? structured.company : "";
  const role = typeof structured.role === "string" ? structured.role : "";
  const structuredTarget = [company, role].filter(Boolean).join(" / ");
  if (structuredTarget) return truncateLedgerText(structuredTarget, 120);
  if (imageIntake?.documentType && imageIntake.documentType !== "unknown") {
    return `${imageIntake.documentType}:${agentId}`;
  }
  return truncateLedgerText(content || agentId, 120) || agentId;
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
    taskType: run.taskType,
    agentId: run.agentId,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
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

async function loadTaskBaseSnapshot(taskType: AgentTaskType): Promise<AgentTaskBaseSnapshot> {
  if (taskType !== "resume_edit") return {};
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch("/api/cv/data", { cache: "no-store", signal: controller.signal });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) return {};
    return createResumeBaseSnapshot(json.data);
  } catch {
    return {};
  } finally {
    window.clearTimeout(timeout);
  }
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

async function persistMessages(messages: AgentMessage[]): Promise<void> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!lastUser) return;

  try {
    await logInteraction({
      timestamp: new Date(lastUser.timestamp),
      trigger: "user_query",
      contextSnapshot: {
        profileVersion: "",
        pipelineSummary: "",
        recentActivityCount: 0,
      },
      reasoning: {
        thought: lastAssistant?.content || "",
        toolsConsidered: [],
        toolsUsed: [],
      },
      output: {
        type: "answer",
        summary: lastUser.content,
      },
    } as AgentInteraction);
  } catch {
    /* best-effort persistence */
  }
}

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
  const [completionInfo, setCompletionInfo] = useState<CompletionInfo | null>(null);
  const [resultQuality, setResultQuality] = useState<string | null>(null);
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null);
  const [activeRunNotice, setActiveRunNotice] = useState<ActiveRunNotice | null>(null);
  const [activeRunAction, setActiveRunAction] = useState<"resume" | "pause" | "cancel" | null>(null);
  const [latestRollbackProposal, setLatestRollbackProposal] = useState<ResumeEditProposalDTO | null>(null);
  const [rollbackAction, setRollbackAction] = useState<"rollback" | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const streamContentRef = useRef("");
  const interviewBootstrapRef = useRef<number | null>(null);
  const seenSignalKeys = useRef<Set<string>>(new Set());
  const handoffKeyRef = useRef<string>("");
  const handoffSessionCreateKeyRef = useRef<string>("");
  const createdHandoffSessionIdRef = useRef<number | null>(null);
  const manualSessionSwitchRef = useRef<number | null>(null);
  const durableRunCursorsRef = useRef<Record<string, number>>({});
  const currentSessionIdRef = useRef<number | null>(null);
  const itemAssemblerRef = useRef<AgentItemAssembler | null>(null);
  const itemSequenceRef = useRef(0);
  const turnItemPrefixRef = useRef("");

  const rafRef = useRef<number>(0);

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
          setCurrentSessionId(latest.id!);
          setMessages(latest.messages);
        } else {
          // Create default session with welcome message
          const id = await createSession([WELCOME]);
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

    getSession(id).then((session) => {
      if (!session) return;
      setCurrentSessionId(id);
      setMessages(session.messages);
      setStreamText("");
      setThinkingContent("");
      streamContentRef.current = "";
    });
  }, [mounted, searchParams, currentSessionId]);

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
  }, [mounted, streaming, searchParams]);

  useEffect(() => {
    if (!mounted || !currentSessionId) return;
    let cancelled = false;

    listActiveDurableAgentRunsClient(currentSessionId)
      .then((data) => {
        if (cancelled) return;
        setActiveRunNotice(data[0] ? activeNoticeFromRun(data[0]) : null);
      })
      .catch(() => {
        if (!cancelled) setActiveRunNotice(null);
      });

    return () => {
      cancelled = true;
    };
  }, [mounted, currentSessionId]);

  useEffect(() => {
    const notice = activeRunNotice;
    if (!mounted || !notice || !NON_TERMINAL_DURABLE_RUN_STATUSES.has(notice.status)) return;
    const runId = notice.id;
    if (notice.status === "paused") {
      setStreaming(false);
      setPhase(null);
      return;
    }
    setStreaming(notice.status !== "waiting_user");
    if (notice.status === "waiting_user") setPhase(null);
    itemAssemblerRef.current = new AgentItemAssembler(`run:${runId}`);

    const stopObserving = observeDurableAgentRun(runId, {
      afterCursor: durableRunCursorsRef.current[runId] || 0,
      onEvents(events, cursor) {
        durableRunCursorsRef.current[runId] = cursor;
        for (const runEvent of events) {
          if (runEvent.type === "run.status_changed") {
            const status = String(runEvent.payload.status || "");
            if (status) {
              setActiveRunNotice((current) => current?.id === runId ? { ...current, status } : current);
            }
            if (!NON_TERMINAL_DURABLE_RUN_STATUSES.has(status)) {
              setStreaming(false);
              setPhase(null);
              setExecutingTool(undefined);
              if (TERMINAL_DURABLE_RUN_STATUSES.has(status)) {
                setActiveRunNotice((current) => (current?.id === runId ? null : current));
              }
              if (currentSessionId) {
                const sessionId = currentSessionId;
                const refreshPersistedMessages = async () => {
                  for (let attempt = 0; attempt < 8; attempt += 1) {
                    if (currentSessionIdRef.current !== sessionId) return;
                    const session = await getSession(sessionId, { preferServer: true }).catch(() => undefined);
                    if (session?.messages) {
                      setMessages(session.messages);
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
          } else if (eventType === "done") {
            setExecutingTool(undefined);
          }
        }
      },
    });
    return () => {
      stopObserving();
    };
  }, [activeRunNotice, currentSessionId, mounted]);

  const appendAssistantStatusMessage = useCallback(async (content: string) => {
    const message: AgentMessage = {
      role: "assistant",
      content,
      timestamp: new Date().toISOString(),
    };
    const nextMessages = [...messages, message];
    setMessages(nextMessages);
    if (currentSessionId) {
      await updateSession(currentSessionId, { messages: nextMessages }).catch(() => {});
    }
  }, [currentSessionId, messages]);

  const handleGateDecision = useCallback(async (gateId: string, decision: "approved" | "denied") => {
    const gate = await respondDurableAgentRunGateClient(gateId, decision, createBrowserRequestId());
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
    setActiveRunAction("resume");
    try {
      if (activeRunNotice?.status === "paused") {
        const resumed = await requestDurableAgentRunResumeClient(runId, createBrowserRequestId());
        if (resumed) {
          setActiveRunNotice(activeNoticeFromRun(resumed));
          setStreaming(true);
          return;
        }
      }
      const run = await getDurableAgentRunClient(runId);
      if (!run) {
        setActiveRunNotice(null);
        await appendAssistantStatusMessage(`没有找到 Agent run #${shortRunId(runId)}，可能已经结束或被清理。`);
        return;
      }
      setActiveRunNotice(activeNoticeFromRun(run));
      const content = buildRunRecoveryMessage(run);
      const nextMessages = upsertRunRecoveryStatusMessage(messages, runId, content, new Date().toISOString());
      setMessages(nextMessages);
      if (currentSessionId) {
        await updateSession(currentSessionId, { messages: nextMessages }).catch(() => {});
      }
    } finally {
      setActiveRunAction(null);
    }
  }, [activeRunAction, activeRunNotice?.id, activeRunNotice?.status, appendAssistantStatusMessage, currentSessionId, messages]);

  const handlePauseActiveRun = useCallback(async () => {
    const runId = activeRunNotice?.id;
    if (!runId || activeRunAction || activeRunNotice?.status === "paused") return;
    setActiveRunAction("pause");
    try {
      const run = await requestDurableAgentRunPauseClient(runId, createBrowserRequestId());
      if (run) {
        setActiveRunNotice(activeNoticeFromRun(run));
        setStreaming(false);
        setPhase(null);
        await appendAssistantStatusMessage(`已暂停 Agent run #${shortRunId(runId)}，它仍可恢复。`);
      } else {
        await appendAssistantStatusMessage(`暂停 Agent run #${shortRunId(runId)} 失败，它可能已经结束。`);
      }
    } finally {
      setActiveRunAction(null);
    }
  }, [activeRunAction, activeRunNotice?.id, activeRunNotice?.status, appendAssistantStatusMessage]);

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
    setActiveRunAction("cancel");
    try {
      const run = await requestDurableAgentRunCancelClient(runId, createBrowserRequestId());
      if (run) {
        setActiveRunNotice(activeNoticeFromRun(run));
        await appendAssistantStatusMessage(`已提交 Agent run #${shortRunId(runId)} 的取消请求，Worker 会在安全位置停止。`);
      } else {
        await appendAssistantStatusMessage(`取消 Agent run #${shortRunId(runId)} 失败，它可能已经结束。`);
      }
    } finally {
      setActiveRunAction(null);
    }
  }, [activeRunAction, activeRunNotice?.id, appendAssistantStatusMessage]);

  const sendMessage = useCallback(
    async (content: string, images?: string[], options?: SendMessageOptions) => {
      const hideUserMessage = options?.hideUserMessage === true;
      const explicitForcedAgentId = options?.forcedAgentId;
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
      const extracted = deduplicateSignals(scanMessage(content, sesId), seenSignalKeys.current);

      // If regex found few signals but message is substantial, add raw_context for LLM enrichment
      const rawCtx = maybeRawContext(content, extracted.length, sesId);
      if (rawCtx) {
        const rawDeduped = deduplicateSignals([rawCtx], seenSignalKeys.current);
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

      const sessionForActiveRun = currentSessionId ? await getSession(currentSessionId).catch(() => undefined) : undefined;
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

      if (activeRunNotice && NON_TERMINAL_DURABLE_RUN_STATUSES.has(activeRunNotice.status) && !confirmedTaskSwitchForSubmit) {
        const submitted = await submitDurableAgentRunInputClient(activeRunNotice.id, {
          requestId: createBrowserRequestId(),
          input: { content, images, persistInConversation: !hideUserMessage },
        });
        if (submitted) {
          setActiveRunNotice(activeNoticeFromRun(submitted.run));
        } else {
          setStreaming(false);
          setPhase(null);
          setMessages((current) => {
            const next = [...current];
            const lastIndex = next.length - 1;
            if (next[lastIndex]?.role === "assistant" && !next[lastIndex]?.content) {
              next[lastIndex] = {
                ...next[lastIndex],
                content: "补充信息未能写入当前 Run，请稍后重试。",
              };
            }
            return next;
          });
        }
        return;
      }

      if (activeRunNotice && confirmedTaskSwitchForSubmit) {
        const paused = await requestDurableAgentRunPauseClient(activeRunNotice.id, createBrowserRequestId());
        if (paused) setActiveRunNotice(activeNoticeFromRun(paused));
      }

      const imageDataUris = (images || []).filter((src) => typeof src === "string" && src.startsWith("data:image/"));
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

      if (imageDataUris.length > 0) {
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
      }

      // ── File preprocessing: extract text from PDFs, keep images as context ──
      let fileContext = "";
      if (images?.length) {
        for (const b64 of images) {
          const isPdf = b64.startsWith("data:application/pdf");
          if (isPdf) {
            try {
              const res = await fetch(b64);
              const blob = await res.blob();
              const fd = new FormData();
              fd.append("file", blob, "resume.pdf");
              const importRes = await fetch("/api/cv/import", { method: "POST", body: fd });
              const importData = await importRes.json();
              if (importData.success) {
                const sections = importData.data.sections as Record<string, string>;
                fileContext += "\n\n---\n已解析的简历内容：\n" + Object.entries(sections)
                  .filter(([, v]) => v).map(([k, v]) => `【${k}】\n${v}`).join("\n\n");
              }
            } catch { /* preprocess failed, agent handles it */ }
          }
        }
      }

      if (fileContext) {
        content = content + fileContext;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      let durableRunId: string | null = null;
      let workerOwnedRun = false;
      const applyItem = (event: Parameters<AgentItemAssembler["apply"]>[0]) => {
        const assembler = itemAssemblerRef.current || new AgentItemAssembler(turnItemPrefixRef.current || `turn:${createBrowserRequestId()}`);
        itemAssemblerRef.current = assembler;
        itemSequenceRef.current += 1;
        return assembler.apply({ ...event, cursor: event.cursor ?? itemSequenceRef.current });
      };

      try {
        // ── Client-side orchestration: classify + agentLoopClient ──
        const sessionMessages = updated.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const currentSessionForRun = currentSessionId ? await getSession(currentSessionId) : undefined;
        const memoryDigest = currentSessionForRun?.memoryDigest;
        const agentState = markOfferStateStaleFromText(currentSessionForRun?.agentState, content) || currentSessionForRun?.agentState;
        const journeyArtifacts = collectArtifactRefsFromSafePayloads([
          ...(currentSessionForRun?.messages || []).filter((message) => message.role === "tool").map((message) => message.toolResult),
        ]);
        const activeGuidedSession = resolveActiveGuidedSession({
          agentState,
          interviewState: currentSessionForRun?.interviewState,
        });
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
          await updateSession(currentSessionId, {
            messages: fullMessages,
            memoryDigest: await generateMemoryDigestWithStatus(
              fullMessages,
              currentSessionForRun.memoryDigest,
            ),
            interviewState: currentSessionForRun.interviewState,
            agentState: {
              ...(agentState || {}),
              guidedSession: nextGuidedSession,
            },
          });
          setSessions(await listSessions());
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
            const match = matchInterviewMaterialReference(decision, materialRecords);
            rebindResolution = resolveInterviewRebindAction(decision, match);
          }
        }

        const preferredDocumentType = imageDataUris.length
          ? inferPreferredDocumentTypeFromText(content)
          : undefined;
        let imageIntake: ImageIntakeResult | null = null;
        if (imageDataUris.length > 0) {
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
              setSessions(await listSessions());
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
        let routeDecision = routeAgentTask({
          agentId: forcedAgentId || "general",
          content,
          imageIntake,
          preferredDocumentType,
          activeTask: activeGuidedSessionForRun,
        });
        const routeForcedAgentId = forcedAgentId || (routeDecision.taskType ? taskAgentId(routeDecision.taskType) : undefined);
        const interviewState = shouldBypassConversationLocks ? undefined : currentSessionForRun?.interviewState;
        let activeTaskContract: AgentTaskContract | null = null;
        const completedContractCriteria = new Set<string>();
        let taskType = routeDecision.taskType;
        if (taskType) {
          try {
            const baseSnapshot = await loadTaskBaseSnapshot(taskType);
            const runAgentId = routeForcedAgentId || taskAgentId(taskType);
            const contract = createAgentTaskContract({
              taskType,
              target: buildRunTarget(content, runAgentId, imageIntake),
              requiresUserApproval: taskType === "resume_edit",
              successCriteria: routeDecision.requiresClarification
                ? ["clarification question asked"]
                : undefined,
              validators: routeDecision.requiresClarification
                ? ["user_intent_clarification"]
                : undefined,
              routing: {
                contractPolicy: routeDecision.contractPolicy,
                memoryTask: routeDecision.memoryTask,
                allowedTools: routeDecision.allowedTools.slice(0, 20),
                requiresClarification: routeDecision.requiresClarification,
                clarificationQuestion: routeDecision.clarificationQuestion,
                blockedReason: routeDecision.blockedReason,
                auditSummary: routeDecision.auditSummary,
                activeTaskId: activeGuidedSessionForRun?.taskId,
                activeTaskType: activeGuidedSessionForRun?.taskType,
                activeTaskPhase: activeGuidedSessionForRun?.phase,
                routeLocked: Boolean(activeGuidedSessionForRun),
              },
              journey: {
                graphVersion: TASK_JOURNEY_GRAPH_VERSION,
                artifacts: [
                  ...journeyArtifacts,
                  ...(baseSnapshot.baseVersion && baseSnapshot.baseHash
                    ? [{
                        artifactId: "active-resume",
                        kind: "resume" as const,
                        version: baseSnapshot.baseVersion,
                        hash: baseSnapshot.baseHash,
                      }]
                    : []),
                ].slice(-12),
              },
              ...baseSnapshot,
            });
            activeTaskContract = contract;
            if (taskType === "interview_coaching" && interviewState?.planSnapshot) {
              completedContractCriteria.add("JD/resume context bound");
            }
            const created = await createDurableAgentRunClient({
              requestId: createBrowserRequestId(),
              conversationId: currentSessionId,
              taskType,
              agentId: runAgentId,
              input: { content, images, persistInConversation: !hideUserMessage },
              contract,
            });
            const createdRun = created?.run || null;
            if (created?.assignment.owner === "worker" && createdRun) {
              workerOwnedRun = true;
              durableRunId = createdRun.id;
              setActiveRunNotice({
                ...activeNoticeFromRun(createdRun),
                phase: "understanding",
                guidedTaskId: activeGuidedSessionForRun?.taskId,
                guidedTaskPhase: activeGuidedSessionForRun?.phase,
              });
              abortRef.current = null;
              return;
            }
          } catch (error) {
            if (error instanceof DurableRunOwnershipUnknownError) throw error;
            durableRunId = null;
          }
        }

        const { agent, systemPrompt } = await orchestrate(routedContent, {
          sessionId: currentSessionId,
          messages: sessionMessages,
          memoryDigest,
          agentState,
          imageIntake,
          preferredDocumentType,
          forcedAgentId: routeForcedAgentId,
        });

        const interviewContext = interviewState?.planSnapshot
          ? `\n\n## Active Interview Session
This chat is running a mock interview. Treat the following snapshot as the source of truth and do not silently switch materials.
Company: ${interviewState.planSnapshot.jdSnapshot?.company || "unknown"}
Role: ${interviewState.planSnapshot.jdSnapshot?.role || "unknown"}
Mode: ${interviewState.planSnapshot.mode}
Difficulty: ${interviewState.planSnapshot.difficulty}
Focus areas: ${interviewState.planSnapshot.focusAreas.join(", ") || "none"}
Allow follow-ups: ${interviewState.planSnapshot.allowFollowUps ? "yes" : "no"}
Answered user turns: ${countAnsweredInterviewRounds(interviewState)}

JD snapshot excerpt:
${(interviewState.planSnapshot.jdSnapshot?.body || "").slice(0, 1600) || "No JD snapshot available."}

Resume snapshot excerpt:
${(interviewState.planSnapshot.resumeSnapshot?.body || "").slice(0, 1600) || "No resume snapshot available."}

Rules:
- This JD and resume remain binding across the whole mock interview, including after the user corrects your format.
- Ask exactly one interview question per assistant turn. Never list a batch of questions.
- Before the question, include four concise coaching lines: 题型, 考察点, JD 关联, 简历关联.
- Then ask exactly one question and stop. Wait for the user's answer.
- Attach follow-ups to the current question and the original JD/resume snapshot.
- Do not ask the user to repost JD/resume unless the snapshot is empty and no recent JD can be read.`
          : "";
        const rebindContext = rebindResolution
          ? `\n\n${formatInterviewRebindRuntimeDirective(rebindResolution)}`
          : "";

        setActiveAgent(agent);

        if (!routeDecision.taskType) {
          routeDecision = routeAgentTask({
            agentId: agent.id,
            content,
            imageIntake,
            preferredDocumentType,
            activeTask: activeGuidedSessionForRun,
          });
          taskType = routeDecision.taskType;
        }
        const guidedDirective = buildGuidedSessionRuntimeDirective({
          activeTask: activeGuidedSessionForRun,
          requiresSwitchConfirmation: routeDecision.requiresClarification && Boolean(activeGuidedSessionForRun),
          clarificationQuestion: routeDecision.clarificationQuestion,
        });
        const activeSystemPrompt = `${systemPrompt}${interviewContext}${rebindContext}${guidedDirective}`;
        const addContractCriteria = (criteria: string[]) => {
          if (!activeTaskContract) return;
          for (const criterion of criteria) {
            if (activeTaskContract.successCriteria.includes(criterion)) {
              completedContractCriteria.add(criterion);
            }
          }
        };

        const recordRunStep = (input: {
          phase: string;
          toolName?: string;
          status?: string;
          inputSummary?: string;
          outputSummary?: string;
          verifier?: unknown;
          error?: unknown;
        }) => {
          if (!durableRunId) return;
          const runId = durableRunId;
          setActiveRunNotice((prev) =>
            prev?.id === runId
              ? {
                  ...prev,
                  phase: input.phase,
                  toolName: input.toolName || prev.toolName,
                  verifierSummary: input.verifier ? truncateLedgerText(input.verifier, 140) : prev.verifierSummary,
                  guidedTaskId: activeGuidedSessionForRun?.taskId || prev.guidedTaskId,
                  guidedTaskPhase: activeGuidedSessionForRun?.phase || prev.guidedTaskPhase,
                  status: input.phase === "verifying" ? "verifying" : input.phase === "repairing" ? "repairing" : prev.status,
                }
              : prev,
          );
        };

        const updateRunStatus = async (
          status: AgentRunStatus,
          patch: { result?: unknown; error?: unknown } = {},
        ) => {
          if (!durableRunId) return;
          const runId = durableRunId;
          setActiveRunNotice((prev) => (prev?.id === runId ? { ...prev, status } : prev));
          if (TERMINAL_DURABLE_RUN_STATUSES.has(status)) {
            window.setTimeout(() => {
              setActiveRunNotice((prev) => (prev?.id === runId ? null : prev));
            }, 2500);
          }
        };

        let toolResultInfo: LastToolResultInfo | null = null;
        const toolResultHistory: LastToolResultInfo[] = [];
        let assistantText = "";
        let nextOfferState = agentState?.offer;
        let resumeSectionSaveSucceeded = false;
        let resumeEditAppliedSucceeded = false;
        let resumeEditRolledBackSucceeded = false;

        const msgList = updated.map((m, index) => ({
          role: m.role,
          content: m.content,
          images: m.images,
        }));

        let firstEvent = true;
        for await (const event of agentLoopRemote(
          activeSystemPrompt,
          msgList,
          controller.signal,
          {
            agentId: agent.id,
            interviewState,
            interviewRebindAction: rebindResolution?.action,
            taskContract: activeTaskContract,
          },
        )) {
          if (firstEvent) { setStartTime(Date.now()); firstEvent = false; }
          switch (event.type) {
            case "phase": {
              setPhase(event.phase);
              if (event.phase) recordRunStep({ phase: event.phase, status: "running" });
              break;
            }
            case "intent": break;
            case "agent_switch": break;
            case "thinking_content": setThinkingContent(sanitizeSafeReasoningSummary(event.content)); break;
            case "tool_call":
              setExecutingTool(event.name);
              setResultQuality(null);
              recordRunStep({
                phase: "executing",
                toolName: event.name,
                status: "running",
                inputSummary: summarizeLedgerParams(event.params),
              });
              break;
            case "tool_result": {
              const uiPayload = (event as { uiPayload?: Record<string, unknown> }).uiPayload;
              const verifiedAction = (event as { verifiedAction?: VerifiedActionResult }).verifiedAction;
              toolResultInfo = { name: event.name, result: event.result, success: event.success, data: event.data, uiPayload, verifiedAction };
              toolResultHistory.push(toolResultInfo);
              const readBackRequirement = getReadBackRequirementStatus(event.name, {
                success: event.success,
                data: event.data,
                uiPayload,
                verifiedAction,
              });
              if (activeTaskContract) {
                addContractCriteria(inferCompletedCriteriaFromToolResult(activeTaskContract, {
                  toolName: event.name,
                  toolSuccess: event.success,
                  data: event.data,
                  uiPayload,
                  verifiedAction,
                  readBackVerified: uiPayload?.readBackVerified === true,
                }));
              }
              recordRunStep({
                phase: "verifying",
                toolName: event.name,
                status: event.success ? "succeeded" : "failed",
                outputSummary: truncateLedgerText(event.result),
                verifier: {
                  success: event.success,
                  hasUiPayload: Boolean(uiPayload),
                  readBackRequirement,
                  verifiedAction: verifiedAction
                    ? {
                        success: verifiedAction.success,
                        action: verifiedAction.action,
                        readBack: verifiedAction.readBack,
                        verifier: verifiedAction.verifier,
                        evidence: {
                          targetType: verifiedAction.evidence?.targetType,
                          targetId: verifiedAction.evidence?.targetId,
                          targetField: verifiedAction.evidence?.targetField,
                          expectedHash: verifiedAction.evidence?.expectedHash,
                          readBackHash: verifiedAction.evidence?.readBackHash,
                          versionId: verifiedAction.evidence?.versionId,
                          validators: verifiedAction.evidence?.validators?.map((check) => ({
                            phase: check.phase,
                            ok: check.ok,
                            code: check.code,
                            message: check.message,
                          })),
                        },
                      }
                    : undefined,
                  completedCriteria: Array.from(completedContractCriteria),
                },
              });
              if ((event.name === "apply_resume_edit_proposal" || event.name === "save_resume_section") && event.success) {
                resumeSectionSaveSucceeded = true;
              }
              if (event.name === "apply_resume_edit_proposal" && event.success) {
                resumeEditAppliedSucceeded = true;
              }
              if (event.name === "rollback_resume_edit_proposal" && event.success) {
                resumeEditRolledBackSucceeded = true;
              }
              const offerPayload = uiPayload;
              if (offerPayload?.type === "offer_evaluation" || offerPayload?.type === "offer_report") {
                nextOfferState = {
                  activeOfferId: Number(offerPayload.offerId || offerPayload.activeOfferId || 0) || nextOfferState?.activeOfferId,
                  activeOfferReportId: Number(offerPayload.reportId || offerPayload.reportNum || 0) || nextOfferState?.activeOfferReportId,
                  lastUserIntent: "evaluate",
                  lastEvaluationSummary: {
                    company: String(offerPayload.company || ""),
                    role: String(offerPayload.role || ""),
                    overallScore: Number(offerPayload.overallScore || 0),
                    verdict: String(offerPayload.verdict || "proceed_cautiously") as "accept" | "accept_after_negotiation" | "proceed_cautiously" | "decline",
                    summary: String(offerPayload.summary || ""),
                  },
                  missingInfo: Array.isArray(offerPayload.missingInfo) ? (offerPayload.missingInfo as string[]) : nextOfferState?.missingInfo,
                  redFlags: Array.isArray(offerPayload.redFlags) ? (offerPayload.redFlags as string[]) : nextOfferState?.redFlags,
                  updatedAt: new Date().toISOString(),
                };
              } else if (offerPayload?.type === "offer_negotiation_strategy") {
                nextOfferState = {
                  ...(nextOfferState || {}),
                  lastUserIntent: "negotiate",
                  activeOfferReportId: Number(offerPayload.reportId || nextOfferState?.activeOfferReportId || 0) || nextOfferState?.activeOfferReportId,
                  updatedAt: new Date().toISOString(),
                };
              } else if (offerPayload?.type === "offer_hr_question_list") {
                nextOfferState = {
                  ...(nextOfferState || {}),
                  lastUserIntent: "ask_hr",
                  activeOfferReportId: Number(offerPayload.reportId || nextOfferState?.activeOfferReportId || 0) || nextOfferState?.activeOfferReportId,
                  updatedAt: new Date().toISOString(),
                };
              }
              // Project tools through the user-safe surface; raw result/data never enters the transcript.
              setMessages((prev) => {
                const copy = [...prev];
                const safeView = projectToolResultForUser({
                  toolName: event.name,
                  success: event.success,
                  uiPayload,
                });
                if (safeView.kind === "silent") return copy;
                const item = applyItem({
                  type: "completed",
                  itemId: `${turnItemPrefixRef.current}:tool:${event.name}:${itemSequenceRef.current + 1}`,
                  content: safeView.summary,
                  toolView: safeView,
                });
                const toolMsg: AgentMessage = {
                  role: "tool",
                  itemId: item?.itemId,
                  content: safeView.summary,
                  toolResult: {
                    success: event.success,
                    uiPayload: safeView.uiPayload,
                    safeView,
                  },
                  toolName: event.name,
                  timestamp: new Date().toISOString(),
                };
                copy.push(toolMsg);
                return projectAgentMessages(copy);
              });
              break;
            }
            case "tool_error":
              console.warn(`[agent] tool error: ${event.name} -> ${event.error}`);
              recordRunStep({
                phase: event.recoverable ? "repairing" : "verifying",
                toolName: event.name,
                status: "failed",
                error: { message: truncateLedgerText(event.error), recoverable: event.recoverable },
              });
              break;
            case "result_quality":
              setResultQuality(event.quality);
              recordRunStep({
                phase: "verifying",
                status: event.quality === "good" ? "succeeded" : "failed",
                verifier: { quality: event.quality },
              });
              break;
            case "text": {
              assistantText += event.content;
              streamContentRef.current = assistantText;
              setStreamText(assistantText);
              if (assistantText.trim()) {
                const item = applyItem({
                  type: "delta",
                  itemId: `${turnItemPrefixRef.current}:assistant`,
                  content: event.content,
                });
                setMessages((current) => {
                  const next = [...current];
                  const last = next[next.length - 1];
                  const assistant: AgentMessage = { ...assistantMsg, itemId: item?.itemId, content: assistantText };
                  if (last?.role === "assistant" && last.timestamp === assistantMsg.timestamp) {
                    next[next.length - 1] = assistant;
                  } else if (!last || last.role !== "assistant" || last.content !== assistantText) {
                    next.push(assistant);
                  }
                  return next;
                });
              }
              break;
            }
            case "block_start":
              setEvalProgress(prev => {
                const filtered = prev.filter(p => p.block !== event.block);
                return [...filtered, { block: event.block, label: event.label || event.block, status: "running" }];
              });
              break;
            case "block_done":
              setEvalProgress(prev => prev.map(p => p.block === event.block ? { ...p, status: "done" } : p));
              break;
            case "score":
              setEvalProgress(prev => prev.map(p => p.block === event.block ? { ...p, score: event.score } : p));
              break;
            case "overall_score": break;
            case "search_start":
              // Show risk scan / external search as a progress step
              if (event.source === "risk-scan" || event.source === "web") {
                setEvalProgress(prev => {
                  const filtered = prev.filter(p => p.block !== "search");
                  return [...filtered, { block: "search", label: `🔍 ${event.query.slice(0, 12)}`, status: "running" }];
                });
              }
              break;
            case "search_result":
              setEvalProgress(prev => prev.map(p => p.block === "search" ? { ...p, status: "done", score: event.count } : p));
              break;
            case "persist_done":
              if (event.readBackVerified) {
                setCompletionInfo({
                  reportNum: event.reportNum,
                  company: event.company,
                  role: event.role,
                  score: event.score,
                });
              } else {
                setCompletionInfo(null);
              }
              if (activeTaskContract?.taskType === "jd_evaluation") {
                addContractCriteria(["report persisted"]);
                if (event.readBackVerified) {
                  addContractCriteria(["saved report read-back verification passes"]);
                }
                recordRunStep({
                  phase: "verifying",
                  toolName: "evaluate_jd_full",
                  status: event.readBackVerified ? "succeeded" : "failed",
                  verifier: {
                    reportNum: event.reportNum,
                    readBackVerified: event.readBackVerified === true,
                    readBackError: event.readBackError || "",
                    completedCriteria: Array.from(completedContractCriteria),
                  },
                });
              }
              break;
            case "done": break;
          }
        }

        // ── Finalize ──
        if (routeDecision.requiresClarification && activeTaskContract) {
          addContractCriteria(["clarification question asked"]);
        }
        const careerPositioningArtifact = activeTaskContract?.taskType === "career_positioning_guidance"
          ? buildCareerPositioningArtifact(updated)
          : null;
        const careerPositioningFallback = activeTaskContract?.taskType === "career_positioning_guidance"
          ? buildCareerPositioningFallback({
              messages: updated,
              assistantText,
              toolResult: toolResultInfo,
            })
          : null;
        if (activeTaskContract?.taskType === "career_positioning_guidance" && (assistantText.trim() || careerPositioningFallback)) {
          addContractCriteria(["next question or guidance response generated"]);
        }
        if (activeTaskContract?.taskType === "resume_query" && assistantText.trim()) {
          addContractCriteria(["answer generated"]);
        }
        if (activeTaskContract?.taskType === "interview_coaching" && assistantText.trim()) {
          if (interviewState?.planSnapshot) addContractCriteria(["JD/resume context bound"]);
          addContractCriteria(["one question generated", "session state updated without losing context"]);
        }
        const contractRunOutcome = activeTaskContract
          ? resolveTaskContractRunOutcome(activeTaskContract, Array.from(completedContractCriteria), {
              requiresClarification: routeDecision.requiresClarification,
              hasAssistantResponse: Boolean(assistantText.trim()),
              hasUserVisibleArtifact: Boolean(
                toolResultInfo
                && projectToolResultForUser({
                  toolName: toolResultInfo.name,
                  success: toolResultInfo.success,
                  uiPayload: toolResultInfo.uiPayload,
                }).kind !== "silent",
              ),
            })
          : null;
        const contractGateResult = contractRunOutcome?.gate || null;
        const contractGateFailed = contractRunOutcome?.status === "failed";
        if (contractGateFailed && activeTaskContract && contractGateResult) {
          recordRunStep({
            phase: "verifying",
            status: "failed",
            verifier: {
              contract: activeTaskContract,
              completedCriteria: contractGateResult.completedCriteria,
              unmetCriteria: contractGateResult.unmetCriteria,
            },
            error: {
              message: `Task contract unmet: ${contractGateResult.unmetCriteria.join(", ")}`,
            },
          });
        }
        const lastToolSafeView = toolResultInfo
          ? projectToolResultForUser({
              toolName: toolResultInfo.name,
              success: toolResultInfo.success,
              uiPayload: toolResultInfo.uiPayload,
            })
          : null;
        const fallbackAssistantContent = contractRunOutcome?.status === "waiting_user"
          ? contractRunOutcome.safeMessage || "已生成待确认内容，请确认下一步。"
          : toolResultInfo && !toolResultInfo.success
            ? lastToolSafeView?.summary || "操作未能完成，请稍后重试。"
            : lastToolSafeView?.kind === "silent"
              ? ""
              : "操作完成。";
        let finalAssistantContent = sanitizeUnsupportedResumeSaveClaim(
          careerPositioningFallback || assistantText || fallbackAssistantContent,
          resumeSectionSaveSucceeded && !contractGateFailed,
        );
        if (contractRunOutcome?.replaceAssistantMessage && contractRunOutcome.safeMessage) {
          finalAssistantContent = contractRunOutcome.safeMessage;
        }
        const shouldAwaitCareerPositioningConfirmation = Boolean(
          activeTaskContract?.taskType === "career_positioning_guidance" &&
          careerPositioningArtifact &&
          !contractGateFailed &&
          /(定位卡|定位假设|目标方向|阶段性结果)/.test(finalAssistantContent) &&
          /(确认|认可|保存|写入求职画像)/.test(finalAssistantContent),
        );
        const finalRunStatus: AgentRunStatus = contractRunOutcome?.status
          || (routeDecision.requiresClarification
            ? "waiting_user"
            : toolResultInfo && !toolResultInfo.success
              ? "failed"
              : "succeeded");
        streamContentRef.current = finalAssistantContent;
        setStreamText(finalAssistantContent);
        setPhase(null);
        setExecutingTool(undefined);
        setEvalProgress([]);

        const hasVisibleToolResult = Boolean(lastToolSafeView && lastToolSafeView.kind !== "silent");
        if (assistantText.trim() || hasVisibleToolResult || careerPositioningFallback?.trim()) {
          // Build final assistant
          const finalAssistant: AgentMessage = {
            ...assistantMsg,
            content: finalAssistantContent,
          };

          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === "assistant") {
              copy[copy.length - 1] = finalAssistant;
            } else {
              copy.push(finalAssistant);
            }
            return copy;
          });

          // Save to current session
          if (currentSessionId) {
            const currentSession = await getSession(currentSessionId);
            if (currentSession) {
              const currentAgentState = currentSession.agentState || currentSessionForRun?.agentState || {};
              const fullMessages = [...currentSession.messages];
              // Tag user message with agent_id
              const taggedUserMsg = agent.id !== "general"
                ? { ...userMsg, agent_id: agent.id }
                : userMsg;
              if (!hideUserMessage) fullMessages.push(taggedUserMsg);
              const persistedImageIntakeToolMessage = imageIntakeToolMessage as AgentMessage | null;
              if (!hideUserMessage && persistedImageIntakeToolMessage) {
                fullMessages.push({
                  ...persistedImageIntakeToolMessage,
                  agent_id: agent.id !== "general" ? agent.id : undefined,
                });
              }
              const persistedToolMessages: AgentMessage[] = toolResultHistory
                .map((result) => projectToolResultForUser({
                  toolName: result.name,
                  success: result.success,
                  uiPayload: result.uiPayload,
                }))
                .filter((view) => view.kind !== "silent")
                .map((view) => ({
                  role: "tool" as const,
                  content: view.summary,
                  toolName: view.toolName,
                  toolResult: view,
                  agent_id: agent.id !== "general" ? agent.id : undefined,
                  timestamp: new Date().toISOString(),
                }));
              fullMessages.push(...persistedToolMessages);
              const taggedAssistant = agent.id !== "general"
                ? { ...finalAssistant, agent_id: agent.id }
                : finalAssistant;
              fullMessages.push(taggedAssistant);

              let nextInterviewState = hideUserMessage
                ? updateInterviewStateWithAssistantMessage(currentSession.interviewState, taggedAssistant)
                : updateInterviewStateWithExchange(
                    currentSession.interviewState,
                    taggedUserMsg,
                    taggedAssistant,
                  );
              for (const persistedToolMessage of persistedToolMessages) {
                nextInterviewState = updateInterviewStateWithToolResult(
                  nextInterviewState || currentSession.interviewState,
                  persistedToolMessage,
                );
              }
              if (nextInterviewState && !hideUserMessage && shouldPersistInterviewRecap(taggedUserMsg.content)) {
                nextInterviewState = persistInterviewRecap(nextInterviewState, taggedAssistant.content);
              }
              const isFirstUserMsg = currentSession.messages.filter((m) => m.role === "user").length === 0;
              const memoryDigest = await generateMemoryDigestWithStatus(
                fullMessages,
                currentSession.memoryDigest || currentSessionForRun?.memoryDigest,
              );

              // Set title from FIRST user message (not current message)
              const needsTitle =
                !currentSession.interviewState?.planSnapshot &&
                (isFirstUserMsg ||
                  !currentSession.title ||
                  currentSession.title === "新对话" ||
                  currentSession.title === "新的对话");
              let sessionTitle: string | undefined;
              if (needsTitle) {
                const firstUserMsg = fullMessages.find((m) => m.role === "user");
                const titleText = firstUserMsg ? firstUserMsg.content.trim() : content.trim();
                sessionTitle = makeSessionTitle(titleText);
              }
              const shouldClearReferenceResumeSave =
                (toolResultInfo?.name === "save_reference_resume" && toolResultInfo.success) ||
                Boolean(pendingReferenceResumeSaveForRun && isPendingReferenceResumeSaveCancelled(content));
              const nextReferenceResumeSave = shouldClearReferenceResumeSave
                ? undefined
                : currentAgentState.referenceResumeSave as ReferenceResumeSaveSessionState | undefined;
              let nextGuidedSession: GuidedSessionState | undefined =
                (currentAgentState.guidedSession && typeof currentAgentState.guidedSession === "object"
                  ? currentAgentState.guidedSession as GuidedSessionState
                  : undefined);
              const confirmedSwitchAway =
                Boolean(activeGuidedSession && routeDecision.taskType !== activeGuidedSession.taskType && isConfirmedGuidedTaskSwitch(content));
              const cancelledActiveGuidedTask =
                Boolean(activeGuidedSession && isExplicitGuidedTaskCancel(content) && !confirmedSwitchAway);
              const completedReferenceResumeSave =
                taskType === "reference_resume_save" &&
                toolResultInfo?.name === "save_reference_resume" &&
                toolResultInfo.success === true;
              const shouldKeepLockForSwitchConfirmation =
                Boolean(activeGuidedSession && routeDecision.requiresClarification);
              const imageDecisionForState = imageIntake ? routeImageIntake(content, imageIntake) : undefined;
              const shouldKeepImageClarification =
                Boolean(imageDecisionForState && (imageDecisionForState.route === "clarify_intent" || imageDecisionForState.route === "retry_image"));
              const imageClarificationTaskType =
                imageDecisionForState
                  ? (imageDecisionForState.documentType === "jd"
                      ? "jd_evaluation"
                      : imageDecisionForState.documentType === "offer"
                        ? "offer_evaluation"
                        : imageDecisionForState.documentType === "resume"
                          ? routeDecision.taskType || "resume_query"
                          : taskType)
                  : taskType;
              const completedGuidedBusinessTask =
                (taskType === "jd_evaluation" && toolResultInfo?.name === "evaluate_jd_full" && toolResultInfo.success === true && !contractGateFailed) ||
                (taskType === "offer_evaluation" && toolResultInfo?.name === "evaluate_offer" && toolResultInfo.success === true && !contractGateFailed) ||
                (taskType === "resume_edit" && (resumeEditAppliedSucceeded || resumeEditRolledBackSucceeded));
              if (
                completedReferenceResumeSave ||
                completedGuidedBusinessTask ||
                (cancelledActiveGuidedTask && !shouldKeepLockForSwitchConfirmation) ||
                confirmedSwitchAway
              ) {
                nextGuidedSession = finishGuidedSession(
                  activeGuidedSession || nextGuidedSession,
                  completedReferenceResumeSave || completedGuidedBusinessTask ? "completed" : "cancelled",
                  completedReferenceResumeSave
                    ? "优秀简历已保存并完成读回校验"
                    : completedGuidedBusinessTask
                      ? `${taskLabelZh(taskType)}已完成并通过校验`
                      : "用户结束或切换了当前引导任务",
                );
              } else if (shouldKeepImageClarification && imageClarificationTaskType && isGuidedTaskType(imageClarificationTaskType)) {
                nextGuidedSession = startOrContinueGuidedSession({
                  existing: activeGuidedSessionForRun || nextGuidedSession,
                  taskType: imageClarificationTaskType,
                  agentId: taskAgentId(imageClarificationTaskType),
                  allowedTools: routeDecision.allowedTools.slice(0, 20),
                  phase: imageDecisionForState?.route === "retry_image" ? "image_retry" : "image_intent_clarification",
                  expectedInput: imageDecisionForState?.clarificationQuestion || imageDecisionForState?.retryHint || "确认图片内容要走哪个求职任务",
                  summary: `等待图片任务澄清：${taskLabelZh(imageClarificationTaskType)}`,
                  documentType: imageDecisionForState?.documentType,
                  imageRoute: imageDecisionForState?.route,
                  imageQuality: imageDecisionForState?.quality,
                  imageConfidence: imageDecisionForState?.confidence,
                  sourceText: imageIntake?.extractedText,
                  source: "image_clarification",
                });
              } else if (shouldAwaitCareerPositioningConfirmation && careerPositioningArtifact) {
                nextGuidedSession = startOrContinueGuidedSession({
                  existing: activeGuidedSessionForRun || nextGuidedSession,
                  taskType: "career_positioning_guidance",
                  agentId: "profile",
                  allowedTools: routeDecision.allowedTools.slice(0, 20),
                  phase: "awaiting_positioning_confirmation",
                  expectedInput: "回复“确认”保存定位结果到求职画像，或直接说明要调整的地方",
                  summary: `等待确认定位卡：${careerPositioningArtifact.targetRoles[0]?.role || "自我定位"}`,
                  source: "career_positioning",
                  sourceText: JSON.stringify(careerPositioningArtifact),
                });
              } else if (taskType && isGuidedTaskType(taskType)) {
                nextGuidedSession = startOrContinueGuidedSession({
                  existing: activeGuidedSession || nextGuidedSession,
                  taskType,
                  agentId: taskAgentId(taskType),
                  allowedTools: routeDecision.allowedTools.slice(0, 20),
                  phase: taskType === "career_positioning_guidance"
                    ? "career_direction_discovery"
                    : taskType === "interview_coaching"
                      ? "one_question_loop"
                      : taskType === "resume_edit"
                        ? contractRunOutcome?.status === "waiting_user" ? "awaiting_resume_draft_confirmation" : "resume_optimization"
                        : "role_category_confirmation",
                  expectedInput: taskType === "resume_edit" && contractRunOutcome?.status === "waiting_user"
                    ? "选择一个优化方案并确认创建修改提案，或说明需要继续调整的地方"
                    : undefined,
                  summary: taskType === "resume_edit" && contractRunOutcome?.status === "waiting_user"
                    ? "等待确认简历优化草稿"
                    : taskLabelZh(taskType),
                  source: activeGuidedSessionForRun?.source || "agent_state",
                  sourceText: activeGuidedSessionForRun?.sourceText,
                });
              } else if (activeGuidedSessionForRun && !routeDecision.requiresClarification) {
                nextGuidedSession = activeGuidedSessionForRun;
              }
              await updateSession(currentSessionId, {
                messages: fullMessages,
                title: sessionTitle,
                memoryDigest: memoryDigest ?? undefined,
                interviewState: nextInterviewState,
                agentState: {
                  ...currentAgentState,
                  offer: nextOfferState,
                  referenceResumeSave: nextReferenceResumeSave,
                  guidedSession: nextGuidedSession,
                },
              });
              triggerSessionAnomalyReview({
                sessionId: currentSessionId,
                messages: fullMessages,
                activeTask: nextGuidedSession || activeGuidedSession,
                recentRuns: durableRunId
                  ? [{ id: durableRunId, task_type: taskType || "", agent_id: agent.id, status: finalRunStatus }]
                  : [],
              });
              // Refresh sessions list
              setSessions(await listSessions());
            }
          }

          // Auto-trigger profile update after each completed agent exchange
          triggerProfileUpdate({ force: true }).catch(() => {});
          if (resumeEditAppliedSucceeded) {
            await refreshLatestRollbackProposal();
          }
          if (resumeEditRolledBackSucceeded) {
            setLatestRollbackProposal(null);
          }

          // Best-effort legacy persist
          if (!hideUserMessage) {
            try { persistMessages([...updated, finalAssistant]); } catch { /* ok */ }
          }
          await updateRunStatus(finalRunStatus, {
            result: {
              assistantLength: finalAssistantContent.length,
              lastTool: toolResultInfo
                ? { name: toolResultInfo.name, success: toolResultInfo.success }
                : null,
              contract: contractGateResult
                ? {
                    canClaimSuccess: contractGateResult.canClaimSuccess,
                    completedCriteria: contractGateResult.completedCriteria,
                    unmetCriteria: contractGateResult.unmetCriteria,
                  }
                : null,
            },
            error: contractGateFailed && contractGateResult
              ? { message: `Task contract unmet: ${contractGateResult.unmetCriteria.join(", ")}` }
              : undefined,
          });
        } else {
          await updateRunStatus("failed", {
            error: { message: "Agent loop completed without assistant output or tool result." },
          });
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const errorMsg = err instanceof Error ? err.message : "未知错误";
        console.error("Stream error:", errorMsg);
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
            copy[copy.length - 1] = { ...last, content: `⚠️ 连接中断：${errorMsg}` };
          } else if (!last || last.role !== "assistant") {
            copy.push({ role: "assistant", content: `⚠️ 连接中断：${errorMsg}`, timestamp: new Date().toISOString() });
          }
          return copy;
        });
      } finally {
        if (!workerOwnedRun) {
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

  const handleStopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setPhase(null);
    setExecutingTool(undefined);
    setThinkingContent("");
    setActiveAgent(null);
  }, []);

  const handleNewSession = useCallback(async () => {
    // Save current session before switching
    if (currentSessionId) {
      const currentSession = await getSession(currentSessionId);
      if (currentSession) {
        await updateSession(currentSessionId, { messages });
      }
    }
    // Trigger profile update before switching
    triggerProfileUpdate({ force: true }).catch(() => {});

    // Abort any streaming
    abortRef.current?.abort();
    setStreaming(false);
    setPhase(null);
    setActiveAgent(null);

    const id = await createSession([WELCOME]);
    manualSessionSwitchRef.current = id;
    replaceUrlForSelectedSession(id);
    setCurrentSessionId(id);
    setMessages([WELCOME]);
    setStreamText("");
    setThinkingContent("");
    streamContentRef.current = "";
    setSessions(await listSessions());
  }, [currentSessionId, messages, replaceUrlForSelectedSession]);

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
    // Save current session
    if (currentSessionId) {
      const currentSession = await getSession(currentSessionId);
      if (currentSession) {
        await updateSession(currentSessionId, { messages });
      }
    }
    // Trigger profile update before switching
    triggerProfileUpdate({ force: true }).catch(() => {});

    // Abort streaming
    abortRef.current?.abort();
    setStreaming(false);
    setPhase(null);
    setActiveAgent(null);

    // Load selected session
    const session = await getSession(id);
    if (session) {
      manualSessionSwitchRef.current = id;
      replaceUrlForSelectedSession(id);
      setCurrentSessionId(id);
      setMessages(session.messages);
      setStreamText("");
      setThinkingContent("");
      streamContentRef.current = "";
    }
  }, [currentSessionId, messages, replaceUrlForSelectedSession]);

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
        manualSessionSwitchRef.current = nextId;
        replaceUrlForSelectedSession(nextId);
        setCurrentSessionId(nextId);
        setMessages(remaining[0].messages);
      } else {
        const newId = await createSession([WELCOME]);
        manualSessionSwitchRef.current = newId;
        replaceUrlForSelectedSession(newId);
        setCurrentSessionId(newId);
        setMessages([WELCOME]);
      }
    }
    setSessions(await listSessions());
  }, [currentSessionId, replaceUrlForSelectedSession]);

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
        setMessages(session.messages);
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
    <div className="flex h-[calc(100vh-(var(--space-section)*2))] min-h-[560px] max-h-[calc(100vh-(var(--space-section)*2))] w-full min-w-0 max-w-full flex-1 gap-0 overflow-hidden">
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
              disabled={streaming}
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

        {/* AgentChat */}
        <AgentChat
          currentSessionId={currentSessionId}
          messages={messages}
          streaming={streaming}
          streamText={streamText}
          phase={phase}
          executingTool={executingTool}
          thinkingContent={thinkingContent}
          activeAgentId={activeAgent?.id}
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

