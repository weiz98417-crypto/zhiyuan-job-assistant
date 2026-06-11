"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Send, Loader2, Check, CheckCircle, X, ChevronDown, ChevronUp, Brain, RefreshCw, Plus, FileText, BookOpen, Trash2, Briefcase, User, Target, Square, Maximize2 } from "lucide-react";
import { WarmButton, ScoreBadge } from "@/components/design";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { getToolDisplay } from "@/lib/agent/tool-display-names";
import { getAgentById } from "@/lib/agent/registry";
import type { AgentMessage, CoachMode, InterviewQuestion, InterviewSessionState } from "@/types";
import { createJD } from "@/lib/jd-storage";

import SuggestionChips from "./SuggestionChips";
import type { SuggestionChip } from "./SuggestionChips";

const MAX_IMAGES = 5;
const VALID_FILE_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

/* ── Types ── */

type AgentPhase = "understanding" | "executing" | "verifying" | "reflecting" | "responding" | "done" | "compressing_context" | "extracting_ocr" | "extracting_jd" | "jd_extracted" | "detecting_archetype" | "archetype_detected" | null;

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

/* ── Props ── */

interface AgentChatProps {
  messages: AgentMessage[];
  streaming: boolean;
  streamText: string;
  phase: AgentPhase;
  executingTool?: string;
  thinkingContent?: string;
  /** Current active agent ID for UI labeling */
  activeAgentId?: string;
  /** Timestamp when current agent run started (for elapsed timer) */
  startTime?: number;
  /** Per-block evaluation progress (from stream events) */
  evalProgress?: EvalBlockProgress[];
  /** Evaluation completion info (after persist) */
  completionInfo?: CompletionInfo | null;
  /** Tool result quality (good/empty/irrelevant/garbled) — drives verification indicator */
  resultQuality?: string | null;
  /** Active mock interview binding from the persisted chat session. */
  interviewState?: InterviewSessionState;

  suggestions?: SuggestionChip[];
  onSend: (content: string, images?: string[]) => Promise<void>;
  onStop?: () => void;
  emptyState: React.ReactNode;
}

/* ── ThinkingBubble ── */

interface ImageMeta {
  name?: string;
  size?: number;
  width?: number;
  height?: number;
  type?: string;
}

interface PendingImage extends ImageMeta {
  id: string;
  base64: string;
  previewUrl: string;
  type: string;
}

function estimateDataUrlBytes(src: string): number | undefined {
  const comma = src.indexOf(",");
  if (comma < 0) return undefined;
  const base64 = src.slice(comma + 1).replace(/\s+/g, "");
  if (!base64) return undefined;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function statusLabel(status?: string): string {
  if (status === "completed") return "已完成";
  if (status === "paused") return "已暂停";
  if (status === "abandoned") return "已中止";
  return "进行中";
}

function InterviewBindingBar({ state }: { state?: InterviewSessionState }) {
  const plan = state?.planSnapshot;
  if (!plan) return null;
  const answered = state.transcript.filter((turn) => turn.role === "user").length;
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

function formatBytes(size?: number): string {
  if (!size || size <= 0) return "";
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

function formatImageMeta(meta?: ImageMeta): string {
  const parts: string[] = [];
  if (meta?.width && meta?.height) parts.push(`${meta.width}x${meta.height}`);
  const size = formatBytes(meta?.size);
  if (size) parts.push(size);
  return parts.join(" / ");
}

function loadImageMeta(src: string): Promise<Pick<ImageMeta, "width" | "height">> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
}

function ImagePreviewModal({
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

function OpenableImage({
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

function ThinkingBubble({ content }: { content: string }) {
  if (!content) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex justify-start"
    >
      <div className="max-w-[85%] rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-primary-muted)] px-3 py-2 text-sm text-[var(--color-text-soft)] italic">
        <Brain size={12} className="inline-block mr-1.5 text-[var(--color-primary)] opacity-60" />
        {content}
      </div>
    </motion.div>
  );
}

/* ── ReflectingIndicator ── */

function ReflectingIndicator({ content }: { content?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-start"
    >
      <div className="max-w-[85%] rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-muted)]">
        <RefreshCw size={12} className="inline-block mr-1.5 animate-spin text-[var(--color-primary)] opacity-60" />
        {content || "分析结果中..."}
      </div>
    </motion.div>
  );
}

/* ── Tool Result Card ── */

function ToolResultCard({
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
        <span className="text-xs font-medium text-[var(--color-text)]">{display.emoji} {display.label}</span>
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

function textValue(value: unknown): string {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

function ResumeEditProposalCard({
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
    <div className="max-w-[94%] min-w-0">
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

const INTERVIEW_CATEGORY_LABEL: Record<string, string> = {
  behavioral: "行为面试",
  technical: "技术专业",
  "case-study": "场景题",
  culture: "文化匹配",
};

const INTERVIEW_MODE_LABEL: Record<string, string> = {
  "project-review": "项目复盘",
  behavioral: "行为问答",
  scenario: "情景应对",
  "structured-sme": "结构化面试",
  founder: "创始人对话",
  stability: "稳重应答",
};

function InterviewQuestionCard({ payload }: { payload: Record<string, unknown> }) {
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
    <div className="max-w-[92%]">
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

/* ── Thinking indicator ── */

function ThinkingDots() {
  return (
    <div className="flex items-center gap-2 text-[var(--color-muted)] text-sm">
      <Brain size={14} className="text-[var(--color-primary)] opacity-60" />
      <span>思考中</span>
      <span className="inline-flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-[var(--color-primary)] animate-bounce [animation-delay:0ms]" />
        <span className="w-1 h-1 rounded-full bg-[var(--color-primary)] animate-bounce [animation-delay:150ms]" />
        <span className="w-1 h-1 rounded-full bg-[var(--color-primary)] animate-bounce [animation-delay:300ms]" />
      </span>
    </div>
  );
}

/* ── Agent status bar (Claude Code-style) ── */

const PHASE_LABELS: Record<string, { emoji: string; label: string }> = {
  understanding: { emoji: "🧠", label: "识别中" },
  reflecting: { emoji: "🔄", label: "分析中" },
  executing: { emoji: "🔧", label: "执行中" },
  verifying: { emoji: "🔍", label: "验证中" },
  responding: { emoji: "✏️", label: "输出中" },
  compressing_context: { emoji: "🧠", label: "正在压缩上下文" },
  extracting_ocr: { emoji: "📷", label: "截图识别" },
  extracting_jd: { emoji: "🌐", label: "抓取JD" },
  jd_extracted: { emoji: "📄", label: "JD提取完成" },
  detecting_archetype: { emoji: "🏷️", label: "分析类型" },
  archetype_detected: { emoji: "✅", label: "类型确认" },
};

const BLOCK_LABELS: Record<string, string> = {
  a: "A·概览", b: "B·匹配", c: "C·职级", d: "D·薪资", e: "E·定制", f: "F·面试", g: "G·合法",
};

function AgentStatusBar({
  phase,
  toolName,
  startTime,
  tokenCount,
  evalProgress,
  resultQuality,
}: {
  phase: AgentPhase;
  toolName?: string;
  startTime?: number;
  tokenCount?: number;
  evalProgress?: EvalBlockProgress[];
  resultQuality?: string | null;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) return;
    setElapsed(Math.floor((Date.now() - startTime) / 1000));
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  if (!phase || phase === "done") return null;

  const phaseInfo = PHASE_LABELS[phase] || { emoji: "⏳", label: "处理中" };
  const display = toolName ? getToolDisplay(toolName) : null;

  const parts: string[] = [];
  parts.push(`${phaseInfo.emoji} ${phaseInfo.label}`);
  if (resultQuality && (phase === "verifying" || phase === "reflecting")) {
    const q = resultQuality;
    if (q === "good" || q === "ok") parts.push("✅");
    else if (q === "empty") parts.push("⚠️ 空结果 → 重试");
    else if (q === "irrelevant") parts.push("⚠️ 不相关 → 重试");
    else if (q === "garbled") parts.push("❌ 乱码");
  }
  if (display && phase === "executing") parts.push(`· ${display.emoji} ${display.label}`);

  // Render eval block progress from props (driven by generator SSE events)
  if (evalProgress && evalProgress.length > 0) {
    const blockParts = evalProgress.map((p) => {
      const label = BLOCK_LABELS[p.block] || p.label;
      if (p.status === "done") return `${label} ✓${p.score ?? ""}`;
      return `${label} ⏳`;
    });
    parts.push(blockParts.join(" · "));
  }

  if (startTime && elapsed > 0) parts.push(`⏱ ${elapsed}s`);
  if (tokenCount && tokenCount > 0) {
    const k = (tokenCount / 1000).toFixed(1);
    parts.push(`↓ ${k}k tokens`);
  }

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--color-muted)] font-mono select-none">
      <Loader2 size={12} className="animate-spin text-[var(--color-primary)]" />
      <span>{parts.join("  ")}</span>
    </div>
  );
}

/* ── Report message styling ── */

function isReportMessage(content: string): boolean {
  return content.includes("## A") && (content.includes("职位概览") || content.includes("简历匹配"));
}

function ReportMessage({ content }: { content: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] px-3 py-2 text-sm leading-relaxed">
      <MarkdownRenderer content={content} />
    </div>
  );
}

function ReportSummaryCard({ payload, content }: { payload?: Record<string, unknown>; content: string }) {
  const reportNum = payload?.reportNum as number | undefined;
  const company = (payload?.company as string | undefined) || "未知公司";
  const role = (payload?.role as string | undefined) || "未知岗位";
  const score = payload?.overallScore as number | undefined;
  const archetype = payload?.archetype as string | undefined;
  return (
    <div className="max-w-[90%]">
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

const ASSISTANT_PROCESS_PATTERNS = [
  /(^|\n)\s*好的[，,。]?\s*(?:我先|先|我会先|这就|现在先)[^。！？\n]*(?:[。！？]|\n)/g,
  /(^|\n)\s*好的[，,。]?\s*(?:你的简历刚才被截断|简历被截断)[^。！？\n]*(?:[。！？]|\n)/g,
  /(^|\n)\s*好的[，,。]?\s*(?:我读了|我已经读了|简历和\s*JD\s*都已加载|JD\s*和你的简历)[^。！？\n]*(?:[。！？]|\n)/g,
  /(^|\n)\s*(?:让我出一道贴合\s*JD\s*的题|我来出第一题|下面开始模拟面试)[：:。]?\s*/g,
];

const ASSISTANT_LABELS = new Set([
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

function normalizeAssistantMarkdown(content: string): string {
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

function AgentResponseRenderer({ content }: { content: string }) {
  const normalized = normalizeAssistantMarkdown(content);

  return (
    <MarkdownRenderer
      content={normalized}
      className="text-sm leading-relaxed cursor-default [&_h2]:font-[family-name:var(--font-display)] [&_h3]:text-[var(--color-text)]"
    />
  );
}

/* ── Animated stream text: replaces ⏳ with pulsing spinner ── */

function AnimatedStreamText({ text }: { text: string }) {
  return (
    <MarkdownRenderer content={text} className="stream-container text-sm leading-relaxed cursor-default [&_strong]:text-[var(--color-text)] [&_li]:my-0.5" />
  );
}

/* ── Eval Completion Notice ── */

function EvalCompletionNotice({ info }: { info: CompletionInfo }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex justify-start"
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-4 py-3 max-w-[90%]">
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
            className="inline-flex items-center rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            下载 PDF
          </a>
        </div>
      </div>
    </motion.div>
  );
}

/* ── HITL Eval Confirm Card ── */

function EvalConfirmCard({ msg }: { msg: AgentMessage }) {
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
      <div className="max-w-[90%]">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-4 py-3">
          <p className="text-xs text-[var(--color-muted)]">已放弃保存。评估结果仅在本次对话中可见。</p>
        </div>
      </div>
    );
  }

  if (jdSaved && reportSaved) {
    return (
      <div className="max-w-[90%]">
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
    <div className="max-w-[90%]">
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

/* ── Profile/CV View Card ── */

interface ProfileViewData {
  cvData?: {
    activeVersion?: string;
    versions?: Record<string, {
      sections?: Array<{ id: string; title: string; content: string }>;
    }>;
  };
  profileData?: {
    skills?: Array<{ name: string }>;
    goals?: { targetRoles?: Array<{ role: string; level: string }>; dealBreakers?: string[] };
  };
  dnaSummary?: string;
}

function ProfileViewCard({ data }: { data: ProfileViewData }) {
  const byId: Record<string, string> = {};
  if (data.cvData?.versions) {
    const activeVer = data.cvData.activeVersion || Object.keys(data.cvData.versions)[0];
    const sections = data.cvData.versions[activeVer]?.sections;
    if (sections) {
      for (const s of sections) byId[s.id] = (s.content || "").trim();
    }
  }

  const [expanded, setExpanded] = useState<Set<string>>(new Set(["summary"]));

  const toggle = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpanded(next);
  };

  const sectionDefs = [
    { id: "summary",    label: "基本信息", icon: User,      content: byId.summary },
    { id: "experience", label: "工作经历", icon: Briefcase, content: byId.experience },
    { id: "projects",   label: "项目经验", icon: FileText,  content: byId.projects },
    { id: "education",  label: "教育背景", icon: BookOpen,  content: byId.education },
    { id: "skills",     label: "技能",     icon: BookOpen,  content: byId.skills },
  ];

  return (
    <div className="space-y-3 max-w-[95%]">
      {sectionDefs.map(({ id, label, icon: Icon, content }) => {
        if (!content) return null;
        const isOpen = expanded.has(id);

        if (id === "summary") {
          return (
            <div key={id} className="rounded-[var(--radius-md)] border border-[var(--color-divider)] overflow-hidden">
              <div className="px-4 py-2 bg-[var(--color-bg)] border-b border-[var(--color-divider)] flex items-center gap-2">
                <Icon size={14} className="text-[var(--color-primary)]" />
                <span className="text-sm font-medium text-[var(--color-text)]">{label}</span>
              </div>
              <div className="p-4 text-sm">
                <table className="w-full text-sm"><tbody>
                  {content.split("\n").map((line, i) => {
                    const colonIdx = line.indexOf("：") > 0 ? line.indexOf("：") : line.indexOf(":");
                    if (colonIdx > 0) {
                      const key = line.slice(0, colonIdx).trim();
                      const val = line.slice(colonIdx + 1).trim();
                      if (!val) return null;
                      return (
                        <tr key={i} className={i > 0 ? "border-t border-[var(--color-divider)]" : ""}>
                          <td className="py-1.5 pr-4 text-[var(--color-muted)] whitespace-nowrap align-top">{key}</td>
                          <td className="py-1.5 text-[var(--color-text)]">{val}</td>
                        </tr>
                      );
                    }
                    if (i === 0 && line && !line.includes("：") && !line.includes(":")) {
                      return (
                        <tr key={i}>
                          <td className="py-1.5 pr-4 text-[var(--color-muted)] whitespace-nowrap align-top">姓名</td>
                          <td className="py-1.5 text-[var(--color-text)] font-medium">{line}</td>
                        </tr>
                      );
                    }
                    return line ? (
                      <tr key={i} className={i > 0 ? "border-t border-[var(--color-divider)]" : ""}>
                        <td colSpan={2} className="py-1.5 text-[var(--color-text-soft)]">{line}</td>
                      </tr>
                    ) : null;
                  })}
                </tbody></table>
              </div>
            </div>
          );
        }

        return (
          <div key={id} className="rounded-[var(--radius-md)] border border-[var(--color-divider)] overflow-hidden">
            <button
              onClick={() => toggle(id)}
              className="w-full px-4 py-2 bg-[var(--color-bg)] flex items-center justify-between hover:bg-[var(--color-primary-muted)] transition-colors"
            >
              <div className="flex items-center gap-2">
                <Icon size={14} className="text-[var(--color-primary)]" />
                <span className="text-sm font-medium text-[var(--color-text)]">{label}</span>
                <span className="text-xs text-[var(--color-muted)]">（{content.length} 字）</span>
              </div>
              {isOpen
                ? <ChevronUp size={14} className="text-[var(--color-muted)]" />
                : <ChevronDown size={14} className="text-[var(--color-muted)]" />}
            </button>
            {isOpen && (
              <div className="p-4 text-sm whitespace-pre-wrap text-[var(--color-text)] border-t border-[var(--color-divider)]">
                {content}
              </div>
            )}
          </div>
        );
      })}

      {/* Profile Goals */}
      {data.profileData?.goals && (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-divider)] overflow-hidden">
          <div className="px-4 py-2 bg-[var(--color-bg)] border-b border-[var(--color-divider)] flex items-center gap-2">
            <Target size={14} className="text-[var(--color-primary)]" />
            <span className="text-sm font-medium text-[var(--color-text)]">求职目标</span>
          </div>
          <div className="p-4 text-sm space-y-1">
            {data.profileData.goals.targetRoles?.length ? (
              <p>目标岗位: {data.profileData.goals.targetRoles.map(r => r.level ? `${r.role}(${r.level})` : r.role).join("、")}</p>
            ) : null}
            {data.profileData.goals.dealBreakers?.length ? (
              <p className="text-[var(--color-muted)]">底线: {data.profileData.goals.dealBreakers.join("、")}</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Message Bubble ── */

function MessageBubble({
  msg,
  isStreaming,
  streamText,
  phase,
  executingTool,
  thinkingContent,
  activeAgentId,
  startTime,
  onSend,
}: {
  msg: AgentMessage;
  isStreaming: boolean;
  streamText: string;
  phase: AgentPhase;
  executingTool?: string;
  thinkingContent?: string;
  activeAgentId?: string;
  startTime?: number;
  onSend: (content: string) => Promise<void>;
}) {
  const isUser = msg.role === "user";
  const imageAttachments = Array.isArray(msg.images)
    ? msg.images.filter((src) => typeof src === "string" && src.startsWith("data:image/"))
    : [];

  if (msg.role === "tool") {
    // Check for uiPayload-based rendering first (triple-pipe architecture)
    const raw = msg.toolResult as Record<string, unknown> | undefined;
    const uiPayload = raw?.uiPayload as Record<string, unknown> | undefined;
    const toolSuccess = typeof raw?.success === "boolean" ? raw.success : true;

    // Data query tools: data is for LLM only, show minimal indicator
    const DATA_QUERY_TOOLS: Record<string, string> = {
      read_file: "已读取文件",
      get_reference_detail: "已读取参考简历",
      search_applications: "已查询投递记录",
      get_recent_activity: "已获取活动",
      get_pipeline_status: "已获取 Pipeline 状态",
      get_recommendations: "已获取推荐",
      check_pipeline_health: "已完成健康检查",
      get_profile_insights: "已完成画像分析",
      detect_skill_gaps: "已完成技能分析",
      check_ats_compatibility: "已完成 ATS 检查",
      decode_black_market_terms: "已解码黑话",
      analyze_jd_risks: "已完成风险扫描",
      web_search: "已完成搜索",
    };
    if (DATA_QUERY_TOOLS[msg.toolName || ""]) {
      const label = DATA_QUERY_TOOLS[msg.toolName!];
      const preview = (typeof raw?.result === "string" ? raw.result : msg.content || "").slice(0, 80).replace(/\n/g, " ");
      return (
        <div className="max-w-[90%]">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[var(--radius-md)] border border-[var(--color-divider)] overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <FileText size={14} className="text-[var(--color-primary)]" />
              <span className="text-xs font-medium text-[var(--color-text)]">{toolSuccess ? label : "工具调用失败"}</span>
              {preview && <span className="text-xs text-[var(--color-muted)] truncate">{preview}</span>}
              {toolSuccess ? (
                <Check size={12} className="text-emerald-500 ml-auto flex-shrink-0" />
              ) : (
                <X size={12} className="text-red-500 ml-auto flex-shrink-0" />
              )}
            </div>
          </motion.div>
        </div>
      );
    }

    // get_profile: show minimal indicator (data is for LLM, full profile is at /profile)
    if (msg.toolName === "get_profile") {
      return (
        <div className="max-w-[90%]">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[var(--radius-md)] border border-[var(--color-divider)] overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <User size={14} className="text-[var(--color-primary)]" />
              <span className="text-xs font-medium text-[var(--color-text)]">已读取求职画像</span>
              <span className="text-xs text-[var(--color-muted)] truncate">{msg.content?.slice(0, 50) || ""}</span>
              <Check size={12} className="text-emerald-500 ml-auto flex-shrink-0" />
            </div>
          </motion.div>
        </div>
      );
    }

    if (uiPayload?.type === "interview_questions") {
      return <InterviewQuestionCard payload={uiPayload} />;
    }

    if (
      uiPayload?.type === "resume_edit_proposal" ||
      uiPayload?.type === "resume_edit_proposal_applied" ||
      uiPayload?.type === "resume_edit_proposal_discarded" ||
      uiPayload?.type === "resume_edit_proposal_rolled_back"
    ) {
      return <ResumeEditProposalCard payload={uiPayload} success={toolSuccess} onSend={onSend} />;
    }

    // Report blocks: uiPayload or legacy text
    if (msg.toolName === "get_report_detail") {
      if (uiPayload?.type === "report_blocks") {
        return <ReportSummaryCard payload={uiPayload} content={msg.content} />;
      }
      if (isReportMessage(msg.content)) {
        return <ReportSummaryCard content={msg.content} />;
      }
      // Fallback: render as markdown text
      return (
        <div className="max-w-[90%]">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-4 py-3 text-sm">
            <MarkdownRenderer content={msg.content} />
          </div>
        </div>
      );
    }

    // evaluate_jd / evaluate_jd_full: don't show raw tool card — result goes to EvalConfirmCard / EvalCompletionNotice
    if (msg.toolName === "evaluate_jd") {
      return <EvalConfirmCard msg={msg} />;
    }
    if (msg.toolName === "evaluate_jd_full") {
      // Data-only tool — completion shown via EvalCompletionNotice in the assistant message
      return null;
    }
    if (msg.toolName === "recognize_document_image") {
      const status = (uiPayload?.status as string | undefined) || (toolSuccess ? "done" : "failed");
      const route = uiPayload?.route ? String(uiPayload.route) : "";
      const reason = uiPayload?.reason ? String(uiPayload.reason) : "";
      const confidence = typeof uiPayload?.confidence === "number" ? `${Math.round((uiPayload.confidence as number) * 100)}%` : "";
      const clarificationQuestion = uiPayload?.clarificationQuestion ? String(uiPayload.clarificationQuestion) : "";
      const retryHint = uiPayload?.retryHint ? String(uiPayload.retryHint) : "";
      const imagesCount = typeof uiPayload?.imagesCount === "number" ? uiPayload.imagesCount : 0;
      const perImage = Array.isArray(uiPayload?.perImage)
        ? uiPayload.perImage.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
        : [];
      return (
        <div className="max-w-[90%]">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)]"
          >
            <div className="flex items-center gap-2 border-b border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2">
              <CheckCircle size={14} className={status === "failed" ? "text-red-500" : "text-[var(--color-primary)]"} />
              <span className="text-xs font-medium text-[var(--color-text)]">🖼️ 识别图片</span>
              <span className={`ml-auto text-xs ${status === "failed" ? "text-red-500" : "text-emerald-500"}`}>
                {status === "failed" ? "失败" : status === "running" ? "识别中" : "完成"}
              </span>
            </div>
            <div className="space-y-2 px-3 py-2 text-sm text-[var(--color-text)]">
              {imagesCount > 0 && <div className="text-xs text-[var(--color-muted)]">图片: {imagesCount} 张</div>}
              {route && <div className="text-xs text-[var(--color-muted)]">路由: {route}</div>}
              {confidence && <div className="text-xs text-[var(--color-muted)]">置信度: {confidence}</div>}
              {reason && <div className="text-xs text-[var(--color-muted)] whitespace-pre-wrap">{reason}</div>}
              {perImage.length > 0 && (
                <div className="space-y-1">
                  {perImage.map((item, index) => {
                    const itemIndex = typeof item.index === "number" ? item.index + 1 : index + 1;
                    const itemType = item.documentType ? String(item.documentType) : "unknown";
                    const itemConfidence = typeof item.confidence === "number" ? `${Math.round(item.confidence * 100)}%` : "";
                    const textLength = typeof item.extractedTextLength === "number" ? `${item.extractedTextLength}字` : "";
                    const itemReason = item.reason ? String(item.reason) : "";
                    return (
                      <div key={`image-intake-${itemIndex}-${index}`} className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-[var(--color-muted)]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-[var(--color-text)]">第 {itemIndex} 张</span>
                          <span>{itemType}</span>
                          {itemConfidence && <span>{itemConfidence}</span>}
                          {textLength && <span>{textLength}</span>}
                        </div>
                        {itemReason && <div className="mt-1 whitespace-pre-wrap">{itemReason}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
              {clarificationQuestion && (
                <div className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2 text-xs">
                  {clarificationQuestion}
                </div>
              )}
              {retryHint && (
                <div className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {retryHint}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      );
    }

    // Export file — show download button when file is available
    if (msg.toolName === "export_file" || msg.toolName === "download_report_pdf") {
      let downloadUrl: string | null = null;
      let filename: string | null = null;
      try {
        const raw = msg.toolResult as Record<string, unknown> | undefined;
        if (raw?.data && typeof raw.data === "object") {
          const d = raw.data as { downloadUrl?: string; filename?: string };
          downloadUrl = d.downloadUrl || null;
          filename = d.filename || null;
        }
      } catch { /* fall through */ }
      return (
        <div className="max-w-[90%]">
          <ToolResultCard
            toolName={msg.toolName}
            toolResult={typeof msg.toolResult === "string" ? msg.toolResult : msg.content || ""}
            success={true}
            downloadUrl={downloadUrl}
            downloadLabel={filename ? `下载 ${filename}` : "下载文件"}
          />
        </div>
      );
    }

    const resultStr = typeof msg.toolResult === "string"
      ? msg.toolResult
      : typeof (msg.toolResult as { result?: unknown } | null)?.result === "string"
        ? (msg.toolResult as { result: string }).result
        : msg.content || "";
    const success = typeof msg.toolResult === "object" && msg.toolResult !== null
      ? (msg.toolResult as { success?: boolean }).success !== false
      : true;

    return (
      <div className="max-w-[90%]">
        <ToolResultCard
          toolName={msg.toolName || "tool"}
          toolResult={resultStr}
          success={success}
        />
      </div>
    );
  }

  const showStream = isStreaming || (isUser ? false : !msg.content && streamText);

  function renderStreamContent() {
    if (!showStream) return null;

    if (streamText) {
      return <AnimatedStreamText text={streamText} />;
    }

    if (phase === "understanding") {
      return <ThinkingDots />;
    }

    return <ThinkingDots />;
  }

  const streamContent = renderStreamContent();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex w-full min-w-0 ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[90%] min-w-0 overflow-hidden rounded-[var(--radius-lg)] px-4 py-3 text-base leading-relaxed ${
          isUser
            ? "bg-[var(--color-primary)] text-[var(--color-surface-raised)] cursor-default"
            : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] cursor-default"
        }`}
      >
        {streamContent || (
          isUser ? (
            <div className="space-y-2 cursor-default">
              {msg.content && (
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              )}
              {imageAttachments.length > 0 && (
                <div className="grid grid-cols-1 gap-2">
                  {imageAttachments.map((src, index) => (
                    <OpenableImage
                      key={`${msg.timestamp}-image-${index}`}
                      src={src}
                      alt={`上传图片 ${index + 1}`}
                      className="max-h-64 max-w-full rounded-[var(--radius-md)] border border-white/25 object-contain bg-white/10"
                      name={`上传图片 ${index + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : isReportMessage(msg.content) ? (
            <ReportMessage content={msg.content} />
          ) : (
            <AgentResponseRenderer content={msg.content} />
          )
        )}
      </div>
    </motion.div>
  );
}

/* ── AgentChat Component ── */

export default function AgentChat({
  messages,
  streaming,
  streamText,
  phase,
  executingTool,
  thinkingContent,
  activeAgentId,
  startTime,
  evalProgress,
  completionInfo,
  resultQuality,
  interviewState,
  suggestions,
  onSend,
  onStop,
  emptyState,
}: AgentChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [plusPulse, setPlusPulse] = useState(false);
  const [evalPlaceholder, setEvalPlaceholder] = useState(false);
  const hasRealChat = messages.some((m) => m.role === "user");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText, phase, thinkingContent]);

  /* ── Image handling ── */
  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const loadFileMeta = (file: File): Promise<Pick<PendingImage, "width" | "height" | "size" | "type">> =>
    new Promise((resolve) => {
      if (file.type === "application/pdf") {
        resolve({ size: file.size, type: file.type });
        return;
      }
      const preview = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        URL.revokeObjectURL(preview);
        resolve({ width: img.naturalWidth, height: img.naturalHeight, size: file.size, type: file.type });
      };
      img.onerror = () => {
        URL.revokeObjectURL(preview);
        resolve({ size: file.size, type: file.type });
      };
      img.src = preview;
    });

  const addFiles = useCallback(async (files: File[]) => {
    const newItems: typeof images = [];
    for (const file of files) {
      if (!VALID_FILE_TYPES.includes(file.type)) continue;
      if (file.size > 5 * 1024 * 1024) continue;
      if (images.length + newItems.length >= MAX_IMAGES) break;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const base64 = await toBase64(file);
      const previewUrl = file.type === "application/pdf" ? "" : URL.createObjectURL(file);
      const meta = await loadFileMeta(file);
      newItems.push({ id, base64, previewUrl, name: file.name, ...meta });
    }
    setImages((prev) => [...prev, ...newItems].slice(0, MAX_IMAGES));
  }, [images.length]);

  const removeImage = (id: string) => {
    setImages((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  // Ctrl+V paste handler for screenshots
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (e.target !== document.body && e.target !== inputRef.current) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) addFiles(files);
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [addFiles]);

  const handleSend = async () => {
    const trimmed = input.trim();
    const hasContent = trimmed || images.length > 0;
    if (!hasContent || streaming) return;

    const content = trimmed;
    const outgoingImages = images.map((i) => i.base64);
    images.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });

    setInput("");
    setImages([]);
    setEvalPlaceholder(false);
    await onSend(content, outgoingImages);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  /* ── Chip select with hybrid mode for "评估JD" ── */
  const handleChipSelect = (prompt: string, label: string) => {
    setInput(prompt);
    if (label === "评估JD") {
      setEvalPlaceholder(true);
      setPlusPulse(true);
      setTimeout(() => setPlusPulse(false), 2000);
    } else {
      setEvalPlaceholder(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <InterviewBindingBar state={interviewState} />

      {/* Messages */}
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden py-4 space-y-4 cursor-default">
        {messages.map((msg, i) => {
          // Last assistant: this msg is assistant AND no assistant messages appear after it
          const isLastAssistant =
            msg.role === "assistant" && streaming &&
            !messages.slice(i + 1).some(m => m.role === "assistant");

          // Agent source label: show when agent_id changes between messages
          const prevMsg = i > 0 ? messages[i - 1] : null;
          const effectiveAgentId =
            msg.agent_id || (msg.mode === "interview-coach" ? "interview" : undefined);
          const prevAgentId =
            prevMsg?.agent_id || (prevMsg?.mode === "interview-coach" ? "interview" : undefined);
          const showAgentLabel =
            effectiveAgentId &&
            effectiveAgentId !== "general" &&
            effectiveAgentId !== prevAgentId &&
            msg.role !== "user";
          const agentLabel = showAgentLabel
            ? getAgentById(effectiveAgentId)?.name || effectiveAgentId
            : undefined;

          return (
            <div key={`${msg.timestamp}-${i}`}>
              {agentLabel && (
                <div className="flex justify-center mb-1">
                  <span className="text-[10px] text-[var(--color-muted)] opacity-50 tracking-wide">
                    {agentLabel}
                  </span>
                </div>
              )}
              <MessageBubble
                msg={msg}
                isStreaming={isLastAssistant}
                streamText={isLastAssistant ? streamText : ""}
                phase={isLastAssistant ? phase : null}
                executingTool={isLastAssistant ? executingTool : undefined}
                thinkingContent={isLastAssistant ? thinkingContent : undefined}
                activeAgentId={isLastAssistant ? activeAgentId : undefined}
                startTime={isLastAssistant ? startTime : undefined}
                onSend={onSend}
              />
            </div>
          );
        })}

        {/* Status bar: shown independently when executing, even without stream text */}
        {streaming && phase && phase !== "done" && (
          <div className="flex justify-start pl-4">
            <AgentStatusBar phase={phase} toolName={executingTool} startTime={startTime} evalProgress={evalProgress} resultQuality={resultQuality} />
          </div>
        )}

        {/* Eval completion notice: shown after streaming ends and persist_done fires */}
        {!streaming && completionInfo && (
          <EvalCompletionNotice info={completionInfo} />
        )}

        {/* Standalone thinking/reflecting bubbles */}
        {streaming && thinkingContent && (phase === "understanding" || phase === "reflecting") && (
          <ThinkingBubble content={thinkingContent} />
        )}

        {!hasRealChat && !streaming && emptyState}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="z-20 flex-shrink-0 bg-[var(--color-surface)]/95 pt-3 border-t border-[var(--color-divider)] backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface)]/85">
        {suggestions && !hasRealChat && !streaming && (
          <div className="mb-3">
            <SuggestionChips
              suggestions={suggestions}
              disabled={streaming}
              onSelect={(prompt, label) => handleChipSelect(prompt, label)}
            />
          </div>
        )}

        {/* Screenshot preview strip */}
        {images.length > 0 && (
          <div className="mb-2 flex items-center gap-2 flex-wrap">
            {images.map((item, i) => (
              <div key={item.id} className="relative group">
                {item.previewUrl ? (
                  <OpenableImage
                    src={item.previewUrl}
                    alt={`截图 ${i + 1}`}
                    className="w-12 h-12 object-cover rounded-[var(--radius-sm)] border border-[var(--color-border)]"
                    name={item.name}
                    meta={item}
                  />
                ) : (
                  <div className="w-12 h-12 flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]">
                    <FileText size={18} className="text-[var(--color-primary)]" />
                  </div>
                )}
                <span className="absolute -top-1 -left-1 text-[10px] bg-[var(--color-text)] text-[var(--color-surface)] w-4 h-4 rounded-full flex items-center justify-center">
                  {i + 1}
                </span>
                <button
                  onClick={() => removeImage(item.id)}
                  className="absolute -top-1 -right-1 p-0.5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            <span className="text-xs text-[var(--color-muted)]">共 {images.length} 个文件</span>
          </div>
        )}

        <div className="flex gap-2 items-end">
          {/* + button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={streaming || images.length >= MAX_IMAGES}
            className={`flex-shrink-0 w-9 h-9 rounded-[var(--radius-md)] border-2 border-dashed flex items-center justify-center transition-all ${
              plusPulse
                ? "border-[var(--color-primary)] bg-[var(--color-primary-muted)] animate-pulse"
                : "border-[var(--color-divider)] hover:border-[var(--color-primary)]"
            } disabled:opacity-30 disabled:cursor-not-allowed`}
            title="上传截图或PDF简历"
          >
            <Plus size={16} className="text-[var(--color-muted)]" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,.pdf"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              streaming
                ? "AI 回复中..."
                : evalPlaceholder
                  ? "粘贴 JD 文本或链接..."
                  : "告诉纸鸢你需要什么，或者随便聊聊..."
            }
            rows={2}
            disabled={streaming}
            className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)] resize-none disabled:opacity-50 font-[var(--font-body)]"
          />
          <WarmButton
            variant="primary"
            size="md"
            onClick={streaming ? onStop : handleSend}
            disabled={streaming ? !onStop : (!input.trim() && images.length === 0)}
          >
            {streaming ? (
              <Square size={16} />
            ) : (
              <Send size={16} />
            )}
          </WarmButton>
        </div>
        <p className="text-xs text-[var(--color-muted)] mt-1.5">
          Enter 发送 · Shift+Enter 换行 · 支持 Ctrl+V 粘贴截图
        </p>
      </div>
    </div>
  );
}
