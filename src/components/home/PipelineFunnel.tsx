import { PaperCard } from "@/components/design";

interface FunnelStage {
  label: string;
  count: number;
}

interface PipelineFunnelProps {
  stages: FunnelStage[];
}

function calcWidth(count: number, max: number): number {
  if (max === 0) return 8; // minimum visible bar
  return Math.max(8, (count / max) * 100);
}

export default function PipelineFunnel({ stages }: PipelineFunnelProps) {
  const max = Math.max(...stages.map((s) => s.count), 1);

  return (
    <PaperCard padding="md" className="h-full">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--color-text)]">
            机会走到哪一步
          </h2>
          <p className="mt-1 text-xs text-[var(--color-muted)]">每项数字按独立状态统计，避免重复计算。</p>
        </div>
        <span className="text-xs text-[var(--color-primary)]">管线节奏</span>
      </div>
      <div className="space-y-3">
        {stages.map((stage, i) => {
          const w = calcWidth(stage.count, max);

          return (
            <div key={stage.label} className="flex items-center gap-3">
              <span className="w-16 text-xs text-[var(--color-muted)] flex-shrink-0 text-right">
                {stage.label}
              </span>
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <div
                  className="h-7 rounded-full bg-[var(--color-primary)] transition-all duration-700 ease-out"
                  style={{
                    width: `${w}%`,
                    opacity: 0.15 + (i / stages.length) * 0.55,
                    background: `linear-gradient(90deg, var(--color-primary-soft), var(--color-primary))`,
                  }}
                />
              </div>
              <span className="w-8 text-xs font-medium text-[var(--color-text)] text-right flex-shrink-0">
                {stage.count}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-4 border-t border-[var(--color-divider)] pt-3 text-xs leading-5 text-[var(--color-muted)]">
        已投递包含已回复、面试中和 Offer 阶段；没有独立的“已发现”数据时不展示虚构阶段。
      </p>
    </PaperCard>
  );
}
