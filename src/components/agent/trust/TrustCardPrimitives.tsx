"use client";

/**
 * 信任卡原语套件(spec 33):档位徽章/三态徽章/证据展开/降级标注/确认按钮/来源卡。
 * 只渲染既有字段与既定语义,不在卡内新增计算或话术;视觉走纸鸢令牌
 * (color / surface / radius CSS 变量),动效仅 framer-motion opacity/layout。
 */

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";

/** 卡片容器:替换各卡自带的 COMPACT_CARD_CLASS 局部常量。 */
export function TrustCardFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs space-y-2 ${className}`}>
      {children}
    </div>
  );
}

/** 档位徽章:主显锚定词 + N/4。 */
export function BandBadge({ label, band, muted = false }: { label: string; band: number; muted?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 ${muted ? "text-[var(--color-muted)]" : "text-[var(--color-text)] font-medium"}`}>
      {label} <span className="tabular-nums">{band}/4</span>
    </span>
  );
}

/** 三态徽章(不会/没说清/简历没写);空态不渲染。 */
export function StateChip({ state }: { state: string | null }) {
  if (!state) return null;
  return (
    <span className="px-1.5 py-px rounded-full text-[10px] bg-[var(--surface-soft)] text-[var(--color-muted)]">
      {state}
    </span>
  );
}

/** 可展开证据区(展开动作由调用方埋点);motion 只做 opacity,遵循 reduced-motion 由库默认处理。 */
export function ExpandableEvidence({
  expanded,
  onToggle,
  children,
  label = "查看评分依据",
}: {
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  label?: string;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline"
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {label}
      </button>
      {expanded ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-1.5 border-t border-[var(--color-border)] pt-2"
        >
          {children}
        </motion.div>
      ) : null}
    </div>
  );
}

/** 「仅供参考」降级徽章 + 可选原因行(软门 advisory 语义;渲染既有字段)。 */
export function AdvisoryBadge({ reason }: { reason?: string }) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 self-start px-1.5 py-px rounded-full text-[10px] bg-[var(--surface-soft)] text-[var(--color-muted)] border border-[var(--color-border)]">
        仅供参考
      </span>
      {reason ? <span className="text-[10px] text-[var(--color-muted)]">{reason}</span> : null}
    </span>
  );
}

/** 确认按钮三态:待确认 / 确认中 / 已确认;错误由调用方渲染。 */
export function ConfirmButton({
  confirmed,
  confirming,
  onConfirm,
  label = "确认入账",
  confirmedLabel = "已确认入账",
}: {
  confirmed: boolean;
  confirming: boolean;
  onConfirm: () => void;
  label?: string;
  confirmedLabel?: string;
}) {
  if (confirmed) {
    return (
      <p className="inline-flex items-center gap-1 text-[var(--color-primary)]">
        <Check size={12} /> {confirmedLabel}
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={onConfirm}
      disabled={confirming}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-[var(--color-primary)] text-white disabled:opacity-50"
    >
      <Check size={11} /> {confirming ? "确认中…" : label}
    </button>
  );
}

/** 忽略提示行(确认卡等场景的次级动作说明)。 */
export function DismissHint({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[var(--color-muted)]">
      <X size={11} /> {children}
    </span>
  );
}

/** 来源卡:渲染既有来源字段;stale 时附加「方向参考」降级说明(仅提示,不改数值)。 */
export function SourceCard({
  label,
  value,
  stale = false,
  staleHint = "该数据已过时效,仅作方向参考,不构成谈判数字。",
}: {
  label: string;
  value?: string | null;
  stale?: boolean;
  staleHint?: string;
}) {
  if (!value) return null;
  return (
    <div className="inline-flex flex-wrap items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px]">
      <span className="text-[var(--color-muted)]">{label}:</span>
      <span className="text-[var(--color-text)]">{value}</span>
      {stale ? <span className="text-[10px] text-[var(--color-muted)]">· {staleHint}</span> : null}
    </div>
  );
}
