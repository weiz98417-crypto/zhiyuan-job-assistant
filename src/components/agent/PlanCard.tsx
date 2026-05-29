"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ListTodo, ChevronDown, ChevronRight } from "lucide-react";
import TaskItem from "./TaskItem";

export interface TaskState {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "done";
  tool?: string;
  summary?: string;
}

export interface PlanState {
  title: string;
  tasks: TaskState[];
}

interface PlanCardProps {
  plan: PlanState;
}

export default function PlanCard({ plan }: PlanCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const allDone = plan.tasks.every((t) => t.status === "done");
  const doneCount = plan.tasks.filter((t) => t.status === "done").length;
  const total = plan.tasks.length;
  const progressPct = total > 0 ? (doneCount / total) * 100 : 0;

  // Auto-collapse 3 seconds after all done
  useEffect(() => {
    if (!allDone || total === 0) return;
    const timer = setTimeout(() => setCollapsed(true), 3000);
    return () => clearTimeout(timer);
  }, [allDone, total]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden"
    >
      {/* Title bar */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-[var(--color-bg)] transition-colors"
      >
        <ListTodo size={16} className="text-[var(--color-primary)] flex-shrink-0" />
        <span className="text-sm font-medium text-[var(--color-text)] truncate">
          {plan.title || "Agent 执行计划"}
        </span>
        <span className="text-xs text-[var(--color-muted)] ml-auto flex-shrink-0">
          {doneCount}/{total} 完成
        </span>
        {collapsed ? (
          <ChevronRight size={14} className="text-[var(--color-muted)] flex-shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-[var(--color-muted)] flex-shrink-0" />
        )}
      </button>

      {/* Progress bar */}
      <div className="h-1 bg-[var(--color-divider)]">
        <motion.div
          className="h-full bg-[var(--color-primary)]"
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>

      {/* Task list */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="py-2 space-y-0.5">
              {plan.tasks.map((task) => (
                <TaskItem key={task.id} task={task} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed summary */}
      {collapsed && allDone && (
        <div className="px-4 py-2 text-xs text-[var(--color-muted)]">
          全部完成 — {plan.tasks.map((t) => t.title).join(" · ")}
        </div>
      )}
    </motion.div>
  );
}
