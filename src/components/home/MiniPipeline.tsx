"use client";

import Link from "next/link";
import { PaperCard } from "@/components/design";
import type { ApplicationStatus } from "@/types";
import { STATUS_LABELS } from "@/types";

const DISPLAY_STATUSES: { status: ApplicationStatus; color: string }[] = [
  { status: "evaluated", color: "var(--color-primary)" },
  { status: "applied", color: "var(--color-primary-soft)" },
  { status: "interview", color: "var(--color-warning)" },
  { status: "offer", color: "var(--color-success)" },
  { status: "discarded", color: "var(--color-muted)" },
];

interface MiniPipelineProps {
  counts: Partial<Record<ApplicationStatus, number>>;
}

export default function MiniPipeline({ counts }: MiniPipelineProps) {
  const total = Object.values(counts).reduce((sum, c) => sum + (c || 0), 0);
  if (total === 0) {
    return (
      <PaperCard padding="md">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-[var(--color-text)] mb-2">
          管线总览
        </h2>
        <p className="text-sm text-[var(--color-muted)] py-2">暂无投递记录，评估第一份 JD 开始追踪</p>
      </PaperCard>
    );
  }

  return (
    <PaperCard padding="md">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-[var(--color-text)]">
          管线总览
        </h2>
        <Link
          href="/tracker"
          className="text-xs text-[var(--color-primary)] hover:underline"
        >
          查看全部
        </Link>
      </div>
      <div className="flex gap-2 flex-wrap">
        {DISPLAY_STATUSES.map(({ status, color }) => {
          const count = counts[status] || 0;
          if (count === 0 && status !== "evaluated") return null;
          return (
            <Link
              key={status}
              href={`/tracker?status=${status}`}
              className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-bg)] hover:bg-[var(--color-primary-muted)] transition-colors"
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs text-[var(--color-text-soft)]">
                {STATUS_LABELS[status]}
              </span>
              <span className="text-xs font-semibold text-[var(--color-text)]">
                {count}
              </span>
            </Link>
          );
        })}
      </div>
    </PaperCard>
  );
}
