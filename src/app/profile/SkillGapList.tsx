"use client";

import type { SkillGapItem } from "@/types";

interface SkillGapListProps {
  gaps: SkillGapItem[];
}

function demandLabel(d: number): string {
  if (d >= 70) return "高需求";
  if (d >= 40) return "中等需求";
  return "低需求";
}

export default function SkillGapList({ gaps }: SkillGapListProps) {
  const sorted = [...gaps].sort((a, b) => b.gap - a.gap);

  return (
    <div className="space-y-3">
      {sorted.map((gap, i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-[var(--color-text)]">{gap.skill}</span>
            <span className="text-xs text-[var(--color-muted)]">{demandLabel(gap.demand)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-primary)]"
                style={{ width: `${Math.min(100, gap.myLevel)}%` }}
              />
            </div>
            <span className="text-xs text-[var(--color-text-soft)] w-8 text-right">
              {gap.myLevel}
            </span>
          </div>
          <p className="text-xs text-[var(--color-muted)]">
            差距 {gap.gap} 分 — 市场需求 {gap.demand} 分
          </p>
        </div>
      ))}
    </div>
  );
}
