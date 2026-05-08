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

function calcConversion(current: number, previous: number): string {
  if (previous === 0) return "—";
  return `${Math.round((current / previous) * 100)}%`;
}

export default function PipelineFunnel({ stages }: PipelineFunnelProps) {
  const max = Math.max(...stages.map((s) => s.count), 1);

  return (
    <PaperCard padding="md">
      <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-[var(--color-text)] mb-4">
        转化漏斗
      </h2>
      <div className="space-y-3">
        {stages.map((stage, i) => {
          const w = calcWidth(stage.count, max);
          const prevCount = i > 0 ? stages[i - 1].count : stage.count;
          const conversion = i > 0 ? calcConversion(stage.count, prevCount) : null;

          return (
            <div key={stage.label} className="flex items-center gap-3">
              {/* Label */}
              <span className="w-16 text-xs text-[var(--color-muted)] flex-shrink-0 text-right">
                {stage.label}
              </span>
              {/* Bar */}
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
              {/* Count */}
              <span className="w-8 text-xs font-medium text-[var(--color-text)] text-right flex-shrink-0">
                {stage.count}
              </span>
              {/* Conversion */}
              {conversion !== null && (
                <span className="w-10 text-xs text-[var(--color-muted)] flex-shrink-0 text-right">
                  {conversion}
                </span>
              )}
              {i === 0 && <span className="w-10 flex-shrink-0" />}
            </div>
          );
        })}
      </div>
    </PaperCard>
  );
}
