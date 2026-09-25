"use client";

/**
 * 对话脸阶段轨道(0.11.0-D 样张 v2:✓理解 / ●执行 / 校验 / 回应 + 判据 n/m)。
 *
 * 数据源是 0.11.0-B 事件方言:phase 事件驱动阶段,step.started/finished 的
 * criteriaDone/criteriaTotal 驱动判据计数(page.tsx 已消费为 programProgress)。
 * 仅在 Run 活跃时渲染,静止的对话脸保持安静。
 */

import type { AgentPhase } from "../assistant-chat";

const STAGES: Array<{ label: string; phases: readonly string[] }> = [
  {
    label: "理解",
    phases: ["understanding", "compressing_context", "extracting_ocr", "extracting_jd", "jd_extracted", "detecting_archetype", "archetype_detected"],
  },
  { label: "执行", phases: ["executing"] },
  { label: "校验", phases: ["verifying", "reflecting"] },
  { label: "回应", phases: ["responding"] },
];

export interface AgentPhaseTrackProps {
  phase: AgentPhase;
  streaming: boolean;
  criteria?: { done: number; total: number } | null;
}

export default function AgentPhaseTrack({ phase, streaming, criteria }: AgentPhaseTrackProps) {
  if (!streaming || !phase || phase === "done") return null;

  const activeIndex = STAGES.findIndex((stage) => stage.phases.includes(phase));
  if (activeIndex === -1) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-divider)] px-1 pb-2 text-xs">
      {STAGES.map((stage, index) => {
        const isActive = index === activeIndex;
        const isDone = index < activeIndex;
        return (
          <span
            key={stage.label}
            className={`rounded-full px-3 py-0.5 ${
              isActive
                ? "bg-[var(--color-primary-soft)] font-medium text-[var(--color-primary-hover)] dark:text-[var(--color-primary)]"
                : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]"
            }`}
          >
            {isDone ? "✓ " : isActive ? "● " : ""}
            {stage.label}
          </span>
        );
      })}
      {criteria && criteria.total > 0 && (
        <span className="ml-auto text-[var(--color-muted)]">
          判据 {criteria.done}/{criteria.total}
        </span>
      )}
    </div>
  );
}
