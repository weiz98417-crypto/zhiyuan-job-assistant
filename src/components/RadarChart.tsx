"use client";

import { useId } from "react";
import type { RadarScores } from "@/types";

const DIMENSIONS = [
  { key: "skillMatch" as const, label: "技能匹配" },
  { key: "experienceMatch" as const, label: "经验匹配" },
  { key: "salaryMatch" as const, label: "薪资匹配" },
  { key: "growthSpace" as const, label: "成长空间" },
  { key: "riskIndex" as const, label: "风险指数" },
];

interface RadarChartProps {
  scores: RadarScores;
  size?: number;
  className?: string;
}

export default function RadarChart({ scores, size = 280, className }: RadarChartProps) {
  const id = useId();
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const levels = 5;

  const angleSlice = (Math.PI * 2) / DIMENSIONS.length;
  const startAngle = -Math.PI / 2; // Start from top

  const getPoint = (i: number, value: number, maxR: number) => {
    const angle = startAngle + i * angleSlice;
    const ratio = Math.max(0, Math.min(1, value / 100));
    return {
      x: cx + maxR * ratio * Math.cos(angle),
      y: cy + maxR * ratio * Math.sin(angle),
    };
  };

  // Generate grid polygons
  const gridPolygons = Array.from({ length: levels }, (_, level) => {
    const points = DIMENSIONS.map((_, i) => {
      const angle = startAngle + i * angleSlice;
      const lr = r * ((level + 1) / levels);
      return `${cx + lr * Math.cos(angle)},${cy + lr * Math.sin(angle)}`;
    });
    return points.join(" ");
  });

  // Data polygon
  const dataPoints = DIMENSIONS.map((d, i) => getPoint(i, scores[d.key], r));
  const dataPolygon = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  // Axis lines
  const axisLines = DIMENSIONS.map((_, i) => {
    const angle = startAngle + i * angleSlice;
    return {
      x2: cx + r * Math.cos(angle),
      y2: cy + r * Math.sin(angle),
    };
  });

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="overflow-visible"
        aria-label="五维雷达图"
        role="img"
      >
        <defs>
          <radialGradient id={`${id}-data`} cx="50%" cy="50%">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.08} />
          </radialGradient>
        </defs>

        {/* Grid */}
        {gridPolygons.map((points, i) => (
          <polygon
            key={i}
            points={points}
            fill="none"
            stroke="var(--color-divider)"
            strokeWidth={1}
          />
        ))}

        {/* Axis lines */}
        {axisLines.map((line, i) => (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={line.x2}
            y2={line.y2}
            stroke="var(--color-divider)"
            strokeWidth={1}
          />
        ))}

        {/* Data polygon */}
        <polygon
          points={dataPolygon}
          fill={`url(#${id}-data)`}
          stroke="var(--color-primary)"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Data points */}
        {dataPoints.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={4}
            fill="var(--color-surface)"
            stroke="var(--color-primary)"
            strokeWidth={2}
          />
        ))}

        {/* Labels */}
        {DIMENSIONS.map((dim, i) => {
          const angle = startAngle + i * angleSlice;
          const lx = cx + (r + 28) * Math.cos(angle);
          const ly = cy + (r + 28) * Math.sin(angle);
          return (
            <text
              key={i}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-[var(--color-text-soft)]"
              style={{ fontSize: "12px", fontFamily: "var(--font-sans)" }}
            >
              {dim.label}
            </text>
          );
        })}

        {/* Score labels at data points */}
        {DIMENSIONS.map((dim, i) => {
          const pt = dataPoints[i];
          const score = scores[dim.key];
          return (
            <text
              key={`score-${i}`}
              x={pt.x}
              y={pt.y - 12}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-[var(--color-primary)] font-bold"
              style={{ fontSize: "11px", fontFamily: "var(--font-sans)" }}
            >
              {score}
            </text>
          );
        })}
      </svg>

      {/* Score summary below chart */}
      <div className="flex flex-wrap gap-3 justify-center mt-3">
        {DIMENSIONS.map((dim) => (
          <div key={dim.key} className="flex items-center gap-1 text-xs">
            <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] inline-block" />
            <span className="text-[var(--color-muted)]">{dim.label}</span>
            <span className="text-[var(--color-text)] font-medium">{scores[dim.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
