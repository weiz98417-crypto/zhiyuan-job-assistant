"use client";

/**
 * 上岸时刻(0.11.0-D 样张 v2 任务 5.1)。
 *
 * 排版与朱砂构建的庆祝态——不用表情符号。当一段投递旅程走到
 * 「已获 Offer」时在投递追踪页呈现;点赞的骄傲留给文字。
 */

import { useEffect, useRef } from "react";
import { Mountain } from "lucide-react";

export interface LandingCelebrationProps {
  company: string;
  role: string;
  onClose: () => void;
}

export default function LandingCelebration({ company, role, onClose }: LandingCelebrationProps) {
  // 12s 自动淡出;计时经 ref 锁定首挂载,父组件重渲染不重置。
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const timer = window.setTimeout(() => closeRef.current(), 12000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      data-testid="landing-celebration"
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-6 z-50 mx-auto w-[min(480px,calc(100vw-2rem))]"
    >
      <div
        className="rounded-2xl border p-6 text-center"
        style={{
          background: "linear-gradient(160deg, var(--color-primary-soft), var(--color-bg))",
          borderColor: "var(--color-primary-soft)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <Mountain size={28} className="mx-auto mb-2 text-[var(--color-primary-hover)]" />
        <div className="font-[family-name:var(--font-display)] text-3xl text-[var(--color-primary-hover)]">
          上岸 · Offer 已确认
        </div>
        <div className="mt-1 text-sm text-[var(--color-text)]">
          {company} · {role}
        </div>
        <div className="mt-2 text-xs text-[var(--color-muted)]">
          旅程已归档 · 简历快照与评估记录永久可查
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5 text-xs font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-soft)]"
        >
          收下这份喜悦
        </button>
      </div>
    </div>
  );
}
