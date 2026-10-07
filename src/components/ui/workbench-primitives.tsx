"use client";

/**
 * 工作台原语(spec 34):PageHeading / SearchInput / EmptyState。
 * 收口 12+ 页逐字复制的页头块、6 处同型搜索框、10+ 处散写空态。
 * 只做结构收敛,视觉与既有实现逐字节等价;页面特有内容走 children/slot。
 */

import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { HandwritingTitle } from "@/components/design";

/** 页头:meta 行(计数/说明)+ 标题 + 可选动作槽(右侧按钮组)。 */
export function PageHeading({
  meta,
  title,
  as = "h1",
  actions,
}: {
  meta: ReactNode;
  title: ReactNode;
  as?: "h1" | "h2";
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-4">
      <div className="page-heading">
        <p className="text-[var(--color-muted)] text-sm mb-1">{meta}</p>
        <HandwritingTitle as={as}>{title}</HandwritingTitle>
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

/** 搜索输入行:图标 + 输入 + 一键清空(有值才显示);容器由页面自定。 */
export function SearchInput({
  value,
  onChange,
  placeholder = "搜索...",
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
      <Search size={16} className="text-[var(--color-muted)]" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        className="flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="清空搜索">
          <X size={14} className="text-[var(--color-muted)]" />
        </button>
      )}
    </div>
  );
}

/** 空态:图标 + 标题 + 可选说明 + 可选主动作;居中,弱化色。 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-10 space-y-3">
      {icon}
      <p className="text-sm text-[var(--color-muted)]">{title}</p>
      {hint ? <p className="text-xs text-[var(--color-muted)]">{hint}</p> : null}
      {action}
    </div>
  );
}
