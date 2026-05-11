"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Send, Loader2, Check, CheckCircle, X, ChevronDown, ChevronUp, Brain, RefreshCw, Plus, FileText, BookOpen, Trash2, Briefcase } from "lucide-react";
import { WarmButton, ScoreBadge } from "@/components/design";
import { getToolDisplay } from "@/lib/agent/tool-display-names";
import { getAgentById } from "@/lib/agent/registry";
import type { AgentMessage } from "@/types";
import db from "@/lib/db";
import { createJD } from "@/lib/jd-storage";
import type { ApplicationStatus } from "@/types";

import SuggestionChips from "./SuggestionChips";
import type { SuggestionChip } from "./SuggestionChips";

const MAX_IMAGES = 5;
const VALID_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/* ── Types ── */

type AgentPhase = "understanding" | "executing" | "verifying" | "reflecting" | "responding" | "done" | null;

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

  suggestions?: SuggestionChip[];
  onSend: (content: string, images?: string[]) => Promise<void>;
  emptyState: React.ReactNode;
}

/* ── ThinkingBubble ── */

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
}: {
  toolName: string;
  toolResult: string;
  success: boolean;
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
      </div>
    </motion.div>
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
};

function AgentStatusBar({
  phase,
  toolName,
  startTime,
  tokenCount,
}: {
  phase: AgentPhase;
  toolName?: string;
  startTime?: number;
  tokenCount?: number;
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
  if (display && phase === "executing") parts.push(`· ${display.emoji} ${display.label}`);
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

/* ── Simple markdown → HTML ── */

/* ── Report message styling ── */

function isReportMessage(content: string): boolean {
  return content.includes("## A") && (content.includes("职位概览") || content.includes("简历匹配"));
}

function ReportMessage({ content }: { content: string }) {
  // Split only on explicit block headers like "## A · 职位概览" not sub-headings
  const blocks = content.split(/\n(?=## [A-G]\s*[·—–板块）\)\.])/);
  const blockStyles: Record<string, { icon: string; color: string }> = {
    "A": { icon: "📋", color: "#f59e0b" },
    "B": { icon: "🎯", color: "#3b82f6" },
    "C": { icon: "📈", color: "#8b5cf6" },
    "D": { icon: "💰", color: "#10b981" },
    "E": { icon: "✏️", color: "#f472b6" },
    "F": { icon: "🎤", color: "#ef4444" },
    "G": { icon: "🛡️", color: "#6b7280" },
  };

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        if (!block.trim()) return null;
        const headingMatch = block.match(/^## ([A-G])[\s·）\)\.、板块—–\-]+(.+)/m);
        if (!headingMatch) {
          return <div key={i} className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(block) }} />;
        }
        const key = headingMatch[1];
        const title = (headingMatch[2] || key).replace(/^[\s·）\)\.、板块—–\-]+/, "").trim() || (headingMatch[2] || key).trim();
        const style = blockStyles[key] || { icon: "📌", color: "#6b7280" };
        // Strip the main block heading from body
        const body = block.replace(/^##\s*[A-G](?![A-Za-z]).*\n?/m, "").trim();

        return (
          <div key={i} className="rounded-[var(--radius-md)] border border-[var(--color-divider)] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-bg)] border-b border-[var(--color-divider)]" style={{ borderLeft: `3px solid ${style.color}` }}>
              <span className="text-sm">{style.icon}</span>
              <span className="text-sm font-bold text-[var(--color-text)]">{key} · {title}</span>
            </div>
            <div className="px-3 py-2 text-sm leading-relaxed report-content" dangerouslySetInnerHTML={{ __html: mdToHtml(body) }} />
          </div>
        );
      })}
    </div>
  );
}

function mdToHtml(md: string): string {
  // Extract and replace markdown tables before other transformations
  const tableRegex = /^(\|.+\|\n)+\|[-| :]+\|\n(\|.+\|\n?)+/gm;
  let html = md;
  const tableClass = "w-full my-3 border-collapse text-sm rounded-[var(--radius-sm)] overflow-hidden";
  const thClass = "px-3 py-2 text-left font-semibold text-[var(--color-text)] bg-[var(--color-primary-muted)] border-b border-[var(--color-divider)]";
  const tdClass = "px-3 py-2 border-b border-[var(--color-divider)] text-[var(--color-text-soft)]";
  const trEvenClass = "bg-[var(--color-bg)]";

  html = html.replace(tableRegex, (tableBlock) => {
    const rows = tableBlock.trim().split("\n").filter((l) => l.startsWith("|") && !l.match(/^\|[-| :]+\|$/));
    if (rows.length === 0) return tableBlock;
    const cells = rows.map((row, ri) => {
      const cols = row.split("|").filter((c, i, arr) => i > 0 && i < arr.length - 1 || (i === 0 && c.trim()) || (i === arr.length - 1 && c.trim()));
      const isHeader = ri === 0;
      const tag = isHeader ? "th" : "td";
      const cls = isHeader ? thClass : tdClass;
      return cols.map((c) => `<${tag} class='${cls}'>${c.trim()}</${tag}>`).join("");
    });
    const headerRow = `<tr>${cells[0]}</tr>`;
    const bodyRows = cells.slice(1).map((r, i) => `<tr class='${i % 2 === 0 ? "" : trEvenClass}'>${r}</tr>`).join("");
    return `<table class='${tableClass}'><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>`;
  });

  return html
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Bold STAR labels
    .replace(/\b([STAR])\s*\((\w+)\):/g, "<strong class='text-[var(--color-primary)]'>$1 ($2):</strong>")
    .replace(/^#### (.+)$/gm, "<h4 class='text-sm font-bold mt-3 mb-1'>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3 class='text-base font-medium mt-3 mb-1'>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2 class='text-lg font-bold mt-4 mb-2'>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 class='text-xl font-bold mt-4 mb-2'>$1</h1>")
    .replace(/^- (.+)$/gm, "<li class='ml-4 text-sm'>$1</li>")
    .replace(/^(\d+)\.\s+(.+)$/gm, "<li class='ml-4 text-sm'>$1. $2</li>")
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

/* ── Animated stream text: replaces ⏳ with pulsing spinner ── */

function AnimatedStreamText({ text }: { text: string }) {
  const html = mdToHtml(text);
  return (
    <div
      className="stream-container text-sm leading-relaxed cursor-default [&_strong]:text-[var(--color-text)] [&_li]:my-0.5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
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
      const allReports = await db.reports.toArray();
      const maxNum = allReports.reduce((max, r) => Math.max(max, r.reportNum), 0);
      const date = new Date().toISOString().split("T")[0];
      await db.reports.add({
        reportNum: maxNum + 1,
        date,
        company, role, archetype,
        overallScore: score,
        legitimacy: "",
        blocks: { a: blocks.a?.content || "", b: blocks.b?.content || "", c: blocks.c?.content || "", d: blocks.d?.content || "", e: blocks.e?.content || "", f: blocks.f?.content || "", g: blocks.g?.content || "" },
        scores: { a: blocks.a?.score || 0, b: blocks.b?.score || 0, c: blocks.c?.score || 0, d: blocks.d?.score || 0, e: blocks.e?.score || 0, f: blocks.f?.score || 0, g: "" },
        keywords: [],
        createdAt: new Date(),
      });
      setReportSaved(true);
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
}: {
  msg: AgentMessage;
  isStreaming: boolean;
  streamText: string;
  phase: AgentPhase;
  executingTool?: string;
  thinkingContent?: string;
  activeAgentId?: string;
  startTime?: number;
}) {
  const isUser = msg.role === "user";

  if (msg.role === "tool") {
    // Special handling for evaluate_jd: render HITL confirmation buttons
    if (msg.toolName === "evaluate_jd") {
      return <EvalConfirmCard msg={msg} />;
    }

    const resultStr = typeof msg.toolResult === "string"
      ? msg.toolResult
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

    const statusBar = (
      <AgentStatusBar
        phase={phase}
        toolName={executingTool}
        startTime={startTime}
      />
    );

    // Show streamText with status bar below if executing
    if (streamText) {
      return (
        <>
          <AnimatedStreamText text={streamText} />
          {statusBar}
        </>
      );
    }

    // Phase indicator with timer
    if (phase === "understanding") {
      return (
        <>
          {statusBar}
          <span className="inline-flex gap-0.5 ml-2">
            <span className="w-1 h-1 rounded-full bg-[var(--color-primary)] animate-bounce [animation-delay:0ms]" />
            <span className="w-1 h-1 rounded-full bg-[var(--color-primary)] animate-bounce [animation-delay:150ms]" />
            <span className="w-1 h-1 rounded-full bg-[var(--color-primary)] animate-bounce [animation-delay:300ms]" />
          </span>
        </>
      );
    }

    return statusBar || <ThinkingDots />;
  }

  const streamContent = renderStreamContent();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[90%] rounded-[var(--radius-lg)] px-4 py-3 text-base leading-relaxed ${
          isUser
            ? "bg-[var(--color-primary)] text-[var(--color-surface-raised)] cursor-default"
            : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] cursor-default"
        }`}
      >
        {streamContent || (
          isUser ? (
            <div className="whitespace-pre-wrap break-words cursor-default">{msg.content}</div>
          ) : isReportMessage(msg.content) ? (
            <ReportMessage content={msg.content} />
          ) : (
            <div className="text-sm leading-relaxed cursor-default [&_strong]:text-[var(--color-text)] [&_strong]:font-medium [&_li]:my-0.5 [&_h2]:font-[family-name:var(--font-display)] [&_h3]:text-[var(--color-text)]" dangerouslySetInnerHTML={{ __html: mdToHtml(msg.content) }} />
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
  suggestions,
  onSend,
  emptyState,
}: AgentChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<{ id: string; base64: string; previewUrl: string; name: string }[]>([]);
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

  const addImages = useCallback(async (files: File[]) => {
    const newItems: typeof images = [];
    for (const file of files) {
      if (!VALID_IMAGE_TYPES.includes(file.type)) continue;
      if (file.size > 5 * 1024 * 1024) continue;
      if (images.length + newItems.length >= MAX_IMAGES) break;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const base64 = await toBase64(file);
      const previewUrl = URL.createObjectURL(file);
      newItems.push({ id, base64, previewUrl, name: file.name });
    }
    setImages((prev) => [...prev, ...newItems].slice(0, MAX_IMAGES));
  }, [images.length]);

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((i) => i.id !== id));
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
      if (files.length > 0) addImages(files);
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [addImages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    const hasContent = trimmed || images.length > 0;
    if (!hasContent || streaming) return;

    let content = trimmed;
    // If images are attached, include them in the message
    if (images.length > 0) {
      const imgNote = `[已上传${images.length}张截图]`;
      content = content ? `${content}\n\n${imgNote}` : `请识别并评估这些JD截图`;
    }

    setInput("");
    setEvalPlaceholder(false);
    await onSend(content, images.map((i) => i.base64));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addImages(Array.from(e.target.files));
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
    <>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 cursor-default">
        {messages.map((msg, i) => {
          const isLastAssistant =
            i === messages.length - 1 && msg.role === "assistant" && streaming;

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
              />
            </div>
          );
        })}

        {/* Standalone thinking/reflecting bubbles when not tied to a message */}
        {streaming && thinkingContent && (phase === "understanding" || phase === "reflecting") && (
          <ThinkingBubble content={thinkingContent} />
        )}

        {!hasRealChat && !streaming && emptyState}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="pt-3 border-t border-[var(--color-divider)]">
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
            {images.map((img, i) => (
              <div key={img.id} className="relative group">
                <img
                  src={img.previewUrl}
                  alt={`截图 ${i + 1}`}
                  className="w-12 h-12 object-cover rounded-[var(--radius-sm)] border border-[var(--color-border)]"
                />
                <span className="absolute -top-1 -left-1 text-[10px] bg-[var(--color-text)] text-[var(--color-surface)] w-4 h-4 rounded-full flex items-center justify-center">
                  {i + 1}
                </span>
                <button
                  onClick={() => removeImage(img.id)}
                  className="absolute -top-1 -right-1 p-0.5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            <span className="text-xs text-[var(--color-muted)]">共 {images.length} 张</span>
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
            title="上传截图"
          >
            <Plus size={16} className="text-[var(--color-muted)]" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
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
            onClick={handleSend}
            disabled={(!input.trim() && images.length === 0) || streaming}
          >
            {streaming ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </WarmButton>
        </div>
        <p className="text-xs text-[var(--color-muted)] mt-1.5">
          Enter 发送 · Shift+Enter 换行 · 支持 Ctrl+V 粘贴截图
        </p>
      </div>
    </>
  );
}
