"use client";

/**
 * 领域卡片库(0.11.0-D2 从旧 AgentChat.tsx 原样迁出)。
 *
 * 消息流渲染由 assistant-ui 承担后,这些卡片按 surface-projection 的安全
 * 投影类型在 ToolUI 注册表中挂载;组件逻辑与样式保持不变。
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, BookOpen, Check, CheckCircle, Download, ExternalLink, Image as ImageIcon, X, ChevronDown, ChevronUp, FileText, Loader2, MapPin, Maximize2, RefreshCw, ShieldCheck, Sparkles, Target, Briefcase, Trash2, User } from "lucide-react";
import { WarmButton, ScoreBadge } from "@/components/design";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { getToolDisplay } from "@/lib/agent/tool-display-names";
import { getAgentDisplayName } from "@/lib/agent/client-metadata";
import { fetchDiscoveryJobDetail, getAgentEvaluationUrl, saveDiscoveryJobJD } from "@/lib/job-discovery";
import type { AgentMessage, CoachMode, InterviewQuestion, InterviewSessionState } from "@/types";
import { createJD } from "@/lib/jd-storage";
import { projectToolResultForUser } from "@/lib/agent/surface-projection";
import type { AgentArtifactRef } from "@/lib/agent/task-journey";
import { buildOfferAgentHandoffUrl } from "@/lib/agent/offer-handoff";
import { countAnsweredInterviewRounds } from "@/lib/agent/interview-session-state";

export interface EvalBlockProgress {
  block: string;
  label: string;
  status: "running" | "done";
  score?: number;
}

export interface CompletionInfo {
  reportNum: number;
  company: string;
  role: string;
  score: number;
}

export const COMPACT_AGENT_CARD_CLASS = "w-fit max-w-[min(560px,78%)] min-w-0";

export interface ImageMeta {
  name?: string;
  size?: number;
  width?: number;
  height?: number;
  type?: string;
}

export function estimateDataUrlBytes(src: string): number | undefined {
  const comma = src.indexOf(",");
  if (comma < 0) return undefined;
  const base64 = src.slice(comma + 1).replace(/\s+/g, "");
  if (!base64) return undefined;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function statusLabel(status?: string): string {
  if (status === "completed") return "已完成";
  if (status === "paused") return "已暂停";
  if (status === "abandoned") return "已中止";
  return "进行中";
}

export function InterviewBindingBar({ state }: { state?: InterviewSessionState }) {
  const plan = state?.planSnapshot;
  if (!plan) return null;
  const answered = countAnsweredInterviewRounds(state);
  const currentQuestion = state.currentQuestionId
    ? state.questionGraph.find((node) => node.id === state.currentQuestionId)
    : state.questionGraph.at(-1);

  return (
    <div className="mb-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-[var(--color-muted)] flex-wrap">
        <span className="inline-flex items-center gap-1 text-[var(--color-primary)] font-medium">
          <Target size={12} />
          当前面试绑定
        </span>
        <span className="inline-flex items-center gap-1 text-[var(--color-text-soft)]">
          <Briefcase size={12} />
          {plan.jdSnapshot?.company || "未知公司"} · {plan.jdSnapshot?.role || "目标岗位"}
        </span>
        <span className="inline-flex items-center gap-1 text-[var(--color-text-soft)]">
          <User size={12} />
          {plan.resumeSnapshot?.title || "未绑定简历"}
        </span>
        <span>{plan.mode} · {plan.difficulty}</span>
        <span>{statusLabel(state.status)} · 已答 {answered} 轮</span>
        {currentQuestion && (
          <span className="truncate max-w-[360px]">
            当前题：{currentQuestion.kind} · {currentQuestion.question}
          </span>
        )}
      </div>
    </div>
  );
}

export function formatBytes(size?: number): string {
  if (!size || size <= 0) return "";
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

export function formatImageMeta(meta?: ImageMeta): string {
  const parts: string[] = [];
  if (meta?.width && meta?.height) parts.push(`${meta.width}x${meta.height}`);
  const size = formatBytes(meta?.size);
  if (size) parts.push(size);
  return parts.join(" / ");
}

export function loadImageMeta(src: string): Promise<Pick<ImageMeta, "width" | "height">> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
}

export function ImagePreviewModal({
  src,
  name,
  meta,
  onClose,
}: {
  src: string;
  name?: string;
  meta?: ImageMeta;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white transition-colors hover:bg-white/25"
        aria-label="关闭原图预览"
      >
        <X size={18} />
      </button>
      <div className="flex max-h-full max-w-full flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt={name || "上传图片原图"}
          className="max-h-[82vh] max-w-[92vw] rounded-[var(--radius-md)] bg-white object-contain shadow-2xl"
        />
        {(name || formatImageMeta(meta)) && (
          <div className="rounded-full bg-black/65 px-3 py-1 text-xs text-white">
            {[name, formatImageMeta(meta)].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}

export function OpenableImage({
  src,
  alt,
  className,
  name,
  meta,
}: {
  src: string;
  alt: string;
  className: string;
  name?: string;
  meta?: ImageMeta;
}) {
  const [open, setOpen] = useState(false);
  const [computedMeta, setComputedMeta] = useState<ImageMeta | undefined>(meta);
  const displayMeta = { ...computedMeta, ...meta, size: meta?.size ?? computedMeta?.size ?? estimateDataUrlBytes(src) };
  const metaText = formatImageMeta(displayMeta);

  useEffect(() => {
    if (!src.startsWith("data:image/") && !src.startsWith("blob:")) return;
    if (meta?.width && meta?.height) return;
    let cancelled = false;
    setComputedMeta(meta);
    loadImageMeta(src)
      .then((dims) => {
        if (!cancelled) setComputedMeta((prev) => ({ ...prev, ...dims }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [src, meta?.width, meta?.height]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block overflow-hidden rounded-[var(--radius-md)] text-left"
        title="查看原图"
      >
        <img src={src} alt={alt} className={className} />
        <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-black/45 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <Maximize2 size={12} />
        </span>
        {metaText && (
          <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] leading-none text-white">
            {metaText}
          </span>
        )}
      </button>
      {open && (
        <ImagePreviewModal
          src={src}
          name={name}
          meta={displayMeta}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/* ── Tool Result Card ── */

export function ToolResultCard({
  toolName,
  toolResult,
  success,
  downloadUrl,
  downloadLabel,
}: {
  toolName: string;
  toolResult: string;
  success: boolean;
  downloadUrl?: string | null;
  downloadLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const maxPreviewLines = 6;

  // Don't render card for empty/trivial results
  const trimmed = (toolResult || "").trim();
  if (!trimmed || trimmed === "未找到相关结果" || trimmed === "搜索失败: 未找到相关结果") {
    return null;
  }

  const lines = trimmed.split("\n");
  const needsExpansion = lines.length > maxPreviewLines;
  const display = getToolDisplay(toolName);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`rounded-[var(--radius-md)] border-l-3 overflow-hidden ${
        success
          ? "border-l-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/10"
          : "border-l-red-400 bg-red-50/30 dark:bg-red-950/10"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-divider)] cursor-default">
        {success ? (
          <Check size={14} className="text-emerald-500 flex-shrink-0" />
        ) : (
          <X size={14} className="text-red-500 flex-shrink-0" />
        )}
        <span className="text-xs font-medium text-[var(--color-text)]">{display.label}</span>
        <span className={`text-xs ml-auto ${success ? "text-emerald-500" : "text-red-500"}`}>
          {success ? "完成" : "失败"}
        </span>
      </div>

      {/* Content */}
      <div className="px-3 py-2">
        <div className={`text-sm whitespace-pre-wrap break-words cursor-default ${needsExpansion && !expanded ? "line-clamp-6" : ""}`}>
          {trimmed}
        </div>

        {needsExpansion && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 mt-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            {expanded ? (
              <><ChevronUp size={12} /> 收起</>
            ) : (
              <><ChevronDown size={12} /> 展开 ({lines.length} 行)</>
            )}
          </button>
        )}

        {downloadUrl && (
          <a
            href={downloadUrl}
            download
            className="inline-flex items-center gap-1.5 mt-2 text-xs px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity no-underline"
          >
            📥 {downloadLabel || "下载文件"}
          </a>
        )}
      </div>
    </motion.div>
  );
}

export function textValue(value: unknown): string {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

export function RunGateCard({
  payload,
  onDecision,
}: {
  payload: Record<string, unknown>;
  onDecision?: (gateId: string, decision: "approved" | "denied") => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState<"approved" | "denied" | null>(null);
  const gateId = textValue(payload.gateId);
  const request = payload.request && typeof payload.request === "object" && !Array.isArray(payload.request)
    ? payload.request as Record<string, unknown>
    : {};
  const status = textValue(payload.status) || "pending";
  const title = textValue(request.userVisibleName) || "确认继续执行";

  const decide = async (decision: "approved" | "denied") => {
    if (!gateId || !onDecision || submitting || status !== "pending") return;
    setSubmitting(decision);
    try {
      await onDecision(gateId, decision);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className={COMPACT_AGENT_CARD_CLASS}>
      {/* 样张 v2 审批卡形态:白瓷卡 + 朱砂描边,风险说明一行,主按钮「批准并应用」 */}
      <div className="rounded-[14px] border-[1.5px] border-[var(--zhusha)] bg-[var(--color-surface)] px-4 py-4">
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck size={16} className="text-[var(--zhusha)]" />
          <span className="text-sm font-medium text-[var(--ink)]">需要你的批准 · {title}</span>
        </div>
        <p className="mb-3 text-xs leading-5 text-[var(--muted)]">
          此操作会修改已保存的数据，批准后才会继续
          {textValue(request.toolName) ? ` · 工具 ${textValue(request.toolName)}` : ""}
          {" · 可回滚"}
        </p>
        <div className="flex items-center gap-2.5">
          {status === "pending" ? (
            <>
              <button type="button" disabled={!onDecision || submitting !== null} onClick={() => void decide("approved")} className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--zhusha)] px-[18px] py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--zhusha-deep)] disabled:opacity-50">
                {submitting === "approved" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}批准并应用
              </button>
              <button type="button" disabled={!onDecision || submitting !== null} onClick={() => void decide("denied")} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--hairline)] bg-[var(--color-surface)] px-[18px] py-2 text-xs font-medium text-[var(--body)] transition-colors hover:bg-[var(--surface-soft)] disabled:opacity-50">
                {submitting === "denied" ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}拒绝
              </button>
            </>
          ) : (
            <span className="text-xs text-[var(--muted)]">{status === "approved" ? "已批准，正在继续" : "已拒绝"}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ResumeDocumentCard({ payload }: { payload: Record<string, unknown> }) {
  const [sections, setSections] = useState<Array<{ id: string; title: string; content: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sectionFilter = textValue(payload.section);
  const requestedVersion = textValue(payload.versionId || payload.activeVersion);
  const documentStatus = textValue(payload.status);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/cv/data", { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) throw new Error(json.error || "简历读取失败");
        const cvData = json.data || {};
        const activeVersion = requestedVersion || cvData.activeVersion;
        const activeSections = cvData.versions?.[activeVersion]?.sections;
        if (!Array.isArray(activeSections)) throw new Error("当前简历没有可查看的内容");
        const normalized = activeSections
          .filter((section: unknown): section is Record<string, unknown> => Boolean(section && typeof section === "object"))
          .map((section: Record<string, unknown>) => ({
            id: textValue(section.id),
            title: textValue(section.title || section.id),
            content: textValue(section.content),
          }))
          .filter((section: { id: string; title: string; content: string }) => !sectionFilter || section.id === sectionFilter || section.title.includes(sectionFilter));
        if (!cancelled) setSections(normalized);
      })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "简历读取失败"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sectionFilter, requestedVersion]);

  return (
    <div className={COMPACT_AGENT_CARD_CLASS}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-2 border-b border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2">
          <FileText size={14} className="text-[var(--color-primary)]" />
          <span className="text-xs font-medium text-[var(--color-text)]">{documentStatus === "pending" ? "待确认导入版本" : "我的完整简历"}</span>
          <span className="text-[11px] text-[var(--color-muted)]">{Number(payload.totalChars || 0).toLocaleString()} 字</span>
          <a href="/cv" className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline">打开简历页 <ExternalLink size={12} /></a>
        </div>
        {documentStatus === "pending" && (
          <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            内容已完整保存为云端版本，但识别完整性需要你确认；当前简历尚未被覆盖。请查看全文后到简历页确认启用。
          </div>
        )}
        <div className="max-h-[36rem] space-y-3 overflow-y-auto p-3">
          {loading && <div className="flex items-center gap-2 py-4 text-xs text-[var(--color-muted)]"><Loader2 size={14} className="animate-spin" />读取云端简历…</div>}
          {error && <div className="rounded-[var(--radius-sm)] bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
          {!loading && !error && sections.map((section) => (
            <section key={section.id} className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold text-[var(--color-text)]">{section.title}</h4>
                <span className="text-[10px] text-[var(--color-muted)]">{section.content.length.toLocaleString()} 字</span>
              </div>
              <div className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-text)]">{section.content || "（未填写）"}</div>
            </section>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export function ResumeDraftCard({ payload, onSend }: { payload: Record<string, unknown>; onSend: (content: string) => Promise<void> }) {
  const artifactId = textValue(payload.artifactId);
  const [drafts, setDrafts] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!artifactId) { setError("草稿标识缺失"); setLoading(false); return; }
    fetch(`/api/cv/drafts?artifactId=${encodeURIComponent(artifactId)}`, { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) throw new Error(json.error || "草稿读取失败");
        if (!cancelled) setDrafts(Array.isArray(json.data) ? json.data : []);
      })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "草稿读取失败"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [artifactId]);

  const selectDraft = async (draftId: string) => {
    if (!draftId || submitting) return;
    setSubmitting(draftId);
    try {
      await onSend(`选择并创建简历修改提案，draftId=${draftId}`);
    } finally {
      setSubmitting("");
    }
  };

  return (
    <div className={COMPACT_AGENT_CARD_CLASS}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-2 border-b border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2">
          <Sparkles size={14} className="text-[var(--color-primary)]" />
          <span className="text-xs font-medium text-[var(--color-text)]">简历优化草稿</span>
          <span className="text-[11px] text-[var(--color-muted)]">{textValue(payload.sectionId)}</span>
          {payload.readBackVerified === true && <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-600"><CheckCircle size={12} />已持久化并回读</span>}
        </div>
        <div className="space-y-3 p-3">
          {loading && <div className="flex items-center gap-2 py-4 text-xs text-[var(--color-muted)]"><Loader2 size={14} className="animate-spin" />加载完整草稿…</div>}
          {error && <div className="rounded-[var(--radius-sm)] bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
          {drafts.map((draft, index) => {
            const draftId = textValue(draft.id);
            const patches = Array.isArray(draft.patches) ? draft.patches as Array<Record<string, unknown>> : [];
            const original = textValue(patches[0]?.originalContent);
            const content = textValue(draft.content || patches[0]?.proposedContent);
            return (
              <section key={draftId || index} className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-divider)]">
                <div className="flex items-center gap-2 bg-[var(--color-bg)] px-3 py-2">
                  <span className="text-xs font-semibold text-[var(--color-text)]">{textValue(draft.label || draft.title) || `方案 ${index + 1}`}</span>
                  {textValue(draft.approach) && <span className="text-[11px] text-[var(--color-muted)]">{textValue(draft.approach)}</span>}
                  <button type="button" disabled={!draftId || Boolean(submitting)} onClick={() => selectDraft(draftId)} className="ml-auto inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                    {submitting === draftId ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}选择此方案
                  </button>
                </div>
                <div className="grid gap-0 md:grid-cols-2">
                  <div className="max-h-72 overflow-y-auto border-t border-[var(--color-divider)] p-3 md:border-r">
                    <div className="mb-1 text-[10px] font-medium text-[var(--color-muted)]">当前内容</div>
                    <div className="whitespace-pre-wrap break-words text-xs leading-5 text-[var(--color-text)]">{original || "无"}</div>
                  </div>
                  <div className="max-h-72 overflow-y-auto border-t border-[var(--color-divider)] bg-emerald-50/40 p-3">
                    <div className="mb-1 text-[10px] font-medium text-emerald-700">建议内容</div>
                    <div className="whitespace-pre-wrap break-words text-xs leading-5 text-[var(--color-text)]">{content || "无"}</div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

export function ResumeEditProposalCard({
  payload,
  success,
  onSend,
}: {
  payload: Record<string, unknown>;
  success: boolean;
  onSend: (content: string) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const proposal = typeof payload.proposal === "object" && payload.proposal !== null
    ? payload.proposal as Record<string, unknown>
    : payload;
  const type = textValue(payload.type);
  const id = textValue(proposal.id || payload.id);
  const sectionId = textValue(payload.sectionId || proposal.sectionId || payload.sectionId);
  const status = textValue(proposal.status || payload.status || (type.endsWith("applied") ? "applied" : "pending"));
  const reason = textValue(payload.reason || proposal.reason);
  const originalContent = textValue(payload.originalContent || proposal.originalContent || payload.previousContent || payload.restoredContent);
  const proposedContent = textValue(payload.proposedContent || proposal.proposedContent || payload.appliedContent || payload.replacedContent);
  const restoredContent = textValue(payload.restoredContent);
  const readBackVerified = payload.readBackVerified === true;
  const isPending = status === "pending" && type === "resume_edit_proposal";
  const isApplied = status === "applied" || type === "resume_edit_proposal_applied";
  const isDiscarded = status === "discarded" || type === "resume_edit_proposal_discarded";
  const isRolledBack = status === "rolled_back" || type === "resume_edit_proposal_rolled_back";
  const title = isRolledBack ? "简历修改已回滚" : isDiscarded ? "简历修改提案已废弃" : isApplied ? "简历修改已应用" : "简历修改提案";
  const statusLabel = isRolledBack ? "已回滚" : isDiscarded ? "已废弃" : isApplied ? "已应用" : success ? "待确认" : "失败";

  const sendAction = async (action: "apply" | "discard" | "rollback") => {
    if (!id || submitting) return;
    setSubmitting(action);
    const text = action === "apply"
      ? `应用简历修改提案 ${id}`
      : action === "discard"
        ? `废弃简历修改提案 ${id}`
        : `回滚简历修改提案 ${id}`;
    try {
      await onSend(text);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className={COMPACT_AGENT_CARD_CLASS}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)]"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2">
          {success ? <FileText size={14} className="text-[var(--color-primary)]" /> : <X size={14} className="text-red-500" />}
          <span className="text-xs font-medium text-[var(--color-text)]">{title}</span>
          {sectionId && <span className="rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] text-[var(--color-muted)]">{sectionId}</span>}
          <span className={`ml-auto text-xs ${success ? "text-emerald-600" : "text-red-500"}`}>{statusLabel}</span>
        </div>
        <div className="space-y-3 px-3 py-3">
          {id && <div className="text-[11px] text-[var(--color-muted)] break-all">提案 ID: {id}</div>}
          {reason && <div className="text-xs text-[var(--color-muted)] break-words">{reason}</div>}

          {isDiscarded ? (
            <div className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)]">
              这个提案已经废弃，CV 正文没有改动。
            </div>
          ) : isRolledBack ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="min-w-0 rounded-[var(--radius-sm)] border border-red-100 bg-red-50/60 px-3 py-2">
                <div className="mb-1 text-[11px] font-medium text-red-700">已撤销内容</div>
                <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-xs text-[var(--color-text)]">{proposedContent || "无"}</div>
              </div>
              <div className="min-w-0 rounded-[var(--radius-sm)] border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                <div className="mb-1 text-[11px] font-medium text-emerald-700">已恢复内容</div>
                <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-xs text-[var(--color-text)]">{restoredContent || originalContent || "无"}</div>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="min-w-0 rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2">
                <div className="mb-1 text-[11px] font-medium text-[var(--color-muted)]">当前内容</div>
                <div className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-xs text-[var(--color-text)]">{originalContent || "无"}</div>
              </div>
              <div className="min-w-0 rounded-[var(--radius-sm)] border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                <div className="mb-1 text-[11px] font-medium text-emerald-700">建议修改</div>
                <div className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-xs text-[var(--color-text)]">{proposedContent || "无"}</div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {readBackVerified && <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600"><CheckCircle size={12} />已回读校验</span>}
            {isPending && (
              <>
                <button
                  type="button"
                  disabled={!id || submitting !== null}
                  onClick={() => sendAction("apply")}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {submitting === "apply" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  应用
                </button>
                <button
                  type="button"
                  disabled={!id || submitting !== null}
                  onClick={() => sendAction("discard")}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-divider)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-50"
                >
                  {submitting === "discard" ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  废弃
                </button>
              </>
            )}
            {isApplied && (
              <button
                type="button"
                disabled={!id || submitting !== null}
                onClick={() => sendAction("rollback")}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-divider)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-50"
              >
                {submitting === "rollback" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                回滚
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export const INTERVIEW_CATEGORY_LABEL: Record<string, string> = {
  behavioral: "行为面试",
  technical: "技术专业",
  "case-study": "场景题",
  culture: "文化匹配",
};

export const INTERVIEW_MODE_LABEL: Record<string, string> = {
  "project-review": "项目复盘",
  behavioral: "行为问答",
  scenario: "情景应对",
  "structured-sme": "结构化面试",
  founder: "创始人对话",
  stability: "稳重应答",
};

export function InterviewQuestionCard({ payload }: { payload: Record<string, unknown> }) {
  const questions = Array.isArray(payload.questions)
    ? (payload.questions as InterviewQuestion[])
    : [];
  const q = questions[0];
  if (!q?.question) return null;

  const company = typeof payload.company === "string" ? payload.company : "";
  const role = typeof payload.role === "string" ? payload.role : "";
  const mode = typeof payload.mode === "string" ? payload.mode as CoachMode : undefined;
  const category = INTERVIEW_CATEGORY_LABEL[q.category] || q.category || "面试题";

  return (
    <div className={COMPACT_AGENT_CARD_CLASS}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-divider)] bg-[var(--color-bg)] px-4 py-3">
          <span className="text-xs font-semibold text-[var(--color-primary)]">模拟面试 · 第 1 题</span>
          {category && <span className="rounded-full bg-[var(--color-primary-muted)] px-2 py-0.5 text-[11px] text-[var(--color-primary)]">{category}</span>}
          {mode && <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] text-[var(--color-muted)]">{INTERVIEW_MODE_LABEL[mode] || mode}</span>}
          {(company || role) && (
            <span className="ml-auto min-w-0 truncate text-xs text-[var(--color-muted)]">
              {[company, role].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>

        <div className="space-y-3 px-4 py-3">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2">
              <div className="text-[11px] font-medium text-[var(--color-muted)]">考察点</div>
              <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-soft)]">{q.context || "考察你把经历迁移到目标岗位问题中的能力。"}</p>
            </div>
            <div className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2">
              <div className="text-[11px] font-medium text-[var(--color-muted)]">准备方向</div>
              <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-soft)]">{q.storyHint || "建议用 STAR 结构回答，并补充量化结果与复盘。"}</p>
            </div>
          </div>

          {q.weaknessNote && (
            <div className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-800">
              {q.weaknessNote}
            </div>
          )}

          <div>
            <div className="mb-1 text-[11px] font-medium text-[var(--color-muted)]">问题</div>
            <div className="rounded-[var(--radius-sm)] bg-[var(--color-primary-muted)] px-3 py-3 text-base font-medium leading-relaxed text-[var(--color-text)]">
              {q.question}
            </div>
          </div>

          <p className="text-xs text-[var(--color-muted)]">请直接回答这一题。回答后我会按结构、具体性、亮点和时间控制给你反馈。</p>
        </div>
      </motion.div>
    </div>
  );
}


/* ── Report message styling ── */

export function isReportMessage(content: string): boolean {
  return content.includes("## A") && (content.includes("职位概览") || content.includes("简历匹配"));
}

export function ReportMessage({ content }: { content: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] px-3 py-2 text-sm leading-relaxed">
      <MarkdownRenderer content={content} />
    </div>
  );
}

export function ReportSummaryCard({ payload, content }: { payload?: Record<string, unknown>; content: string }) {
  const reportNum = payload?.reportNum as number | undefined;
  const company = (payload?.company as string | undefined) || "未知公司";
  const role = (payload?.role as string | undefined) || "未知岗位";
  const score = payload?.overallScore as number | undefined;
  const archetype = payload?.archetype as string | undefined;
  return (
    <div className={COMPACT_AGENT_CARD_CLASS}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] overflow-hidden"
      >
        <div className="flex items-start gap-3 px-4 py-3">
          <FileText size={18} className="mt-0.5 text-[var(--color-primary)] flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[var(--color-text)] truncate">
              报告 #{reportNum || "-"} · {company} — {role}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
              {typeof score === "number" && <span>{score}/5</span>}
              {archetype && <span>{archetype}</span>}
              <span>完整正文已放在报告详情页</span>
            </div>
            {!payload && content && (
              <div className="mt-2 text-xs text-[var(--color-muted)] line-clamp-2">{content.slice(0, 140)}</div>
            )}
          </div>
          {reportNum && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <a
                href={`/evaluate/reports?report=${reportNum}`}
                className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
              >
                <BookOpen size={13} />
                打开
              </a>
              <a
                href={`/api/reports/${reportNum}/pdf`}
                className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-2.5 py-1.5 text-xs text-white hover:opacity-90"
              >
                <FileText size={13} />
                PDF
              </a>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export function offerVerdictLabel(verdict: string): string {
  if (verdict === "accept") return "建议接受";
  if (verdict === "accept_after_negotiation") return "谈判后接受";
  if (verdict === "decline") return "建议拒绝";
  return "谨慎推进";
}

export function OfferResultCard({
  payload,
  success,
  currentSessionId,
}: {
  payload: Record<string, unknown>;
  success: boolean;
  currentSessionId: number | null;
}) {
  const reportId = Number(payload.reportId || payload.reportNum || 0);
  const offerId = Number(payload.offerId || 0);
  const company = textValue(payload.company) || "未知公司";
  const role = textValue(payload.role) || "未知岗位";
  const score = Number(payload.overallScore || 0);
  const verdict = textValue(payload.verdict);
  const type = textValue(payload.type);
  const isReadBackVerified = payload.readBackVerified === true;
  const redFlags = Array.isArray(payload.redFlags) ? payload.redFlags.map(textValue).filter(Boolean).slice(0, 3) : [];
  const missingInfo = Array.isArray(payload.missingInfo) ? payload.missingInfo.map(textValue).filter(Boolean).slice(0, 3) : [];
  const cardTitle = type === "offer_report" ? "Offer 报告已读取" : "Offer 评估完成";

  return (
    <div className={COMPACT_AGENT_CARD_CLASS}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)]"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-divider)] bg-[var(--color-bg)] px-4 py-3">
          {success ? <CheckCircle size={16} className="text-emerald-500" /> : <X size={16} className="text-red-500" />}
          <span className="text-sm font-medium text-[var(--color-text)]">{cardTitle}</span>
          {reportId > 0 && <span className="rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px] text-[var(--color-muted)]">报告 #{reportId}</span>}
          {offerId > 0 && <span className="rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px] text-[var(--color-muted)]">Offer #{offerId}</span>}
          <span className={`ml-auto text-xs ${success ? "text-emerald-600" : "text-red-500"}`}>{success ? "完成" : "失败"}</span>
        </div>

        <div className="space-y-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 break-words text-sm font-medium text-[var(--color-text)]">{company} — {role}</span>
            {score > 0 && <ScoreBadge score={score} size="sm" />}
            {verdict && <span className="rounded-[var(--radius-sm)] bg-[var(--color-primary-muted)] px-2 py-0.5 text-xs text-[var(--color-primary)]">{offerVerdictLabel(verdict)}</span>}
          </div>

          {(redFlags.length > 0 || missingInfo.length > 0 || isReadBackVerified) && (
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2">
                <div className="mb-1 text-[11px] font-medium text-[var(--color-muted)]">主要风险</div>
                <div className="space-y-1 text-xs text-[var(--color-text-soft)]">
                  {redFlags.length ? redFlags.map((item, index) => <div key={`offer-red-${index}`} className="break-words">- {item}</div>) : <div>暂无明显风险</div>}
                </div>
              </div>
              <div className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2">
                <div className="mb-1 text-[11px] font-medium text-[var(--color-muted)]">待确认信息</div>
                <div className="space-y-1 text-xs text-[var(--color-text-soft)]">
                  {missingInfo.length ? missingInfo.map((item, index) => <div key={`offer-missing-${index}`} className="break-words">- {item}</div>) : <div>{isReadBackVerified ? "报告已保存并校验" : "暂无补充项"}</div>}
                </div>
              </div>
            </div>
          )}

          {reportId > 0 && currentSessionId && (
            <div className="flex flex-wrap gap-2">
              <a
                href={buildOfferAgentHandoffUrl(reportId, "explain", currentSessionId)}
                className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
              >
                <BookOpen size={13} />
                <span>解释报告</span>
              </a>
              <a
                href={buildOfferAgentHandoffUrl(reportId, "negotiate", currentSessionId)}
                className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-primary-muted)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:opacity-90"
              >
                <FileText size={13} />
                <span>谈判策略</span>
              </a>
              <a
                href={buildOfferAgentHandoffUrl(reportId, "ask_hr", currentSessionId)}
                className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                <User size={13} />
                <span>HR 问询</span>
              </a>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export const ASSISTANT_PROCESS_PATTERNS = [
  /(^|\n)\s*好的[，,。]?\s*(?:我先|先|我会先|这就|现在先)[^。！？\n]*(?:[。！？]|\n)/g,
  /(^|\n)\s*好的[，,。]?\s*(?:你的简历刚才被截断|简历被截断)[^。！？\n]*(?:[。！？]|\n)/g,
  /(^|\n)\s*好的[，,。]?\s*(?:我读了|我已经读了|简历和\s*JD\s*都已加载|JD\s*和你的简历)[^。！？\n]*(?:[。！？]|\n)/g,
  /(^|\n)\s*(?:让我出一道贴合\s*JD\s*的题|我来出第一题|下面开始模拟面试)[：:。]?\s*/g,
];

export const ASSISTANT_LABELS = new Set([
  "结论",
  "重点",
  "建议",
  "下一步",
  "风险",
  "主要风险",
  "原因",
  "问题",
  "题型",
  "考察点",
  "JD 关联",
  "JD关联",
  "简历关联",
  "准备方向",
  "回答建议",
  "示例回答",
  "改进建议",
  "匹配点",
  "差距",
]);

export function normalizeAssistantMarkdown(content: string): string {
  let cleaned = (content || "").trim();
  for (const pattern of ASSISTANT_PROCESS_PATTERNS) {
    cleaned = cleaned.replace(pattern, "$1");
  }

  cleaned = cleaned
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s*---\s*\n+/, "")
    .trim();

  if (!cleaned) return (content || "").trim();

  return cleaned
    .split("\n")
    .map((line) => {
      const match = line.match(/^(\s*)([\u4e00-\u9fa5A-Za-z0-9 ]{2,14})([：:])\s*(.+)$/);
      if (!match) return line;
      const [, indent, label, colon, rest] = match;
      const normalizedLabel = label.trim();
      if (!ASSISTANT_LABELS.has(normalizedLabel)) return line;
      return `${indent}**${normalizedLabel}**${colon} ${rest.trim()}`;
    })
    .join("\n");
}

export function AgentResponseRenderer({ content }: { content: string }) {
  const normalized = normalizeAssistantMarkdown(content);

  return (
    <MarkdownRenderer
      content={normalized}
      className="text-sm leading-relaxed cursor-default [&_h2]:font-[family-name:var(--font-display)] [&_h3]:text-[var(--color-text)]"
    />
  );
}

/* ── Eval Completion Notice ── */

export function AgentHandoffBanner({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 my-1 rounded-xl text-xs border border-dashed"
      style={{ background: "var(--surface-soft)", borderColor: "var(--hairline)", color: "var(--muted)" }}>
      <ArrowLeftRight size={14} className="shrink-0" />
      <span>
        主责交接 → <b style={{ color: "var(--ink)" }}>{String(payload.agentName || payload.agentId || "")}</b>
        {payload.reason ? <span className="ml-1">· {String(payload.reason)}</span> : null}
      </span>
    </div>
  );
}

export function AgentDelegationCard({ payload }: { payload: Record<string, unknown> }) {
  const state = String(payload.state || (payload.findings ? "completed" : "running"));
  const running = state === "running";
  const agentName = getAgentDisplayName(String(payload.agentId || "general"));
  return (
    <div className="card px-4 py-3 my-1 text-sm">
      <div className="flex items-center gap-2 mb-1">
        {running ? (
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--zhusha)" }} />
        ) : (
          <span className="rounded-md px-2 py-0.5 text-xs" style={{ background: "var(--surface-soft)", color: "var(--muted)" }}>
            {state === "failed" ? "委派失败" : "委派完成"}
          </span>
        )}
        <span style={{ color: "var(--ink)" }}>
          {running ? "正在让 " : ""}
          <b>{agentName}</b>
          {running ? ` ${String(payload.goal || "")}` : " 已回传"}
          {!running && payload.goal ? <span> · {String(payload.goal)}</span> : null}
        </span>
        <span className="ml-auto rounded-full px-2 py-0.5 text-xs" style={{ background: "var(--surface-soft)", color: "var(--muted)" }}>
          只读委派
        </span>
      </div>
      {!running && payload.findings ? (
        <div className="text-xs mt-1" style={{ color: "var(--body)" }}>{String(payload.findings)}</div>
      ) : running ? (
        <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>结论将回到本对话 · 不写入任何数据</div>
      ) : null}
    </div>
  );
}

export function EvalCompletionNotice({ info }: { info: CompletionInfo }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex justify-start"
    >
      <div className={`${COMPACT_AGENT_CARD_CLASS} rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3`}>
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
          <span className="font-medium text-[var(--color-text)]">
            评估完成 · {info.company} — {info.role}
          </span>
          {info.score > 0 && <ScoreBadge score={info.score} size="sm" />}
        </div>
        <p className="text-xs text-[var(--color-muted)] mt-1.5">
          报告已自动保存 #{String(info.reportNum).padStart(3, "0")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="/evaluate/reports"
            className="inline-flex items-center rounded-[var(--radius-sm)] bg-[var(--color-primary-muted)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:opacity-90"
          >
            打开报告详情
          </a>
          <a
            href={`/api/reports/${info.reportNum}/pdf`}
            download
            className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            <Download size={12} />
            下载 PDF
          </a>
        </div>
      </div>
    </motion.div>
  );
}

/* ── HITL Eval Confirm Card ── */

export function EvalConfirmCard({ msg }: { msg: AgentMessage }) {
  const [jdSaved, setJdSaved] = useState(false);
  const [reportSaved, setReportSaved] = useState(false);
  const [discarded, setDiscarded] = useState(false);

  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(msg.content || "{}");
  } catch { /* ignore */ }

  const company = (data.company as string) || "未知";
  const role = (data.role as string) || "未知";
  const score = (data.overallScore as number) || 0;
  const archetype = (data.archetype as string) || "";
  const jdText = (data.jdText as string) || "";
  const blocks = (data.blocks as Record<string, { content: string; score: number }>) || {};

  if (discarded) {
    return (
      <div className={COMPACT_AGENT_CARD_CLASS}>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-4 py-3">
          <p className="text-xs text-[var(--color-muted)]">已放弃保存。评估结果仅在本次对话中可见。</p>
        </div>
      </div>
    );
  }

  if (jdSaved && reportSaved) {
    return (
      <div className={COMPACT_AGENT_CARD_CLASS}>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Check size={16} className="text-emerald-500" />
            <span>{company} — {role}</span>
            {score > 0 && <ScoreBadge score={score} size="sm" />}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--color-muted)]">
            {jdSaved && <span><Check size={12} className="text-emerald-500 inline" /> JD 已保存到 JD 库</span>}
            {reportSaved && <span><Check size={12} className="text-emerald-500 inline" /> 报告已保存到报告库</span>}
            {discarded && <span>已放弃保存</span>}
          </div>
        </div>
      </div>
    );
  }

  const handleSaveJD = async () => {
    try {
      await createJD({ company, role, sourceType: "agent", body: jdText, keywords: [] });
      setJdSaved(true);
    } catch { /* ignore */ }
  };

  const handleSaveReport = async () => {
    try {
      const res = await fetch("/api/report/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          role,
          overallScore: score,
          archetype,
          legitimacy: "",
          blocks,
          jdText,
          keywords: [],
          actions: { saveJD: false, addToTracker: false },
        }),
      });
      if (res.ok) setReportSaved(true);
    } catch { /* ignore */ }
  };

  return (
    <div className={COMPACT_AGENT_CARD_CLASS}>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-medium text-sm text-[var(--color-text)]">{company} — {role}</span>
          {score > 0 && <ScoreBadge score={score} size="sm" />}
        </div>
        {score < 3.5 && score > 0 && (
          <p className="text-xs text-[var(--color-muted)] mb-2">该岗位匹配度偏低，建议谨慎考虑</p>
        )}
        <div className="flex items-center gap-2">
          {jdSaved ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-500 px-3 py-1.5"><Check size={14} /> JD 已保存</span>
          ) : (
            <WarmButton variant="primary" size="sm" onClick={handleSaveJD}>
              <FileText size={14} className="mr-1" /> 保存到 JD 库
            </WarmButton>
          )}
          {reportSaved ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-500 px-3 py-1.5"><Check size={14} /> 报告已保存</span>
          ) : (
            <WarmButton variant="primary" size="sm" onClick={handleSaveReport}>
              <BookOpen size={14} className="mr-1" /> 保存到报告库
            </WarmButton>
          )}
          {!jdSaved && !reportSaved && !discarded && (
            <WarmButton variant="ghost" size="sm" onClick={() => setDiscarded(true)}>
              <Trash2 size={14} className="mr-1" /> 放弃
            </WarmButton>
          )}
        </div>
      </div>
    </div>
  );
}

export function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function JobDiscoveryConfirmationCard({
  payload,
  onSend,
}: {
  payload: Record<string, unknown>;
  onSend: (content: string) => Promise<void>;
}) {
  const criteria = payloadRecord(payload.criteria);
  const keywords = Array.isArray(criteria.titlePositive) ? criteria.titlePositive.map(textValue).filter(Boolean) : [];
  const excludes = Array.isArray(criteria.titleNegative) ? criteria.titleNegative.map(textValue).filter(Boolean) : [];
  const location = textValue(criteria.location) || "全国";
  const maxResults = numberValue(criteria.maxResults, 50);
  const profileDerived = Array.isArray(payload.profileDerived)
    ? payload.profileDerived.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    : [];

  const start = () => {
    const keywordText = keywords.length ? keywords.join("、") : textValue(criteria.query) || "岗位机会";
    return onSend(`确认开始岗位发现：岗位关键词 ${keywordText}，地点 ${location}，数量上限 ${maxResults}`);
  };

  return (
    <div className={COMPACT_AGENT_CARD_CLASS}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-2 border-b border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2">
          <Briefcase size={14} className="text-[var(--color-primary)]" />
          <span className="text-xs font-medium text-[var(--color-text)]">岗位发现确认</span>
          <span className="ml-auto text-xs text-amber-600">等待确认</span>
        </div>
        <div className="space-y-3 px-3 py-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2">
              <div className="text-[11px] text-[var(--color-muted)]">岗位关键词</div>
              <div className="mt-1 text-[var(--color-text)]">{keywords.join("、") || "待补充"}</div>
            </div>
            <div className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2">
              <div className="text-[11px] text-[var(--color-muted)]">地点 / 上限</div>
              <div className="mt-1 text-[var(--color-text)]">{location} / {maxResults}</div>
            </div>
          </div>
          {excludes.length > 0 && <div className="text-xs text-[var(--color-muted)]">排除：{excludes.join("、")}</div>}
          {profileDerived.length > 0 && (
            <div className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              这些条件来自你的求职画像：{profileDerived.map((item) => `${textValue(item.label || item.field)}${item.value ? `=${textValue(item.value)}` : ""}`).join("、")}
            </div>
          )}
          <button type="button" onClick={start}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90">
            <Check size={13} />
            开始岗位发现
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export function JobDiscoveryRunCard({
  payload,
  onSend,
}: {
  payload: Record<string, unknown>;
  onSend: (content: string) => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState<Record<string, unknown>>(payload);
  const [jobs, setJobs] = useState<Record<string, unknown>[]>([]);
  const [pollError, setPollError] = useState("");
  const scanId = textValue(snapshot.scanId);
  const status = textValue(snapshot.status) || "pending";
  const companiesDone = numberValue(snapshot.companiesDone);
  const companiesTotal = numberValue(snapshot.companiesTotal);
  const jobsFound = numberValue(snapshot.jobsFound);
  const jobsNew = numberValue(snapshot.jobsNew);
  const progress = companiesTotal > 0 ? Math.min(100, Math.round((companiesDone / companiesTotal) * 100)) : 0;
  const recovered = snapshot.recoveredExistingScan === true;
  const active = status === "pending" || status === "running";
  const finished = status === "done";

  useEffect(() => {
    setSnapshot(payload);
    setJobs([]);
    setPollError("");
  }, [payload]);

  useEffect(() => {
    if (!scanId) return;
    let canceled = false;

    const loadJobs = async () => {
      try {
        const res = await fetch(`/api/scan/jobs?scanId=${encodeURIComponent(scanId)}&status=all&limit=5`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success !== true) throw new Error(json.error || "岗位结果读取失败");
        const items = Array.isArray(json.data?.jobs)
          ? json.data.jobs.filter((item: unknown): item is Record<string, unknown> => typeof item === "object" && item !== null)
          : [];
        if (!canceled) setJobs(items);
      } catch (error) {
        if (!canceled) setPollError(error instanceof Error ? error.message : "岗位结果读取失败");
      }
    };

    const refresh = async () => {
      try {
        const res = await fetch(`/api/scan/status?scanId=${encodeURIComponent(scanId)}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success !== true) throw new Error(json.error || "岗位发现状态读取失败");
        const data = payloadRecord(json.data);
        if (canceled) return;
        setSnapshot((prev) => ({ ...prev, ...data }));
        const nextStatus = textValue(data.status);
        if (nextStatus && nextStatus !== "pending" && nextStatus !== "running") {
          if (interval) clearInterval(interval);
          if (nextStatus === "done") await loadJobs();
        }
      } catch (error) {
        if (!canceled) setPollError(error instanceof Error ? error.message : "岗位发现状态读取失败");
      }
    };

    const interval = setInterval(refresh, 3000);
    refresh();
    return () => {
      canceled = true;
      if (interval) clearInterval(interval);
    };
  }, [scanId]);

  return (
    <div className="space-y-2">
      <div className={COMPACT_AGENT_CARD_CLASS}>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)]">
          <div className="flex items-center gap-2 border-b border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2">
            <RefreshCw size={14} className={active ? "animate-spin text-[var(--color-primary)]" : finished ? "text-emerald-500" : "text-amber-500"} />
            <span className="text-xs font-medium text-[var(--color-text)]">{finished ? "岗位发现已完成" : active ? "岗位发现运行中" : "岗位发现已停止"}</span>
            <span className="ml-auto text-xs text-[var(--color-muted)]">{status}</span>
          </div>
          <div className="space-y-3 px-3 py-3 text-sm">
            <div className="flex flex-wrap gap-3 text-xs text-[var(--color-muted)]">
              <span>公司 {companiesDone}/{companiesTotal}</span>
              <span>已发现 {jobsFound}</span>
              <span>新增 {jobsNew}</span>
              {recovered && <span className="text-amber-600">已恢复进行中的任务</span>}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-divider)]">
              <div className="h-full rounded-full bg-[var(--color-primary)] transition-all" style={{ width: `${progress}%` }} />
            </div>
            {finished && jobsFound > 0 && jobs.length === 0 && !pollError && (
              <div className="text-xs text-[var(--color-muted)]">正在加载岗位卡片...</div>
            )}
            {pollError && <div className="text-xs text-amber-600">{pollError}</div>}
            <a href={scanId ? `/discover?scanId=${encodeURIComponent(scanId)}` : "/discover"}
              className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline">
              去岗位发现查看全部
              <ExternalLink size={12} />
            </a>
          </div>
        </motion.div>
      </div>
      {jobs.length > 0 && (
        <JobDiscoveryBatchCard payload={{ type: "job_discovery_batch", jobs, scanId, source: "scan_result_poll" }} onSend={onSend} />
      )}
      {finished && jobsFound === 0 && (
        <JobDiscoveryZeroResultStrategyCard snapshot={snapshot} onSend={onSend} />
      )}
    </div>
  );
}

export function JobDiscoveryZeroResultStrategyCard({
  snapshot,
  onSend,
}: {
  snapshot: Record<string, unknown>;
  onSend: (content: string) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const companies = Array.isArray(snapshot.companies)
    ? snapshot.companies.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    : [];
  const strategyIssue = companies.find((company) => (
    textValue(company.name) === "zero_result_strategy" || textValue(company.error).includes("zero_result_strategy")
  ));
  const titleFilter = payloadRecord(snapshot.titleFilter);
  const positives = Array.isArray(titleFilter.positive)
    ? titleFilter.positive.map(textValue).filter(Boolean)
    : [];
  const location = textValue(snapshot.locationFilter) || "不限城市";
  const blockedSources = companies
    .filter((company) => textValue(company.level) === "WARN" || textValue(company.status) === "error")
    .map((company) => textValue(company.name))
    .filter(Boolean);
  const sourceSummary = "公司官网、BOSS直聘、智联招聘、猎聘、前程无忧、国内搜索索引";
  const reason = textValue(strategyIssue?.error)
    .replace(/^zero_result_strategy:\s*/, "")
    || `本次已尝试 ${sourceSummary}，但没有拿到可展示岗位。`;

  const retryPrompts = [
    `把地点放宽到杭州、上海和国内远程，继续找 ${positives[0] || "AI 产品经理"} 岗位`,
    `用大模型产品经理、AIGC 产品经理、智能体产品经理、AI 应用产品经理在${location}再搜一轮`,
    `优先从 BOSS 直聘和搜索索引线索里找${location}的 AI 产品经理岗位`,
  ];

  const sendRetry = async (prompt: string) => {
    if (submitting) return;
    setSubmitting(prompt);
    try {
      await onSend(prompt);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className={COMPACT_AGENT_CARD_CLASS}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-[var(--radius-md)] border border-amber-200 bg-amber-50/60">
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-100/70 px-3 py-2">
          <Target size={14} className="text-amber-700" />
          <span className="text-xs font-medium text-amber-900">0 结果策略卡</span>
          <span className="ml-auto text-xs text-amber-700">需要放宽条件或换源重试</span>
        </div>
        <div className="space-y-3 px-3 py-3 text-sm text-amber-950">
          <div className="grid gap-2 text-xs md:grid-cols-2">
            <div className="rounded-[var(--radius-sm)] border border-amber-200 bg-white/70 px-3 py-2">
              <div className="mb-1 font-medium text-amber-900">当前条件</div>
              <div>关键词：{positives.length ? positives.join("、") : "未指定"}</div>
              <div className="inline-flex items-center gap-1"><MapPin size={12} />地点：{location}</div>
            </div>
            <div className="rounded-[var(--radius-sm)] border border-amber-200 bg-white/70 px-3 py-2">
              <div className="mb-1 font-medium text-amber-900">已尝试来源</div>
              <div>{sourceSummary}</div>
              {blockedSources.length > 0 && (
                <div className="mt-1 text-amber-700">受限来源：{blockedSources.join("、")}</div>
              )}
            </div>
          </div>
          <p className="text-xs leading-relaxed">{reason}</p>
          <div className="flex flex-col gap-2">
            {retryPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={submitting !== null}
                onClick={() => sendRetry(prompt)}
                className="inline-flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-amber-300 bg-white px-3 py-2 text-left text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-60"
              >
                <span>{prompt}</span>
                {submitting === prompt ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function JobDiscoveryCard({ job, onSend }: { job: Record<string, unknown>; onSend: (content: string) => Promise<void> }) {
  const id = textValue(job.id);
  const title = textValue(job.title) || "未知岗位";
  const company = textValue(job.company) || "未知公司";
  const location = textValue(job.location);
  const url = textValue(job.url);
  const snippet = textValue(job.jdSnippet || job.jd_snippet || job.snippet);
  const sourceName = textValue(job.sourceName || job.source_name);
  const verificationStatus = textValue(job.verificationStatus || job.verification_status);
  const matchConfidence = textValue(job.matchConfidence || job.match_confidence);
  const [open, setOpen] = useState(false);
  const [manualBody, setManualBody] = useState(snippet);
  const [detailError, setDetailError] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingAction, setSavingAction] = useState<"save" | "evaluate" | "track" | "applied" | "prepare" | null>(null);
  const [trackedApplication, setTrackedApplication] = useState<{ id: number; status?: string } | null>(null);

  const openJD = async () => {
    setOpen(true);
    if (!id) {
      setManualBody(snippet);
      setDetailError(snippet ? "" : "暂未读取到 JD 正文，可先打开原链接查看。");
      return;
    }
    setLoadingDetail(true);
    setDetailError("");
    try {
      const result = await fetchDiscoveryJobDetail({ id, company, title, url });
      if (result.detail) {
        setManualBody(result.manualBody);
      } else {
        setManualBody("");
        setDetailError(result.error);
      }
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "JD 加载失败");
    } finally {
      setLoadingDetail(false);
    }
  };

  const saveOrEvaluate = async (evaluate: boolean) => {
    if (!id || manualBody.trim().length < 50 || savingAction) return;
    setSavingAction(evaluate ? "evaluate" : "save");
    try {
      const result = await saveDiscoveryJobJD(id, {
        jdBody: manualBody.trim(),
        company,
        role: title,
        evaluate,
      });
      if (evaluate) window.location.assign(getAgentEvaluationUrl(result.jdId));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "保存 JD 失败");
    } finally {
      setSavingAction(null);
    }
  };

  const dismissJob = async () => {
    if (!id) return;
    await fetch(`/api/scan/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    }).catch(() => {});
  };

  const trackJob = async () => {
    if (savingAction) return;
    setSavingAction("track");
    setDetailError("");
    try {
      const res = await fetch("/api/data/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          role: title,
          status: "evaluated",
          sourceUrl: url,
          source: "job_discovery_card",
          notes: snippet ? snippet.slice(0, 500) : "",
          metadata: {
            scanJobId: id || undefined,
            sourceName: sourceName || undefined,
            verificationStatus: verificationStatus || undefined,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success || !json.data?.id) {
        throw new Error(json.error || "加入追踪失败");
      }
      setTrackedApplication({
        id: Number(json.data.id),
        status: textValue(json.data.status) || "evaluated",
      });
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "加入追踪失败");
    } finally {
      setSavingAction(null);
    }
  };

  const markApplied = async () => {
    if (!trackedApplication?.id || savingAction) return;
    setSavingAction("applied");
    setDetailError("");
    try {
      const res = await fetch("/api/data/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: trackedApplication.id,
          status: "applied",
          note: "来自岗位发现卡片快捷动作",
          source: "job_discovery_card",
          metadata: { scanJobId: id || undefined },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success || !json.data?.id) {
        throw new Error(json.error || "标记已投递失败");
      }
      setTrackedApplication({
        id: Number(json.data.id),
        status: textValue(json.data.status) || "applied",
      });
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "标记已投递失败");
    } finally {
      setSavingAction(null);
    }
  };

  const prepareInterview = async () => {
    if (savingAction) return;
    setSavingAction("prepare");
    try {
      await onSend(`帮我准备 ${company} - ${title} 的面试${trackedApplication?.id ? `，投递记录ID ${trackedApplication.id}` : ""}`);
    } finally {
      setSavingAction(null);
    }
  };

  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2">
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase text-[var(--color-muted)]">{company}</div>
        <div className="mt-1 line-clamp-2 text-sm font-medium text-[var(--color-text)]">{title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-muted)]">
          {location && <span className="inline-flex items-center gap-1"><MapPin size={11} />{location}</span>}
          {sourceName && <span className="rounded-full border border-sky-100 bg-sky-50 px-2 py-0.5 text-sky-700">来源：{sourceName}</span>}
          {verificationStatus === "lead" && <span className="rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-amber-700">待校验线索</span>}
          {verificationStatus === "blocked_detail" && <span className="rounded-full border border-red-100 bg-red-50 px-2 py-0.5 text-red-700">详情受阻</span>}
          {matchConfidence && matchConfidence !== "medium" && <span className="rounded-full border border-[var(--color-divider)] bg-[var(--color-surface)] px-2 py-0.5">匹配：{matchConfidence}</span>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={openJD}
          className="rounded-[var(--radius-sm)] bg-[var(--color-primary-muted)] px-2 py-1 text-xs text-[var(--color-text)]">
          打开 JD
        </button>
        {id && (
          <>
            <button type="button" onClick={() => saveOrEvaluate(false)} disabled={!open || manualBody.trim().length < 50 || savingAction !== null}
              className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] px-2 py-1 text-xs text-[var(--color-muted)] disabled:opacity-50">
              保存
            </button>
            <button type="button" onClick={trackJob} disabled={savingAction !== null}
              className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] px-2 py-1 text-xs text-[var(--color-muted)] disabled:opacity-50">
              {savingAction === "track" ? "加入中" : "加入追踪"}
            </button>
            {trackedApplication && (
              <>
                <span className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                  <Check size={12} />
                  已加入
                </span>
                <button type="button" onClick={markApplied} disabled={savingAction !== null || trackedApplication.status === "applied"}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] px-2 py-1 text-xs text-[var(--color-muted)] disabled:opacity-50">
                  {savingAction === "applied" ? "更新中" : trackedApplication.status === "applied" ? "已投递" : "标记已投递"}
                </button>
                <button type="button" onClick={prepareInterview} disabled={savingAction !== null}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] px-2 py-1 text-xs text-[var(--color-muted)] disabled:opacity-50">
                  {savingAction === "prepare" ? "发送中" : "准备面试"}
                </button>
              </>
            )}
            <button type="button" onClick={() => saveOrEvaluate(true)} disabled={!open || manualBody.trim().length < 50 || savingAction !== null}
              className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] px-2 py-1 text-xs text-[var(--color-muted)] disabled:opacity-50">
              评估
            </button>
            <button type="button" onClick={dismissJob}
              className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] px-2 py-1 text-xs text-[var(--color-muted)]">
              跳过
            </button>
          </>
        )}
        {url && <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">原链接 <ExternalLink size={11} /></a>}
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          {loadingDetail ? (
            <div className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-muted)]">
              正在读取 JD 正文...
            </div>
          ) : (
            <textarea
              value={manualBody}
              onChange={(event) => setManualBody(event.target.value)}
              className="max-h-48 min-h-24 w-full resize-y overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-text)]"
              placeholder="自动读取失败时，可把 JD 正文粘贴到这里。"
            />
          )}
          {detailError && (
            <div className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {detailError}
            </div>
          )}
          {id && (
            <div className="text-[11px] text-[var(--color-muted)]">
              点击“评估”会先保存到 JD 库，再进入 Agent 评估。
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function JobDiscoveryBatchCard({ payload, onSend }: { payload: Record<string, unknown>; onSend: (content: string) => Promise<void> }) {
  const jobs = Array.isArray(payload.jobs)
    ? payload.jobs.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    : [];
  const visible = jobs.slice(0, 5);
  const remaining = Math.max(0, jobs.length - visible.length);

  return (
    <div className={COMPACT_AGENT_CARD_CLASS}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-2 border-b border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2">
          <Briefcase size={14} className="text-[var(--color-primary)]" />
          <span className="text-xs font-medium text-[var(--color-text)]">岗位发现结果</span>
          <span className="ml-auto text-xs text-[var(--color-muted)]">显示 {visible.length}/5</span>
        </div>
        <div className="space-y-2 px-3 py-3">
          {visible.map((job, index) => <JobDiscoveryCard key={`${textValue(job.id)}-${index}`} job={job} onSend={onSend} />)}
          {remaining > 0 && (
            <a href="/discover" className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline">
              还有 {remaining} 个结果，去岗位发现查看全部
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export function JobDiscoveryErrorCard({ payload }: { payload: Record<string, unknown> }) {
  const error = textValue(payload.error) || "岗位发现暂时不可用";
  return (
    <div className={COMPACT_AGENT_CARD_CLASS}>
      <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {error}
      </div>
    </div>
  );
}

/* ── Message Bubble ── */

export function ApplicationPipelineCard({
  payload,
  success,
  onSend,
}: {
  payload: Record<string, unknown>;
  success: boolean;
  onSend: (content: string) => Promise<void>;
}) {
  const data = typeof payload.data === "object" && payload.data !== null
    ? payload.data as Record<string, unknown>
    : typeof payload.application === "object" && payload.application !== null
      ? payload.application as Record<string, unknown>
      : {};
  const candidates = Array.isArray(payload.candidates)
    ? payload.candidates.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    : [];
  const nextActions = Array.isArray(payload.nextActions)
    ? payload.nextActions.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    : [];
  const type = textValue(payload.type);
  const title = type === "application_status_updated"
    ? "Pipeline 状态已更新"
    : type === "application_context"
      ? "Pipeline 上下文"
      : "已加入求职 Pipeline";
  const status = textValue(data.status);
  const event = typeof payload.event === "object" && payload.event !== null ? payload.event as Record<string, unknown> : {};

  return (
    <div className={COMPACT_AGENT_CARD_CLASS}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className={`overflow-hidden rounded-[var(--radius-md)] border ${success ? "border-emerald-200 bg-emerald-50/30" : "border-red-200 bg-red-50/30"}`}>
        <div className="flex items-center gap-2 border-b border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2">
          {success ? <CheckCircle size={14} className="text-emerald-600" /> : <X size={14} className="text-red-500" />}
          <span className="text-xs font-medium text-[var(--color-text)]">{title}</span>
          {payload.readBackVerified === true && <span className="ml-auto text-[11px] text-emerald-600">已读回校验</span>}
        </div>
        <div className="space-y-2 px-3 py-3 text-sm">
          {candidates.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-[var(--color-muted)]">匹配到多条记录，请指定要更新哪一条：</p>
              {candidates.slice(0, 5).map((candidate, index) => (
                <button
                  key={`${textValue(candidate.id)}-${index}`}
                  type="button"
                  onClick={() => onSend(`更新投递记录ID ${textValue(candidate.id)}`)}
                  className="block w-full rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-surface)] px-3 py-2 text-left text-xs text-[var(--color-text)]"
                >
                  #{textValue(candidate.id)} {textValue(candidate.company)} - {textValue(candidate.role)} · {textValue(candidate.status)}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-[var(--color-text)]">{textValue(data.company) || "未知公司"}</span>
                <span className="text-[var(--color-muted)]">-</span>
                <span className="text-[var(--color-text-soft)]">{textValue(data.role) || "未知岗位"}</span>
                {status && <span className="rounded-full bg-[var(--color-primary-muted)] px-2 py-0.5 text-xs text-[var(--color-text-soft)]">{status}</span>}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-[var(--color-muted)]">
                {textValue(data.id) && <span>记录ID: {textValue(data.id)}</span>}
                {textValue(event.id) && <span>事件ID: {textValue(event.id)}</span>}
              </div>
              {nextActions.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {nextActions.slice(0, 4).map((action, index) => (
                    <button
                      key={`${textValue(action.id)}-${index}`}
                      type="button"
                      onClick={() => onSend(textValue(action.intent || action.label))}
                      className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
                    >
                      {textValue(action.label)}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}


export function SafeToolStatusView({ toolName, success }: { toolName?: string; success: boolean }) {
  const view = projectToolResultForUser({ toolName, success });
  if (view.kind === "silent") return null;
  return (
    <div className={COMPACT_AGENT_CARD_CLASS}>
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-divider)] px-3 py-2 text-xs text-[var(--color-muted)]">
        {success ? <Check size={13} className="text-emerald-500" /> : <X size={13} className="text-red-500" />}
        <span>{view.summary || view.label}</span>
      </div>
    </div>
  );
}
