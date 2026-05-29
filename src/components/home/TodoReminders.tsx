"use client";

import { PaperCard } from "@/components/design";
import { Send, Calendar, FileSearch, Wind } from "lucide-react";
import Link from "next/link";

interface TodoItem {
  type: "followup" | "interview" | "apply";
  message: string;
  company: string;
  role: string;
  daysAgo?: number;
  linkTo: string;
}

interface TodoRemindersProps {
  applications: {
    company: string;
    role: string;
    status: string;
    date: string;
    updatedAt: string;
  }[];
  interviews: {
    company: string;
    role: string;
    date: string;
  }[];
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function TodoReminders({ applications, interviews }: TodoRemindersProps) {
  const todos: TodoItem[] = [];

  // 1. Follow-up: status="interview" and last updated > 3 days
  for (const app of applications) {
    if (app.status === "interview") {
      const since = daysSince(app.updatedAt);
      if (since > 3) {
        todos.push({
          type: "followup",
          message: `面试后 ${since} 天未跟进`,
          company: app.company,
          role: app.role,
          daysAgo: since,
          linkTo: "/tracker",
        });
      }
    }
  }

  // 2. Upcoming interviews: next 7 days
  for (const iv of interviews) {
    const until = daysUntil(iv.date);
    if (until >= 0 && until <= 7) {
      todos.push({
        type: "interview",
        message: until === 0 ? "今天有面试" : `${until} 天后有面试`,
        company: iv.company,
        role: iv.role,
        linkTo: "/interview",
      });
    }
  }

  // 3. Stale evaluations: status="evaluated" and > 7 days without applying
  for (const app of applications) {
    if (app.status === "evaluated" || app.status === "evaluated") {
      const since = daysSince(app.date);
      if (since > 7) {
        todos.push({
          type: "apply",
          message: `评估后 ${since} 天未投递`,
          company: app.company,
          role: app.role,
          daysAgo: since,
          linkTo: "/tracker",
        });
      }
    }
  }

  // Limit to 5
  const display = todos.slice(0, 5);

  const iconMap = {
    followup: <Send size={16} className="text-[var(--color-primary)]" />,
    interview: <Calendar size={16} className="text-[var(--color-primary)]" />,
    apply: <FileSearch size={16} className="text-[var(--color-primary)]" />,
  };

  return (
    <PaperCard padding="md">
      <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-[var(--color-text)] mb-3">
        待办提醒
      </h2>

      {display.length === 0 ? (
        <div className="flex items-center gap-2 py-2 text-sm text-[var(--color-muted)]">
          <Wind size={16} />
          <span>暂无待办，一切顺利</span>
        </div>
      ) : (
        <div className="space-y-2">
          {display.map((todo, i) => (
            <Link key={i} href={todo.linkTo} className="block">
              <div className="flex items-center gap-3 py-2 px-3 rounded-[var(--radius-sm)] hover:bg-[var(--color-primary-muted)] transition-colors group">
                <div className="flex-shrink-0 mt-0.5">{iconMap[todo.type]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors truncate">
                    {todo.message}
                  </p>
                  <p className="text-xs text-[var(--color-muted)] truncate">
                    {todo.company} — {todo.role}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PaperCard>
  );
}
