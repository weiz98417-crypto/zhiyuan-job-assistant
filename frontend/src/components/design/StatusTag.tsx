"use client";

import type { ApplicationStatus } from "@/types";
import { STATUS_LABELS } from "@/types";

interface StatusTagProps {
  status: ApplicationStatus;
  onClick?: () => void;
  size?: "sm" | "md";
  interactive?: boolean;
}

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  evaluated: "bg-[var(--color-primary-muted)] text-[var(--color-text-soft)]",
  applied: "bg-[var(--color-primary-soft)] text-[var(--color-text)]",
  responded: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  interview: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  offer: "bg-[var(--color-primary)] text-[var(--color-surface-raised)]",
  rejected: "bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-300",
  discarded: "bg-[var(--color-divider)] text-[var(--color-muted)]",
  skip: "bg-[var(--color-divider)] text-[var(--color-muted)]",
};

export default function StatusTag({
  status,
  onClick,
  size = "md",
  interactive = false,
}: StatusTagProps) {
  const sizes = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-3 py-1",
  };

  const className = [
    "inline-flex items-center rounded-[var(--radius-sm)] font-[family-name:var(--font-body)] font-medium transition-colors duration-[var(--duration-fast)]",
    STATUS_COLORS[status],
    sizes[size],
    interactive || onClick ? "cursor-pointer hover:opacity-80" : "",
  ].join(" ");

  return (
    <span className={className} onClick={onClick}>
      {STATUS_LABELS[status]}
    </span>
  );
}
