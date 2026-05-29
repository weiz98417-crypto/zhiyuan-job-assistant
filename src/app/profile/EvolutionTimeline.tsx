"use client";

import type { ProfileHistoryEntry } from "@/types";

interface EvolutionTimelineProps {
  history: ProfileHistoryEntry[];
}

export default function EvolutionTimeline({ history }: EvolutionTimelineProps) {
  const recent = history.slice(-10).reverse();

  return (
    <div className="relative pl-6 space-y-4">
      {/* Vertical line */}
      <div className="absolute left-2 top-2 bottom-2 w-px bg-[var(--color-divider)]" />

      {recent.map((entry, i) => (
        <div key={i} className="relative">
          {/* Dot */}
          <div
            className={`absolute -left-[22px] top-1.5 w-[9px] h-[9px] rounded-full border-2 border-[var(--color-bg)] ${
              i === 0 ? "bg-[var(--color-primary)]" : "bg-[var(--color-divider)]"
            }`}
          />
          <p className="text-xs text-[var(--color-muted)]">
            {new Date(entry.timestamp).toLocaleString("zh-CN", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="text-sm font-medium text-[var(--color-text)] mt-0.5">
            {entry.event}
          </p>
          {entry.changes.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {entry.changes.map((c, j) => (
                <li key={j} className="text-xs text-[var(--color-text-soft)]">
                  {c}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
