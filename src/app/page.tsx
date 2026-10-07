"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Check, FileSearch, FileText, ListTodo, MessageCircle, RefreshCw } from "lucide-react";
import { MotionConfig } from "framer-motion";
import { HandwritingTitle } from "@/components/design";
import IndustryNews from "@/components/home/IndustryNews";
import CompanyNews from "@/components/home/CompanyNews";
import TodayFocus, { type HomeAction } from "@/components/home/TodayFocus";
import ActionQueue from "@/components/home/ActionQueue";
import ProgressSnapshot from "@/components/home/ProgressSnapshot";
import PipelineFunnel from "@/components/home/PipelineFunnel";
import db from "@/lib/db";
import { buildHomeActions, getHomeSnapshot } from "@/lib/home-dashboard";
import type { Application, InterviewSchedule } from "@/types";

const tools = [
  { href: "/evaluate", label: "评估 JD", detail: "判断一个机会是否值得投入", icon: FileSearch },
  { href: "/tracker", label: "投递追踪", detail: "接住每一次进展与回应", icon: ListTodo },
  { href: "/cv", label: "打磨简历", detail: "让经历说出你的价值", icon: FileText },
  { href: "/agent", label: "聊聊下一步", detail: "把想法整理成可执行的行动", icon: MessageCircle },
];

function getGreeting(now: Date) {
  const hour = now.getHours();
  if (hour < 10) return "早安，今天也从容一点。";
  if (hour < 14) return "午安，为下一步留一点时间。";
  if (hour < 19) return "下午好，让机会慢慢成形。";
  return "晚上好，认真走过的每一步都算数。";
}

export default function HomePage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [interviews, setInterviews] = useState<InterviewSchedule[]>([]);
  const [offerCount, setOfferCount] = useState(0);
  const [reportCount, setReportCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [interviewUnavailable, setInterviewUnavailable] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const responses = await Promise.all([
        fetch("/api/data/applications", { cache: "no-store" }),
        fetch("/api/data/reports", { cache: "no-store" }),
        fetch("/api/offers", { cache: "no-store" }),
      ]);
      if (responses.some((response) => !response.ok)) throw new Error("load failed");
      const [appsJson, reportsJson, offersJson] = await Promise.all(responses.map((response) => response.json()));
      if (!appsJson.success || !reportsJson.success || !offersJson.success) throw new Error("response failed");
      setApplications(Array.isArray(appsJson.data) ? appsJson.data : []);
      setReportCount(Array.isArray(reportsJson.data) ? reportsJson.data.length : 0);
      setOfferCount(Array.isArray(offersJson.data) ? offersJson.data.length : 0);
      try {
        setInterviews(await db.interviews.toArray());
        setInterviewUnavailable(false);
      } catch {
        setInterviews([]);
        setInterviewUnavailable(true);
      }
      setLoaded(true);
      setNow(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      setNow(new Date());
      void load();
    }, 0);
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [load]);

  const snapshot = getHomeSnapshot(applications, reportCount, offerCount, now || new Date());
  const rawActions = buildHomeActions(applications, interviews, now || new Date());
  const actions: HomeAction[] = rawActions.map((action) => ({
    id: action.id, kind: action.kind, company: action.company, role: action.role,
    reason: action.reason, dueLabel: action.dueLabel, href: action.href, actionLabel: action.actionLabel,
  }));

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto max-w-[1360px] space-y-7 pb-8 text-[var(--color-text)]">
        <header className="flex items-end justify-between gap-5">
          <div className="journal-heading">
            <p className="mb-1 flex items-center gap-2 text-sm text-[var(--color-text-soft)]"><CalendarDays size={15} className="text-[var(--color-primary)]" />{now ? getGreeting(now) : "为下一步，翻开新的一页。"}</p>
            <HandwritingTitle as="h1">今日手账<span className="ml-3 inline-block h-2 w-2 rounded-full bg-[var(--color-primary)] align-middle" aria-hidden="true" /></HandwritingTitle>
            <p className="mt-2 text-xs text-[var(--color-muted)]">把今天最重要的一步，留在纸面上。</p>
          </div>
          <div className="flex items-center gap-4 pb-2 text-xs text-[var(--color-text-soft)]">
            <time>{now ? new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(now) : "今天"}</time>
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1.5 border-b border-[var(--color-border)] py-1.5 transition-colors hover:text-[var(--color-primary)]" aria-label="刷新求职数据">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />{loading ? "同步中" : error ? "重新同步" : "刷新数据"}
            </button>
          </div>
        </header>

        {error && <div role="alert" className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] bg-[var(--color-primary-muted)] px-4 py-3 text-sm"><span>{loaded ? "暂时无法同步，保留上次成功加载的求职数据。" : "求职数据未能加载，重新同步后即可继续。"}</span><button type="button" onClick={() => void load()} disabled={loading} className="text-[var(--color-primary)] underline underline-offset-4">重新同步</button></div>}

        {!loaded ? (
          <div className="grid animate-pulse gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(260px,.8fr)]" role="status" aria-label="正在加载求职数据">
            <div className="min-h-[330px] rounded-[var(--radius-xl)] bg-[var(--color-divider)]/70" />
            <div className="min-h-[330px] rounded-[var(--radius-xl)] bg-[var(--color-divider)]/70" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(260px,.8fr)]">
              <TodayFocus action={actions[0]} totalActions={actions.length} isEmpty={snapshot.isEmpty} />
              <ProgressSnapshot evaluated={snapshot.evaluated} applied={snapshot.applied} interviewing={snapshot.interviewing} offers={snapshot.offers} avgScore={snapshot.avgScore ?? 0} weeklyNew={snapshot.weeklyNew} isEmpty={snapshot.isEmpty} />
            </div>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(260px,.9fr)]">
              <ActionQueue actions={actions} />
              <PipelineFunnel stages={[
                { label: "已评估", count: snapshot.evaluated },
                { label: "已投递", count: snapshot.applied },
                { label: "面试中", count: snapshot.interviewing },
                { label: "Offer", count: snapshot.offers },
              ]} />
            </div>
            {interviewUnavailable && <p className="text-xs text-[var(--color-muted)]">面试草稿暂不可用，以上行动仅基于已同步的求职记录。</p>}
          </>
        )}

        <section aria-labelledby="news-title" className="border-t border-[var(--color-border)] pt-6">
          <div className="mb-3 flex items-end justify-between gap-3"><div><h2 id="news-title" className="font-[family-name:var(--font-display)] text-xl font-semibold">看看外面的风向</h2><p className="mt-1 text-xs text-[var(--color-muted)]">行业与目标企业动态，作为今天的背景信息。</p></div></div>
          <div className="grid gap-4 lg:grid-cols-2"><IndustryNews /><CompanyNews /></div>
        </section>

        <nav aria-label="求职工具" className="grid grid-cols-2 border-y border-[var(--color-border)] py-3 sm:grid-cols-4">
          {tools.map(({ href, label, detail, icon: Icon }, index) => <Link key={href} href={href} className={`group flex items-center gap-3 px-3 py-3 transition-colors hover:bg-[var(--color-primary-muted)] ${index % 4 !== 3 ? "sm:border-r sm:border-[var(--color-divider)]" : ""}`}>
            <Icon size={19} strokeWidth={1.75} className="shrink-0 text-[var(--color-primary)]" /><span className="min-w-0"><strong className="block text-sm font-medium">{label}</strong><small className="mt-1 block truncate text-[10px] text-[var(--color-muted)]">{detail}</small></span><ArrowUpRight size={14} className="ml-auto shrink-0 text-[var(--color-muted)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>)}
        </nav>
        <footer className="flex items-center gap-2 px-1 text-xs text-[var(--color-muted)]"><Check size={14} className="text-[var(--color-primary)]" /><p>求职不是海投，是找到双向奔赴的机会。</p><span className="ml-auto font-[family-name:var(--font-display)] text-sm text-[var(--color-primary)]">每一步，都有方向。</span></footer>
      </div>
    </MotionConfig>
  );
}
