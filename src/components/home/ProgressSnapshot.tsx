"use client";

import Link from "next/link";
import { ArrowUpRight, BriefcaseBusiness, CircleDot, Gauge, Trophy } from "lucide-react";
import { motion } from "framer-motion";

interface ProgressSnapshotProps {
  evaluated: number;
  applied: number;
  interviewing: number;
  offers: number;
  avgScore: number;
  weeklyNew: number;
  isEmpty: boolean;
}

export default function ProgressSnapshot({ evaluated, applied, interviewing, offers, avgScore, weeklyNew, isEmpty }: ProgressSnapshotProps) {
  const metrics = [
    { label: "已评估", value: evaluated, icon: CircleDot },
    { label: "已投递", value: applied, icon: BriefcaseBusiness },
    { label: "面试中", value: interviewing, icon: Gauge },
    { label: "Offer", value: offers, icon: Trophy },
  ];

  return (
    <section className="surface-panel rounded-[var(--radius-xl)] p-4 sm:p-5" aria-labelledby="progress-title">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-[var(--color-muted)]">YOUR RHYTHM</p>
          <h2 id="progress-title" className="mt-1 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--color-text)]">本周进展</h2>
        </div>
        <Link href="/tracker" className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline">
          查看管线 <ArrowUpRight size={13} />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {metrics.map(({ label, value, icon: Icon }, index) => (
          <motion.div key={label} className="rounded-[var(--radius-md)] bg-[var(--color-surface-soft)]/75 px-3 py-3" whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--color-muted)]">{label}</span>
              <Icon size={14} className={index === 3 ? "text-[var(--color-success)]" : "text-[var(--color-primary)]"} />
            </div>
            <p className="mt-1 font-[family-name:var(--font-display)] text-xl font-bold text-[var(--color-text)]">{isEmpty ? "—" : value}</p>
          </motion.div>
        ))}
      </div>
      <div className="mt-4 border-t border-[var(--color-divider)] pt-3 text-xs text-[var(--color-muted)]">
        {isEmpty ? "完成第一份评估后，这里会记录你的求职节奏。" : <><span className="font-semibold text-[var(--color-text-soft)]">本周新增 {weeklyNew}</span> 项记录 · 平均匹配分 {avgScore > 0 ? avgScore.toFixed(1) : "—"}</>}
      </div>
    </section>
  );
}
