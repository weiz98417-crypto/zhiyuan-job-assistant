"use client";

import { motion } from "framer-motion";
import { Activity, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { PaperCard } from "@/components/design";
import type { HealthCheck } from "@/types";

interface StageCount {
  label: string;
  count: number;
  color: string;
}

function buildStageCounts(
  evaluated: number,
  applied: number,
  responded: number,
  interview: number,
  offer: number,
): StageCount[] {
  return [
    { label: "已评估", count: evaluated, color: "var(--color-primary)" },
    { label: "已投递", count: applied, color: "#6366f1" },
    { label: "已回复", count: responded, color: "#f59e0b" },
    { label: "面试中", count: interview, color: "#8b5cf6" },
    { label: "已Offer", count: offer, color: "#10b981" },
  ];
}

interface PipelineHealthPanelProps {
  health: HealthCheck | null;
  evaluated: number;
  applied: number;
  responded: number;
  interview: number;
  offer: number;
  total: number;
}

export default function PipelineHealthPanel({
  health,
  evaluated,
  applied,
  responded,
  interview,
  offer,
  total,
}: PipelineHealthPanelProps) {
  if (total === 0) {
    return (
      <PaperCard padding="md">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-[var(--color-muted)]" />
          <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] text-sm">
            Pipeline 健康
          </h3>
        </div>
        <div className="text-center py-6 space-y-2">
          <Info size={24} className="text-[var(--color-muted)] mx-auto" />
          <p className="text-sm text-[var(--color-muted)]">开始评估你的第一个 JD 吧</p>
        </div>
      </PaperCard>
    );
  }

  const stages = buildStageCounts(evaluated, applied, responded, interview, offer);
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  const statusConfig = {
    green: { icon: CheckCircle2, color: "bg-emerald-500", text: "text-emerald-700", label: "健康" },
    yellow: { icon: AlertTriangle, color: "bg-amber-400", text: "text-amber-700", label: "注意" },
    red: { icon: AlertTriangle, color: "bg-red-500", text: "text-red-700", label: "警告" },
    gray: { icon: Info, color: "bg-gray-300", text: "text-gray-500", label: "无数据" },
  };

  const sc = statusConfig[health?.status ?? "gray"];
  const StatusIcon = sc.icon;

  return (
    <PaperCard padding="md">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={16} className="text-[var(--color-primary)]" />
        <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] text-sm">
          Pipeline 健康
        </h3>
        {health && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${sc.color}`} />
            <span className={`text-xs font-medium ${sc.text}`}>{sc.label}</span>
          </div>
        )}
      </div>

      {/* Mini Funnel SVG */}
      <div className="flex justify-center mb-3">
        <svg width="200" height="100" viewBox="0 0 200 100">
          {stages.map((stage, i) => {
            const ratio = stage.count / maxCount;
            const topWidth = 160 * (i === 0 ? 1 : stages[i - 1].count / maxCount);
            const bottomWidth = 160 * ratio;
            const y = i * 20;
            const leftX = (200 - topWidth) / 2;
            const rightX = (200 + topWidth) / 2;
            const bottomLeftX = (200 - bottomWidth) / 2;
            const bottomRightX = (200 + bottomWidth) / 2;

            return (
              <g key={stage.label}>
                <polygon
                  points={`${leftX},${y} ${rightX},${y} ${bottomRightX},${y + 16} ${bottomLeftX},${y + 16}`}
                  fill={stage.color}
                  opacity={0.3 + i * 0.1}
                  stroke={stage.color}
                  strokeWidth="1"
                />
                <text
                  x="10"
                  y={y + 11}
                  fontSize="8"
                  fill="var(--color-muted)"
                  textAnchor="start"
                >
                  {stage.label}
                </text>
                <text
                  x="190"
                  y={y + 11}
                  fontSize="9"
                  fontWeight="bold"
                  fill="var(--color-text)"
                  textAnchor="end"
                >
                  {stage.count}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Score & Issues */}
      {health && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-2"
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[var(--color-muted)]">综合评分</span>
            <span className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] text-lg">
              {health.score}
            </span>
            <span className="text-[var(--color-muted)]">/100</span>
          </div>

          {health.issues.length > 0 && (
            <div className="space-y-1">
              {health.issues.map((issue, i) => (
                <p key={i} className="text-xs text-[var(--color-text-soft)] flex items-start gap-1">
                  <StatusIcon size={10} className={`mt-0.5 shrink-0 ${sc.text}`} />
                  {issue}
                </p>
              ))}
            </div>
          )}

          {health.suggestions.length > 0 && (
            <div className="border-t border-[var(--color-divider)] pt-2 mt-2">
              {health.suggestions.slice(0, 2).map((s, i) => (
                <p key={i} className="text-xs text-[var(--color-primary)] flex items-start gap-1">
                  <TrendingUp size={10} className="mt-0.5 shrink-0" />
                  {s}
                </p>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </PaperCard>
  );
}
