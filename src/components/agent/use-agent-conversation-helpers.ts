"use client";

/**
 * Agent Conversation 门面的模块级纯函数/常量/类型(spec 35 第一片抽出)。
 * 全部无 React 依赖;生命周期与 sendMessage 因 0.12 源码契约测试的路径锁定留在门面。
 */
import type { AgentMessage } from "@/types";
import type { AgentRunSnapshot } from "@/lib/agent/runtime/durable-agent-run";
import { DurableRunRequestError, DurableRunOwnershipUnknownError } from "@/lib/agent/runtime/durable-run-client";
import type { AgentArtifactRef } from "@/lib/agent/task-journey";
import type { VerifiedActionResult } from "@/lib/agent/verified-action";
import type { GuidedSessionState } from "@/lib/agent/guided-session-state";
import type { CareerPositioningArtifact } from "@/lib/agent/career-positioning-result";
import type { InterviewMaterialRecord } from "@/lib/agent/interview-rebind-policy";

/* ── Agent phase ── */

export type AgentPhase = "understanding" | "executing" | "verifying" | "reflecting" | "responding" | "done" | "compressing_context" | "extracting_ocr" | "extracting_jd" | "jd_extracted" | "detecting_archetype" | "archetype_detected" | null;

export const CONTEXT_COMPRESSION_STATUS_MS = 120;
export const LEDGER_TEXT_LIMIT = 240;
export const IMAGE_INTAKE_TIMEOUT_MS = 180_000;

export type SendMessageOptions = {
  hideUserMessage?: boolean;
  forcedAgentId?: string;
};

export type SavedJDForEvaluation = {
  id?: number;
  company?: string;
  role?: string;
  sourceUrl?: string;
  body?: string;
};

export function buildSavedJDEvaluationPrompt(jdId: string, jd: SavedJDForEvaluation): string {
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

export type ActiveRunNotice = {
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

export const NON_TERMINAL_DURABLE_RUN_STATUSES = new Set([
  "queued",
  "running",
  "waiting_user",
  "recovering",
  "verifying",
  "cancel_requested",
  "paused",
]);
export const TERMINAL_DURABLE_RUN_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

export const HANDOFF_CONSUMED_STORAGE_KEY = "agent:consumed-handoffs:v1";

export function readConsumedHandoffKeys(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(HANDOFF_CONSUMED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

export function hasConsumedHandoff(key: string): boolean {
  return readConsumedHandoffKeys().has(key);
}

export function markHandoffConsumed(key: string): void {
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

export type LastToolResultInfo = {
  name: string;
  result: string;
  success: boolean;
  data?: unknown;
  uiPayload?: Record<string, unknown>;
  verifiedAction?: VerifiedActionResult;
};

export function waitForStatusPaint(ms = CONTEXT_COMPRESSION_STATUS_MS): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function truncateLedgerText(value: unknown, max = LEDGER_TEXT_LIMIT): string {
  if (value === undefined || value === null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const clean = text.replace(/data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+/g, "[image]").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}...`;
}

export function summarizeLedgerParams(params: Record<string, unknown> | undefined): string {
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

export async function persistCareerPositioningArtifact(
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


export function activeNoticeFromRun(run: AgentRunSnapshot): ActiveRunNotice {
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


export async function extractReadOnlyPdfContext(attachments: string[]): Promise<{
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

export function userFacingAgentRunError(error: unknown): string {
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


export function triggerSessionAnomalyReview(input: {
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


export async function loadInterviewMaterialRecords(): Promise<InterviewMaterialRecord[]> {
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

export const WELCOME: AgentMessage = {
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


