"use client";

/**
 * WorkbenchKit(0.12.0 e-workbench-shell 任务 4.1)。
 *
 * 工作台页的公共装配件:页头 / 筛选 chips / 空态 / 结果网格。
 * 消灭五个工作台各自的重复实现;命名沿用 CONTEXT.md 领域词
 * (工作台 / 岗位发现 / 结果卡)。
 */

import * as React from "react";
import { cn } from "./index";

/* ── PageHeader:标题 + 描述 + 右侧动作区 ── */

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)]">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ── FilterChips:单选筛选行 ── */

export interface FilterChipOption<T extends string> {
  value: T;
  label: string;
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel = "筛选",
}: {
  options: Array<FilterChipOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn("flex flex-wrap items-center gap-2", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            value === option.value
              ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-hover)] dark:text-[var(--color-primary)]"
              : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-text)]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ── EmptyState:统一空态 ── */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("py-16 text-center", className)}>
      {icon && (
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-primary-muted)] text-[var(--color-muted)]">
          {icon}
        </div>
      )}
      <p className="mb-2 font-medium text-[var(--color-text)]">{title}</p>
      {description && <p className="mb-4 text-sm text-[var(--color-muted)]">{description}</p>}
      {action}
    </div>
  );
}

/* ── ResultGrid:结果卡网格 ── */

export function ResultGrid({
  children,
  columns = 3,
  className,
}: {
  children: React.ReactNode;
  columns?: 2 | 3;
  className?: string;
}) {
  const gridCols = columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3";
  return (
    <div className={cn("grid gap-3", gridCols, className)}>{children}</div>
  );
}
