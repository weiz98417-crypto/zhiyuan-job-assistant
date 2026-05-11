"use client";

import type { ProfilePreferences } from "@/types";

interface PreferenceBarsProps {
  preferences: ProfilePreferences;
}

function BarRow({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--color-text-soft)] w-20 shrink-0">{label}</span>
      <div className="flex-1 h-3 bg-[var(--color-bg)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.max(2, pct)}%`,
            background: `oklch(75% 0.12 ${55 + pct * 0.3})`,
          }}
        />
      </div>
      <span className="text-xs text-[var(--color-muted)] w-10 text-right">{pct}%</span>
    </div>
  );
}

export default function PreferenceBars({ preferences }: PreferenceBarsProps) {
  const { companySize, industry, workStyle } = preferences;

  const sizeEntries = [
    { label: "大厂", value: companySize.large },
    { label: "中小企业", value: companySize.sme },
    { label: "初创", value: companySize.startup },
  ].filter((e) => e.value > 0);

  const industryEntries = Object.entries(industry)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([k, v]) => ({ label: k, value: v }));

  const workEntries = Object.entries(workStyle)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ label: k, value: v }));

  const hasData = sizeEntries.length > 0 || industryEntries.length > 0 || workEntries.length > 0;

  if (!hasData) {
    return (
      <p className="text-sm text-[var(--color-muted)] text-center py-8">
        完成更多评估后，偏好数据将逐渐显现
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {sizeEntries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--color-muted)]">公司规模偏好</p>
          {sizeEntries.map((e) => (
            <BarRow key={e.label} label={e.label} value={e.value} />
          ))}
        </div>
      )}
      {industryEntries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--color-muted)]">行业偏好</p>
          {industryEntries.map((e) => (
            <BarRow key={e.label} label={e.label} value={e.value} />
          ))}
        </div>
      )}
      {workEntries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--color-muted)]">工作方式</p>
          {workEntries.map((e) => (
            <BarRow key={e.label} label={e.label} value={e.value} />
          ))}
        </div>
      )}
    </div>
  );
}
