"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarClock, FileSearch, Send } from "lucide-react";
import { motion } from "framer-motion";
import type { HomeAction } from "./TodayFocus";

interface ActionQueueProps {
  actions: HomeAction[];
}

const icons = {
  interview: CalendarClock,
  followup: Send,
  apply: FileSearch,
  start: FileSearch,
};

export default function ActionQueue({ actions }: ActionQueueProps) {
  return (
    <section className="surface-panel rounded-[var(--radius-xl)] p-4 sm:p-5" aria-labelledby="today-actions-title">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-[var(--color-primary)]">NEXT UP</p>
          <h2 id="today-actions-title" className="mt-1 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--color-text)]">接下来要做</h2>
        </div>
        <span className="text-xs text-[var(--color-muted)]">最多显示 3 项</span>
      </div>
      {actions.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-soft)]/60 px-4 py-5 text-sm text-[var(--color-muted)]">
          今天没有逾期事项，给自己留一点探索新机会的空间。
        </div>
      ) : (
        <div className="space-y-2">
          {actions.slice(0, 3).map((action, index) => {
            const Icon = icons[action.kind];
            return (
              <motion.div
                key={action.id}
                className="group flex items-center gap-3 rounded-[var(--radius-md)] border border-transparent bg-[var(--color-surface-soft)]/65 px-3 py-3 transition-colors hover:border-[var(--color-primary-soft)] hover:bg-[var(--color-primary-muted)]"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.12 + index * 0.08, duration: 0.3 }}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-muted)] text-[var(--color-primary)]">
                  <Icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--color-text)]">{action.company} · {action.role}</p>
                  <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">{action.reason}</p>
                </div>
                <Link href={action.href} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--color-primary)] opacity-80 transition-all group-hover:opacity-100">
                  {action.actionLabel}
                  <ArrowUpRight size={13} />
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
}
