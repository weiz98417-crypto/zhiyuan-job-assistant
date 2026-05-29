"use client";

import { motion } from "framer-motion";
import { Loader2, Check, Square } from "lucide-react";
import type { TaskState } from "./PlanCard";

export type { TaskState };

interface TaskItemProps {
  task: TaskState;
}

export default function TaskItem({ task }: TaskItemProps) {
  const { status, title, summary } = task;

  return (
    <motion.div
      layout
      className={`flex items-start gap-3 px-3 py-2 rounded-[var(--radius-sm)] transition-colors ${
        status === "in_progress" ? "bg-[var(--color-primary-muted)]" : ""
      }`}
    >
      {/* Status icon */}
      <div className="flex-shrink-0 mt-0.5">
        {status === "pending" && (
          <Square size={16} className="text-[var(--color-muted)]" />
        )}
        {status === "in_progress" && (
          <Loader2 size={16} className="animate-spin text-[var(--color-primary)]" />
        )}
        {status === "done" && (
          <motion.div
            initial={{ scale: 1.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Check size={16} className="text-green-500" />
          </motion.div>
        )}
      </div>

      {/* Title + summary */}
      <div className="flex-1 min-w-0">
        <span
          className={`text-sm ${
            status === "in_progress"
              ? "font-semibold text-[var(--color-text)]"
              : status === "done"
                ? "text-[var(--color-text-soft)]"
                : "text-[var(--color-muted)]"
          }`}
        >
          {title}
        </span>

        {status === "done" && summary && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="text-xs text-[var(--color-muted)] mt-0.5 line-clamp-2"
          >
            {summary}
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}
