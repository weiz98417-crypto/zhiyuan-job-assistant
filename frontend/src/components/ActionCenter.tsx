"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Zap,
  FileSearch,
  Calendar,
  Bell,
  Coffee,
  ArrowRight,
} from "lucide-react";
import { PaperCard } from "@/components/design";
import type { Application, InterviewSchedule } from "@/types";

interface ActionItem {
  id: string;
  icon: typeof Zap;
  label: string;
  description: string;
  href: string;
  urgency: "now" | "soon" | "later";
}

interface ActionCenterProps {
  applications: Application[];
  interviews: InterviewSchedule[];
}

export default function ActionCenter({ applications, interviews }: ActionCenterProps) {
  const actions: ActionItem[] = [];

  // Pending evaluations: Evaluated but not yet applied
  const pendingEval = applications.filter((a) => a.status === "evaluated");
  if (pendingEval.length > 0) {
    actions.push({
      id: "pending-eval",
      icon: FileSearch,
      label: "待投递评估",
      description: `有 ${pendingEval.length} 个评估完的岗位，选择感兴趣的投递`,
      href: "/tracker",
      urgency: pendingEval.length > 5 ? "now" : "soon",
    });
  }

  // Upcoming interviews within 48 hours
  const now = new Date();
  const soonInterviews = interviews.filter((iv) => {
    const ivDate = new Date(iv.date);
    const diffMs = ivDate.getTime() - now.getTime();
    return diffMs > 0 && diffMs < 48 * 3600000;
  });
  if (soonInterviews.length > 0) {
    const next = soonInterviews[0];
    const timeStr = next.time ? ` ${next.time}` : "";
    actions.push({
      id: "upcoming-interview",
      icon: Calendar,
      label: "即将面试",
      description: `${next.date}${timeStr} 有 ${next.company} 的面试——去准备页练习`,
      href: "/interview",
      urgency: "now",
    });
  }

  // Any interviews upcoming (beyond 48h)
  const futureInterviews = interviews.filter((iv) => new Date(iv.date) >= now);
  if (futureInterviews.length > soonInterviews.length) {
    actions.push({
      id: "future-interview",
      icon: Calendar,
      label: "面试准备",
      description: `还有 ${futureInterviews.length - soonInterviews.length} 场面试待准备`,
      href: "/interview",
      urgency: "soon",
    });
  }

  // Overdue follow-ups (>7 days since applied, no recent activity)
  const overdueFollowUps = applications.filter((a) => {
    if (!["applied", "responded"].includes(a.status)) return false;
    const updated = new Date(a.updatedAt);
    const diffDays = (now.getTime() - updated.getTime()) / 86400000;
    return diffDays > 7;
  });
  if (overdueFollowUps.length > 0) {
    const sample = overdueFollowUps[0];
    const days = Math.round((now.getTime() - new Date(sample.updatedAt).getTime()) / 86400000);
    actions.push({
      id: "overdue-followup",
      icon: Bell,
      label: "逾期跟进",
      description: `${sample.company} 的申请已投递 ${days} 天，建议跟进`,
      href: "/tracker",
      urgency: "now",
    });
  }

  const urgencyColor = {
    now: "text-red-500",
    soon: "text-amber-500",
    later: "text-[var(--color-muted)]",
  };

  return (
    <PaperCard padding="md">
      <div className="flex items-center gap-2 mb-3">
        <Zap size={16} className="text-[var(--color-primary)]" />
        <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] text-sm">
          待处理
        </h3>
      </div>

      {actions.length === 0 ? (
        <div className="text-center py-4">
          <Coffee size={20} className="text-[var(--color-muted)] mx-auto mb-2" />
          <p className="text-sm text-[var(--color-muted)]">
            一切尽在掌握——去探索页和 AI 聊聊职业规划？
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <motion.div
                key={action.id}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <Link
                  href={action.href}
                  className="flex items-start gap-2.5 p-2 rounded-[var(--radius-sm)] hover:bg-[var(--color-primary-muted)] transition-colors group"
                >
                  <Icon size={14} className={`mt-0.5 shrink-0 ${urgencyColor[action.urgency]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors">
                      {action.label}
                    </p>
                    <p className="text-xs text-[var(--color-text-soft)] truncate">
                      {action.description}
                    </p>
                  </div>
                  <ArrowRight size={12} className="text-[var(--color-muted)] mt-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </PaperCard>
  );
}
