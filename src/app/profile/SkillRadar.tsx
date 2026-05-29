"use client";

import type { ProfileSkill } from "@/types";

interface SkillRadarProps {
  skills: ProfileSkill[];
}

export default function SkillRadar({ skills }: SkillRadarProps) {
  const displayed = skills.slice(0, 8); // max 8 vertices
  const n = displayed.length;
  if (n < 3) {
    return (
      <p className="text-sm text-[var(--color-muted)] text-center py-8">
        至少需要 3 项技能才能绘制雷达图
      </p>
    );
  }

  const cx = 140;
  const cy = 140;
  const r = 110;
  const levels = 4;

  // Compute polygon vertices
  const angleSlice = (2 * Math.PI) / n;
  const vertices = displayed.map((_, i) => {
    const angle = angleSlice * i - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  // Scale factor
  const getPoint = (i: number, value: number) => {
    const angle = angleSlice * i - Math.PI / 2;
    const dist = (value / 100) * r;
    return { x: cx + dist * Math.cos(angle), y: cy + dist * Math.sin(angle) };
  };

  // Build grid polygons for each level
  const gridPolygons: string[] = [];
  for (let l = 1; l <= levels; l++) {
    const frac = l / levels;
    const pts = displayed.map((_, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      const dist = frac * r;
      return `${(cx + dist * Math.cos(angle)).toFixed(1)},${(cy + dist * Math.sin(angle)).toFixed(1)}`;
    });
    gridPolygons.push(pts.join(" "));
  }

  // Data polygon
  const dataPts = displayed.map((s, i) => {
    const pt = getPoint(i, s.proficiency);
    return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
  });
  const dataPolygon = dataPts.join(" ");

  // Axis lines from center to each vertex
  const axisLines = vertices.map((v) => `M${cx},${cy} L${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(" ");

  return (
    <div className="flex justify-center">
      <svg viewBox="0 0 280 280" className="w-full max-w-[280px]" role="img" aria-label="技能雷达图">
        {/* Grid */}
        {gridPolygons.map((poly, i) => (
          <polygon
            key={i}
            points={poly}
            fill="none"
            stroke="var(--color-divider)"
            strokeWidth="1"
          />
        ))}
        {/* Axis lines */}
        <path d={axisLines} fill="none" stroke="var(--color-divider)" strokeWidth="1" />
        {/* Data area */}
        <polygon
          points={dataPolygon}
          fill="var(--color-primary)"
          fillOpacity="0.25"
          stroke="var(--color-primary)"
          strokeWidth="2"
        />
        {/* Data points */}
        {displayed.map((s, i) => {
          const pt = getPoint(i, s.proficiency);
          return (
            <circle
              key={i}
              cx={pt.x.toFixed(1)}
              cy={pt.y.toFixed(1)}
              r="3"
              fill="var(--color-primary)"
            />
          );
        })}
        {/* Labels */}
        {vertices.map((v, i) => {
          const skill = displayed[i];
          const labelOffsetX = v.x > cx ? 10 : v.x < cx ? -10 : 0;
          const labelOffsetY = v.y > cy ? 14 : v.y < cy ? -6 : -10;
          return (
            <text
              key={i}
              x={(v.x + labelOffsetX).toFixed(1)}
              y={(v.y + labelOffsetY).toFixed(1)}
              textAnchor={v.x > cx ? "start" : v.x < cx ? "end" : "middle"}
              className="text-[10px]"
              fill="var(--color-text-soft)"
            >
              {skill.name} ({skill.proficiency})
            </text>
          );
        })}
      </svg>
    </div>
  );
}
