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
  return (
    <motion.article
      className="today-focus group relative min-h-[390px] overflow-hidden rounded-[var(--radius-2xl)] border border-[#574139] bg-[#1b1715] p-5 text-[#fff8ed] shadow-[0_22px_60px_rgba(54,31,22,.18)] sm:p-8"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.19, 1, 0.22, 1] }}
    >
      <div className="pointer-events-none absolute inset-0 transition-transform duration-1000 ease-[var(--ease-out-expo)] group-hover:scale-[1.025]">
        <Image
          src="/art/paper-kite-hero.png"
          alt=""
          fill
          priority
          sizes="(max-width: 768px) 100vw, 900px"
          className="object-cover object-center opacity-80"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#1b1715_0%,rgba(27,23,21,.96)_26%,rgba(27,23,21,.55)_58%,rgba(27,23,21,.12)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_28%,rgba(236,114,82,.2),transparent_35%)]" />
      </div>
      <div className="pointer-events-none absolute right-3 bottom-3 z-10 block h-[106px] w-[190px] sm:right-4 sm:bottom-4 sm:h-[166px] sm:w-[310px]">
        <div className="absolute right-[84px] bottom-1 h-[78px] w-[105px] rotate-[-7deg] overflow-hidden rounded-[12px] border border-[#f2dfc9]/45 bg-[#eee0cf] shadow-[0_18px_30px_rgba(0,0,0,.32)] transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:-translate-y-2 group-hover:rotate-[-10deg] sm:right-[142px] sm:h-[118px] sm:w-[154px] sm:rounded-[14px]">
          <Image src="/art/journal-empty.png" alt="" fill sizes="(max-width: 640px) 105px, 154px" className="object-contain p-1" />
          <span className="absolute left-2 bottom-2 rounded-full bg-[#1b1715]/75 px-2 py-1 text-[9px] tracking-[.12em] text-[#fff8ed]">BEGIN</span>
        </div>
        <div className="absolute right-0 bottom-0 h-[88px] w-[118px] rotate-[5deg] overflow-hidden rounded-[12px] border border-[#f2dfc9]/45 bg-[#eee0cf] shadow-[0_22px_34px_rgba(0,0,0,.38)] transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:translate-y-1 group-hover:rotate-[9deg] sm:h-[132px] sm:w-[176px] sm:rounded-[14px]">
          <Image src="/art/journal-complete.png" alt="" fill sizes="(max-width: 640px) 118px, 176px" className="object-contain p-1" />
          <span className="absolute left-2 bottom-2 rounded-full bg-[#1b1715]/75 px-2 py-1 text-[9px] tracking-[.12em] text-[#fff8ed]">DONE</span>
        </div>
      </div>
      <div className="relative z-20 max-w-[72%] sm:max-w-[54%]">
        <div className="mb-7 flex items-center gap-3 text-xs font-semibold tracking-[0.18em] text-[#f49a7f]">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#f49a7f]/40 bg-[#f49a7f]/12 text-[#f49a7f] shadow-[0_0_0_5px_rgba(244,154,127,.05)]">
            <Sparkles size={14} />
          </span>
          TODAY&apos;S FOCUS
        </div>
        <p className="mb-3 text-sm text-[#d3bdb0]">{focus.dueLabel}</p>
        <h2 className="max-w-[30rem] font-[family-name:var(--font-display)] text-3xl font-bold leading-[1.15] tracking-[-0.02em] text-[#fff8ed] sm:text-[2.65rem]">
          {focus.company ? <>先处理 <span className="text-[#f49a7f]">{focus.company}</span> 的{focus.role}</> : focus.actionLabel}
        </h2>
        <p className="mt-4 max-w-[32rem] text-sm leading-6 text-[#d3bdb0]">{focus.reason}</p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link href={focus.href}>
            <WarmButton size="sm" className="gap-2 border border-[#ffb39a] bg-[#f49a7f] text-[#2a1713] shadow-[0_10px_26px_rgba(244,154,127,.25)] hover:bg-[#ffb39a]">
              <Icon size={15} />
              {focus.actionLabel}
              <ArrowUpRight size={14} />
            </WarmButton>
          </Link>
          <span className="inline-flex items-center gap-1.5 text-xs text-[#d3bdb0]">
            {totalActions > 0 ? <><CheckCircle2 size={14} className="text-[#f49a7f]" /> 今天还有 {totalActions} 项行动</> : "一件事，专注完成"}
          </span>
        </div>
      </div>
      <span className="pointer-events-none absolute right-5 top-5 text-[10px] tracking-[.24em] text-[#f49a7f]/55">PAPER KITE / 01</span>
    </motion.article>
  );
}
