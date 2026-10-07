"use client";

/**
 * 设计元素（Spec 17 / ADR-0016 抄改自 Vercel AI Elements 的 Tool / Task / Reasoning /
 * InlineCitation 结构，Apache-2.0；实现为纸鸢 paper 令牌 + 既有依赖，不引入 `ai` 包。
 *
 * 数据来源约束：只消费 Conversation Item / 安全工具视图投影出来的字段，
 * 不直接读取 Run Event payload。
 */

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  ChevronDown,
  CircleDashed,
  FileText,
  Quote,
  Wrench,
  X,
} from "lucide-react";

export type ElementStatus = "running" | "success" | "failed";

const STATUS_META: Record<ElementStatus, { label: string; className: string }> = {
  running: { label: "进行中", className: "text-[var(--color-primary)]" },
  success: { label: "完成", className: "text-emerald-500" },
  failed: { label: "失败", className: "text-red-500" },
};

/** Tool 元素：工具调用卡（pending / 结果 两态，可折叠内容区）。 */
export function ElementToolCard({
  label,
  status,
  icon,
  children,
}: {
  label: string;
  status: ElementStatus;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[status];
  const hasContent = Boolean(children);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)]"
    >
      <button
        type="button"
        disabled={!hasContent}
        onClick={() => hasContent && setOpen((value) => !value)}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left ${hasContent ? "cursor-pointer hover:bg-[var(--surface-soft)]" : "cursor-default"}`}
      >
        {icon ?? <Wrench size={14} className="text-[var(--color-primary)]" />}
        <span className="text-xs font-medium text-[var(--color-text)]">{label}</span>
        <span className={`ml-auto inline-flex items-center gap-1 text-xs ${meta.className}`}>
          {status === "running"
            ? <CircleDashed size={12} className="animate-spin" />
            : status === "success"
              ? <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              : <X size={12} />}
          {meta.label}
        </span>
        {hasContent && (
          <ChevronDown size={13} className={`text-[var(--color-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>
      <AnimatePresence initial={false}>
        {hasContent && open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-muted)]">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** Task 元素：多步任务进度列表。 */
export function ElementTaskCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; status: ElementStatus }>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] px-3 py-2"
    >
      <div className="mb-2 flex items-center gap-2">
        <FileText size={14} className="text-[var(--color-primary)]" />
        <span className="text-xs font-semibold text-[var(--color-text)]">{title}</span>
      </div>
      <ol className="space-y-1.5">
        {items.map((item, index) => {
          const meta = STATUS_META[item.status];
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2 text-xs">
              {item.status === "running"
                ? <CircleDashed size={12} className={`animate-spin ${meta.className}`} />
                : <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${item.status === "success" ? "bg-emerald-500" : "bg-red-500"}`} />}
              <span className="text-[var(--color-text)]">{item.label}</span>
              <span className={`ml-auto ${meta.className}`}>{meta.label}</span>
            </li>
          );
        })}
      </ol>
    </motion.div>
  );
}

/** Reasoning 元素：推理摘要折叠卡（词表约束：只呈现推理摘要，不是模型原始推理）。 */
export function ElementReasoningCard({ summary, defaultOpen = false }: { summary: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!summary.trim()) return null;
  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Brain size={13} className="text-[var(--color-primary)]" />
        <span className="text-xs font-medium text-[var(--color-muted)]">正在想什么（摘要）</span>
        <ChevronDown size={13} className={`ml-auto text-[var(--color-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden whitespace-pre-wrap pt-2 text-xs leading-5 text-[var(--color-muted)]"
          >
            {summary}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/** InlineCitation 元素：建议/报告的出处标注（数据来自既有引用字段）。 */
export function ElementInlineCitation({ source, href }: { source: string; href?: string }) {
  const chip = (
    <span className="inline-flex max-w-[16rem] items-center gap-1 rounded-full border border-[var(--color-divider)] bg-[var(--color-bg)] px-2 py-0.5 text-[11px] text-[var(--color-muted)]">
      <Quote size={10} className="text-[var(--color-primary)]" />
      <span className="truncate">{source}</span>
    </span>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="transition-opacity hover:opacity-80">
        {chip}
      </a>
    );
  }
  return chip;
}
