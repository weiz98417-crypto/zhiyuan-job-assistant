"use client";

import { motion } from "framer-motion";
import {
  Clock,
  FileSearch,
  Send,
  MessageSquare,
  Mic,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { PaperCard } from "@/components/design";
import type { Application } from "@/types";

interface ActivityEntry {
  id: string;
  type: "evaluated" | "applied" | "interview" | "practice" | "offer" | "rejected";
  company: string;
  role: string;
  timestamp: Date;
  href?: string;
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

const typeConfig: Record<string, { icon: typeof Clock; label: string; color: string }> = {
  evaluated: { icon: FileSearch, label: "评估完成", color: "text-[var(--color-primary)]" },
  applied: { icon: Send, label: "已投递", color: "text-indigo-500" },
  interview: { icon: MessageSquare, label: "面试安排", color: "text-amber-500" },
  practice: { icon: Mic, label: "练习完成", color: "text-purple-500" },
  offer: { icon: CheckCircle2, label: "获得 Offer", color: "text-emerald-500" },
  rejected: { icon: FileText, label: "已拒绝", color: "text-gray-400" },
};

interface RecentActivityProps {
  activities: ActivityEntry[];
}

export default function RecentActivity({ activities }: RecentActivityProps) {
  if (activities.length === 0) {
    return (
      <PaperCard padding="md">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={16} className="text-[var(--color-muted)]" />
          <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] text-sm">
            最近动态
          </h3>
        </div>
        <div className="text-center py-6">
          <p className="text-sm text-[var(--color-muted)]">
            最近还没有活动——去评估你的第一个 JD 吧
          </p>
        </div>
      </PaperCard>
    );
  }

  return (
    <PaperCard padding="md">
      <div className="flex items-center gap-2 mb-3">
        <Clock size={16} className="text-[var(--color-muted)]" />
        <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] text-sm">
          最近动态
        </h3>
      </div>

      <div className="space-y-0">
        {activities.map((activity, i) => {
          const config = typeConfig[activity.type] ?? typeConfig.evaluated;
          const Icon = config.icon;
          return (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div className="flex items-center gap-3 py-2 px-1">
                {/* Timeline dot + line */}
                <div className="relative flex flex-col items-center">
                  <Icon size={14} className={`shrink-0 ${config.color}`} />
                  {i < activities.length - 1 && (
                    <div className="w-px h-full absolute top-4 bg-[var(--color-divider)]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--color-text)] truncate">
                    {activity.company} — {activity.role}
                  </p>
                  <p className="text-[10px] text-[var(--color-muted)]">
                    {config.label}
                  </p>
                </div>
                <span className="text-[10px] text-[var(--color-muted)] shrink-0">
                  {relativeTime(activity.timestamp)}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </PaperCard>
  );
}

export type { ActivityEntry };
