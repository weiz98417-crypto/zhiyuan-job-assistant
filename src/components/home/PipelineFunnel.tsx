import Link from "next/link";
import { ArrowUpRight, Check, Circle } from "lucide-react";

interface FunnelStage {
  label: string;
  count: number;
}

interface PipelineFunnelProps {
  stages: FunnelStage[];
}

export default function PipelineFunnel({ stages }: PipelineFunnelProps) {
  return (
    <section className="relative h-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[linear-gradient(145deg,var(--color-surface-raised),var(--color-surface-soft))] p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="pipeline-title">
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-[10px] font-semibold tracking-[0.2em] text-[var(--color-primary)]">THE JOURNEY</p>
          <h2 id="pipeline-title" className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--color-text)]">
            机会走到哪一步
          </h2>
          <p className="mt-1 max-w-[24rem] text-xs leading-5 text-[var(--color-muted)]">沿着真实状态看节奏，不用一条虚假的百分比替你判断。</p>
        </div>
        <Link href="/tracker" className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--color-primary)] transition-transform hover:translate-x-0.5 hover:underline">
          打开追踪 <ArrowUpRight size={13} />
        </Link>
      </div>
      <div className="relative grid grid-cols-2 gap-x-3 gap-y-6 lg:grid-cols-4 lg:gap-x-0 lg:gap-y-0">
        <div className="pointer-events-none absolute left-[12%] right-[12%] top-5 hidden h-px bg-[linear-gradient(90deg,var(--color-primary-soft),var(--color-primary),var(--color-primary-soft))] lg:block" />
        {stages.map((stage, index) => {
          const isLast = index === stages.length - 1;
          return (
            <article key={stage.label} className="relative min-w-0 lg:px-3">
              <div className="relative z-10 mb-4 flex items-center justify-between lg:justify-start">
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${stage.count > 0 ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white shadow-[0_0_0_5px_var(--color-primary-muted)]" : "border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-muted)]"}`}>
                  {stage.count > 0 ? <Check size={17} strokeWidth={2.4} /> : <Circle size={12} />}
                </span>
                <span className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.04em] text-[var(--color-text)] lg:ml-auto">{stage.count}</span>
              </div>
              <h3 className="text-sm font-semibold text-[var(--color-text)]">{stage.label}</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">{isLast ? "已经发生的确定性结果" : index === 0 ? "值得继续观察的机会" : "正在发生的推进"}</p>
              <span className={`mt-4 block h-1 w-12 rounded-full ${stage.count > 0 ? "bg-[var(--color-primary)]" : "bg-[var(--color-divider)]"}`} aria-hidden="true" />
            </article>
          );
        })}
      </div>
      <p className="mt-8 border-t border-[var(--color-divider)] pt-4 text-xs leading-5 text-[var(--color-muted)]">
        已投递包含已回复、面试中和 Offer 阶段；这里展示的是阶段数量，不把同一机会重复算进多个状态。
      </p>
    </section>
  );
}
