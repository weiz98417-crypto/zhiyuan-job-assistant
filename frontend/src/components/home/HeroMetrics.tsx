"use client";

import { PaperCard } from "@/components/design";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricItem {
  label: string;
  value: string;
  trend?: number; // positive = up, negative = down, 0 = flat
  trendLabel?: string;
}

interface HeroMetricsProps {
  evaluated: number;
  applied: number;
  interviewing: number;
  offers: number;
  avgScore: number;
  /** Previous week counts for trend calculation */
  prevEvaluated?: number;
  prevApplied?: number;
  prevInterviewing?: number;
  prevOffers?: number;
  prevAvgScore?: number;
}

function calcTrend(current: number, previous?: number): number | undefined {
  if (previous === undefined || previous === 0) return undefined;
  return current - previous;
}

function TrendBadge({ trend }: { trend?: number }) {
  if (trend === undefined) return null;
  if (trend > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-[var(--color-success)]">
        <TrendingUp size={12} />↑{trend}
      </span>
    );
  }
  if (trend < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-[var(--color-warning)]">
        <TrendingDown size={12} />↓{Math.abs(trend)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-[var(--color-muted)]">
      <Minus size={12} />持平
    </span>
  );
}

export default function HeroMetrics({
  evaluated,
  applied,
  interviewing,
  offers,
  avgScore,
  prevEvaluated,
  prevApplied,
  prevInterviewing,
  prevOffers,
  prevAvgScore,
}: HeroMetricsProps) {
  const isEmpty = evaluated === 0 && applied === 0 && interviewing === 0 && offers === 0;

  const metrics: MetricItem[] = [
    { label: "已评估", value: isEmpty ? "—" : String(evaluated), trend: calcTrend(evaluated, prevEvaluated) },
    { label: "已投递", value: isEmpty ? "—" : String(applied), trend: calcTrend(applied, prevApplied) },
    { label: "面试中", value: isEmpty ? "—" : String(interviewing), trend: calcTrend(interviewing, prevInterviewing) },
    { label: "Offer", value: isEmpty ? "—" : String(offers), trend: calcTrend(offers, prevOffers) },
    { label: "平均匹配分", value: isEmpty ? "—" : avgScore > 0 ? avgScore.toFixed(1) : "—", trend: avgScore > 0 ? calcTrend(avgScore, prevAvgScore) : undefined },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {metrics.map((m) => (
        <PaperCard key={m.label} padding="sm">
          <p className="text-xs text-[var(--color-muted)] mb-1.5">{m.label}</p>
          <p className="font-[family-name:var(--font-display)] text-xl lg:text-2xl font-bold text-[var(--color-text)]">
            {m.value}
          </p>
          {m.trend !== undefined && (
            <div className="mt-1">
              <TrendBadge trend={m.trend} />
            </div>
          )}
        </PaperCard>
      ))}
    </div>
  );
}
