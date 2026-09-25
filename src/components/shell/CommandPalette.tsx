"use client";

/**
 * ⌘K 命令面板(0.11.0-D 样张 v2,任务 2.2)。
 *
 * 零依赖 copy-in:直达工作台、新建对话、切换求职旅程。键盘导航
 * (↑↓ 选择,Enter 确认,Esc 关闭),Ctrl/⌘+K 全局唤起。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FileText, Search } from "lucide-react";

export interface CommandPaletteSession {
  id: number;
  title: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelectSession: (id: number) => void;
  sessions: CommandPaletteSession[];
}

const WORKBENCHES: Array<{ label: string; href: string }> = [
  { label: "岗位发现", href: "/discover" },
  { label: "简历管理", href: "/cv" },
  { label: "求职画像", href: "/profile" },
  { label: "投递追踪", href: "/tracker" },
  { label: "面试准备", href: "/interview" },
  { label: "Offer 对比", href: "/compare" },
  { label: "数据分析", href: "/analytics" },
  { label: "报告库", href: "/evaluate/reports" },
  { label: "JD 库", href: "/evaluate/jds" },
];

export default function CommandPalette({ open, onClose, onNewChat, onSelectSession, sessions }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  const items = useMemo(() => {
    const commands: Array<{ key: string; label: string; hint?: string; run: () => void }> = [
      { key: "new-chat", label: "新建对话", hint: "Agent", run: onNewChat },
      ...WORKBENCHES.map((page) => ({
        key: `page:${page.href}`,
        label: page.label,
        hint: "工作台",
        run: () => router.push(page.href),
      })),
      ...sessions.slice(0, 12).map((session) => ({
        key: `session:${session.id}`,
        label: session.title || "新对话",
        hint: "切换旅程",
        run: () => onSelectSession(session.id),
      })),
    ];
    const keyword = query.trim().toLowerCase();
    if (!keyword) return commands;
    return commands.filter((command) => command.label.toLowerCase().includes(keyword));
  }, [query, sessions, onNewChat, onSelectSession, router]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, items.length - 1)));
  }, [items.length]);

  if (!open) return null;

  const runActive = () => {
    const command = items[activeIndex];
    if (!command) return;
    onClose();
    command.run();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 px-4 pt-[14vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-divider)] px-4 py-3">
          <Search size={15} className="text-[var(--color-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((current) => Math.min(current + 1, items.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((current) => Math.max(current - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                runActive();
              } else if (event.key === "Escape") {
                onClose();
              }
            }}
            placeholder="搜索工作台、对话或操作…"
            className="flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none"
          />
          <kbd className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">Esc</kbd>
        </div>
        <div className="max-h-[46vh] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-[var(--color-muted)]">没有匹配的命令</div>
          )}
          {items.map((command, index) => (
            <button
              key={command.key}
              type="button"
              onMouseEnter={() => setActiveIndex(index)}
              onClick={runActive}
              className={`flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm ${
                index === activeIndex
                  ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-hover)] dark:text-[var(--color-primary)]"
                  : "text-[var(--color-text-soft)]"
              }`}
            >
              <FileText size={14} className="shrink-0 opacity-70" />
              <span className="min-w-0 truncate">{command.label}</span>
              {command.hint && (
                <span className="ml-auto shrink-0 text-[10px] text-[var(--color-muted)]">{command.hint}</span>
              )}
              {index === activeIndex && <CornerDownLeft size={12} className="shrink-0 opacity-60" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
