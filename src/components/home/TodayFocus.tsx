"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CalendarClock, CheckCircle2, Compass, FileSearch, Send, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { WarmButton } from "@/components/design";

export interface HomeAction {
  id: string;
  kind: "interview" | "followup" | "apply" | "start";
  company: string;
  role: string;
  reason: string;
  dueLabel: string;
  href: string;
  actionLabel: string;
}

interface TodayFocusProps {
  action?: HomeAction;
  totalActions: number;
  isEmpty: boolean;
}

const kindIcon = {
  interview: CalendarClock,
  followup: Send,
  apply: FileSearch,
  start: Compass,
};

export default function TodayFocus({ action, totalActions, isEmpty }: TodayFocusProps) {
  const focus = action || {
    id: "start",
    kind: "start" as const,
    company: "",
    role: "",
    reason: isEmpty ? "从一份真实 JD 开始，建立你的求职节奏" : "今天没有逾期事项，适合推进一个新的机会",
    dueLabel: isEmpty ? "建立第一条记录" : "保持节奏",
    href: isEmpty ? "/evaluate" : "/discover",
    actionLabel: isEmpty ? "评估第一份 JD" : "发现新机会",
  };
  const Icon = kindIcon[focus.kind];
  const artSrc = isEmpty
    ? "/art/journal-empty.png"
    : action
      ? "/art/paper-kite-hero.png"
      : "/art/journal-complete.png";
  const artClassName = "object-contain p-3 sm:p-4";

  return (
    <motion.article
      className="today-focus group relative min-h-[320px] overflow-hidden rounded-[var(--radius-2xl)] border border-[color-mix(in_srgb,var(--color-primary)_34%,var(--color-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-surface-raised)_96%,transparent),color-mix(in_srgb,var(--color-primary-muted)_74%,transparent))] p-5 shadow-[var(--shadow-lg)] sm:p-7"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.19, 1, 0.22, 1] }}
    >
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[48%] overflow-hidden rounded-r-[var(--radius-2xl)] opacity-90 transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.02]">
        <Image
          src={artSrc}
          alt=""
          fill
          priority
          sizes="(max-width: 768px) 42vw, 360px"
          className={`${artClassName} transition-transform duration-700 ease-[var(--ease-out-expo)]`}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-surface-raised)] via-[color-mix(in_srgb,var(--color-surface-raised)_28%,transparent)] to-transparent" />
      </div>
      <div className="relative z-10 max-w-[72%] sm:max-w-[55%]">
        <div className="mb-5 flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-[var(--color-primary)]">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-surface-raised)] shadow-[var(--shadow-sm)]">
            <Sparkles size={14} />
          </span>
          今日焦点
        </div>
        <p className="mb-2 text-sm text-[var(--color-muted)]">{focus.dueLabel}</p>
        <h2 className="max-w-[30rem] font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-[var(--color-text)] sm:text-3xl">
          {focus.company ? <>先处理 <span className="text-[var(--color-primary)]">{focus.company}</span> 的{focus.role}</> : focus.actionLabel}
        </h2>
        <p className="mt-3 max-w-[32rem] text-sm leading-6 text-[var(--color-text-soft)]">{focus.reason}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href={focus.href}>
            <WarmButton size="sm" className="gap-2 shadow-[0_8px_20px_color-mix(in_srgb,var(--color-primary)_22%,transparent)]">
              <Icon size={15} />
              {focus.actionLabel}
              <ArrowUpRight size={14} />
            </WarmButton>
          </Link>
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
            {totalActions > 0 ? <><CheckCircle2 size={14} className="text-[var(--color-primary)]" /> 今天还有 {totalActions} 项行动</> : "一件事，专注完成"}
          </span>
        </div>
      </div>
    </motion.article>
  );
}
