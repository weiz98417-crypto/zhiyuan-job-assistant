"use client";

/**
 * 求职旅程栏(0.11.0-D 样张 v2,任务 2.1:会话列表升级为求职旅程轨)。
 *
 * 每段旅程带任务图标与主责高亮;完结/陈旧的旅程淡显;底部 ⌘K 唤起
 * 命令面板。选择、新建、置顶、删除、撤回等既有操作全部保留。
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Pin, Trash2, X, Undo2, MessagesSquare, Compass, Package, FileText, Briefcase, Command } from "lucide-react";
import type { ChatSession } from "@/types";

interface SessionListProps {
  sessions: ChatSession[];
  currentSessionId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
  onUndoDelete: (id: number) => void;
  onPin: (id: number, pinned: boolean) => void;
  showUndoToast: { id: number; title: string } | null;
  onOpenCommandPalette?: () => void;
}

/** 旅程任务图标:按会话的绑定状态/标题推断任务类型。 */
function journeyIcon(session: ChatSession) {
  if (session.interviewState) return MessagesSquare;
  if (session.agentState?.offer) return Briefcase;
  const title = session.title || "";
  if (/定位|转型/.test(title)) return Compass;
  if (/评估|JD|岗位/.test(title)) return Package;
  if (/简历|提案/.test(title)) return FileText;
  return FileText;
}

/** 陈旧旅程(>3 天无更新)淡显,对应样张里的"已完结"视觉层级。 */
function isArchivedLeg(session: ChatSession): boolean {
  const updated = Date.parse(session.updatedAt || "");
  if (Number.isNaN(updated)) return false;
  return Date.now() - updated > 3 * 24 * 60 * 60 * 1000;
}

export default function SessionList({
  sessions,
  currentSessionId,
  onSelect,
  onNew,
  onDelete,
  onUndoDelete,
  onPin,
  showUndoToast,
  onOpenCommandPalette,
}: SessionListProps) {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? sessions.filter(
        (s) =>
          s.title.toLowerCase().includes(search.toLowerCase()) ||
          s.messages.some((m) => m.content.toLowerCase().includes(search.toLowerCase())),
      )
    : sessions;

  const pinnedSessions = filtered.filter((s) => s.pinned);
  const unpinnedSessions = filtered.filter((s) => !s.pinned);

  function renderItem(session: ChatSession) {
    const isActive = session.id === currentSessionId;
    const title = session.title?.trim() || "新对话";
    const Icon = journeyIcon(session);
    const archived = isArchivedLeg(session);

    return (
      <motion.div
        key={session.id}
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -12 }}
        transition={{ duration: 0.2 }}
        className={`group relative rounded-lg cursor-pointer transition-colors ${
          isActive
            ? "bg-[var(--color-surface)] border border-[var(--color-border)] shadow-[var(--shadow-sm)]"
            : "hover:bg-[var(--color-surface)]/60 border border-transparent"
        }`}
        onClick={() => onSelect(session.id!)}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 px-2.5 py-2">
          <span className="flex min-w-0 items-center gap-2.5">
            <Icon
              size={15}
              className={`flex-shrink-0 ${isActive ? "text-[var(--color-primary)]" : archived ? "text-[var(--color-muted)]" : "text-[var(--color-muted)]"}`}
            />
            <span
              className={`min-w-0 truncate text-[13px] ${
                isActive ? "font-medium text-[var(--color-text)]" : archived ? "text-[var(--color-muted)]" : "text-[var(--color-text-soft)]"
              }`}
              title={title}
            >
              {title}
              {archived ? "（已完结）" : ""}
            </span>
          </span>
          <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPin(session.id!, !session.pinned);
              }}
              className={`p-1 rounded hover:bg-[var(--color-divider)] ${
                session.pinned ? "text-[var(--color-primary)] opacity-100" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
              }`}
              title={session.pinned ? "取消置顶" : "置顶"}
              aria-label={session.pinned ? "取消置顶" : "置顶"}
            >
              <Pin size={12} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(session.id!);
              }}
              className="p-1 rounded text-[var(--color-muted)] hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/20"
              title="删除对话"
              aria-label="删除对话"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--color-divider)]">
        <span className="sec-label">求职旅程</span>
        <button
          onClick={onNew}
          className="p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-primary-soft)] text-[var(--color-primary)] transition-colors"
          title="新建对话"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="px-2.5 py-1.5">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索..."
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] pl-6 pr-2 py-1 text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)]"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--color-text)]"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 py-1 space-y-0.5">
        <AnimatePresence>
          {pinnedSessions.length > 0 && (
            <div className="mb-2">
              <span className="text-xs text-[var(--color-muted)] px-1">置顶</span>
              {pinnedSessions.map(renderItem)}
            </div>
          )}
          {unpinnedSessions.map(renderItem)}
        </AnimatePresence>

        {filtered.length === 0 && (
          <div className="text-center py-8 text-xs text-[var(--color-muted)]">
            {search ? "无匹配结果" : "暂无对话"}
          </div>
        )}
      </div>

      {onOpenCommandPalette && (
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="mt-auto flex items-center gap-2 border-t border-[var(--color-divider)] px-4 py-3 text-xs text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
        >
          <Command size={14} />
          ⌘K 唤起命令面板
        </button>
      )}

      <AnimatePresence>
        {showUndoToast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-4 left-72 bg-[var(--color-surface-raised)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2 shadow-lg flex items-center justify-between z-50 max-w-sm"
          >
            <span className="min-w-0 truncate text-xs text-[var(--color-text)]">
              已删除 · {showUndoToast.title}
            </span>
            <button
              onClick={() => onUndoDelete(showUndoToast.id)}
              className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
            >
              <Undo2 size={12} />
              撤回
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
