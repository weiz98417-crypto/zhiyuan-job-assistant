"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileSearch,
  ListTodo,
  FileText,
  MessageCircle,
} from "lucide-react";
import { HandwritingTitle, PaperCard } from "@/components/design";
import HeroMetrics from "@/components/home/HeroMetrics";
import PipelineFunnel from "@/components/home/PipelineFunnel";
import TodoReminders from "@/components/home/TodoReminders";
import MiniPipeline from "@/components/home/MiniPipeline";
import IndustryNews from "@/components/home/IndustryNews";
import CompanyNews from "@/components/home/CompanyNews";
import ErrorState from "@/components/design/ErrorState";
import db from "@/lib/db";
import type { Application, ApplicationStatus, InterviewSchedule } from "@/types";

/* ── Daily greeting ── */
function getGreeting(): string {
  const hour = new Date().getHours();
  const day = new Date().getDay();
  const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  if (hour < 10) return `早安，${dayNames[day]}愉快`;
  if (hour < 14) return `午安，${dayNames[day]}顺利`;
  if (hour < 19) return `下午好，${dayNames[day]}加油`;
  return `晚安，${dayNames[day]}辛苦了`;
}

/* ── Daily encouragement ── */
const ENCOURAGEMENTS = [
  "每一次评估都是一次自我认知的校准。",
  "求职不是海投，是找到双向奔赴的机会。",
  "你的独特经历是这个市场上稀缺的。",
  "好机会值得等待，也值得认真准备。",
  "投递数量不重要，重要的是每一次投递的质量。",
  "你在构建的不仅是一份工作，而是一段职业旅程。",
  "AI 在帮你分析职位，但决策的力量在你手里。",
];

/* ── Helpers ── */
function getWeekAgo(): Date {
  const now = new Date();
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}

function getTwoWeeksAgo(): Date {
  const now = new Date();
  return new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
}

export default function HomePage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [interviews, setInterviews] = useState<InterviewSchedule[]>([]);
  const [offerCount, setOfferCount] = useState(0);
  const [reportCount, setReportCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      // Server data is authoritative; local storage is only used for local interview drafts.
      try {
        const [appsRes, reportsRes, offersRes] = await Promise.all([
          fetch("/api/data/applications", { cache: "no-store" }),
          fetch("/api/data/reports", { cache: "no-store" }),
          fetch("/api/offers", { cache: "no-store" }),
        ]);
        if (!appsRes.ok || !reportsRes.ok || !offersRes.ok) throw new Error("server load failed");
        const [appsJson, reportsJson, offersJson] = await Promise.all([appsRes.json(), reportsRes.json(), offersRes.json()]);
        if (!appsJson.success || !reportsJson.success || !offersJson.success) throw new Error("server response failed");
        setApplications(Array.isArray(appsJson.data) ? appsJson.data : []);
        setReportCount(Array.isArray(reportsJson.data) ? reportsJson.data.length : 0);
        setOfferCount(Array.isArray(offersJson.data) ? offersJson.data.length : 0);
        const ivs = await db.interviews.toArray();
        setInterviews(ivs);
      } catch {
        setError(true);
      }
      setMounted(true);
    }
    load();
  }, []);

  const encouragement = ENCOURAGEMENTS[new Date().getDay() % ENCOURAGEMENTS.length];

  // ── Compute metrics ──
  const weekAgo = getWeekAgo();
  const twoWeeksAgo = getTwoWeeksAgo();

  const thisWeek = applications.filter((a) => new Date(a.date) >= weekAgo);
  const lastWeek = applications.filter((a) => {
    const d = new Date(a.date);
    return d >= twoWeeksAgo && d < weekAgo;
  });

  const s = (a: Application) => (a as unknown as { status: string }).status;
  const evaluated = Math.max(reportCount, applications.filter((a) => s(a) === "evaluated" || s(a) === "Evaluated").length);
  const applied = applications.filter((a) =>
    ["applied", "Applied", "responded", "Responded", "interview", "Interview", "offer", "Offer"].includes(s(a))
  ).length;
  const interviewing = applications.filter((a) => s(a) === "interview" || s(a) === "Interview").length;
  const offers = offerCount > 0 ? offerCount : applications.filter((a) => s(a) === "offer" || s(a) === "Offer").length;

  const scoredApps = applications.filter((a) => a.score > 0);
  const avgScore = scoredApps.length > 0
    ? scoredApps.reduce((sum, a) => sum + a.score, 0) / scoredApps.length
    : 0;

  // Previous week for trend
  const prevEvaluated = lastWeek.filter((a) => s(a) === "evaluated" || s(a) === "Evaluated").length;
  const prevApplied = lastWeek.filter((a) =>
    ["applied", "Applied", "responded", "Responded", "interview", "Interview", "offer", "Offer"].includes(s(a))
  ).length;
  const prevInterviewing = lastWeek.filter((a) => s(a) === "interview" || s(a) === "Interview").length;
  const prevOffers = lastWeek.filter((a) => s(a) === "offer" || s(a) === "Offer").length;
  const prevScored = lastWeek.filter((a) => a.score > 0);
  const prevAvgScore = prevScored.length > 0
    ? prevScored.reduce((sum, a) => sum + a.score, 0) / prevScored.length
    : 0;

  // Pipeline counts per status
  const statusCounts = applications.reduce((acc, app) => {
    acc[app.status] = (acc[app.status] || 0) + 1;
    return acc;
  }, {} as Partial<Record<ApplicationStatus, number>>);

  // Funnel stages
  const funnelStages = [
    { label: "已发现", count: evaluated + applied + interviewing + offers },
    { label: "已评估", count: evaluated + applied + interviewing + offers },
    { label: "已投递", count: applied },
    { label: "面试中", count: interviewing },
    { label: "Offer", count: offers },
  ];

  // For todo reminders, format app data
  const appsForTodos = applications.map((a) => ({
    company: a.company,
    role: a.role,
    status: a.status,
    date: a.date,
    updatedAt: (() => {
      const d = (a as any).updatedAt || (a as any).updated_at || a.date;
      const parsed = new Date(d);
      return isNaN(parsed.getTime()) ? a.date : parsed.toISOString().split("T")[0];
    })(),
  }));

  if (error) {
    return <ErrorState onRetry={() => { setError(false); setMounted(false); window.location.reload(); }} />;
  }

  if (!mounted) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-8 bg-[var(--color-divider)] rounded w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-[var(--color-divider)] rounded-[var(--radius-lg)]" />
          ))}
        </div>
        <div className="h-40 bg-[var(--color-divider)] rounded-[var(--radius-lg)]" />
        <div className="h-32 bg-[var(--color-divider)] rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  const isEmpty = applications.length === 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-[var(--color-muted)] text-sm mb-2">{getGreeting()}</p>
        <HandwritingTitle as="h1">
          {isEmpty ? "欢迎打开你的求职手帳" : "今日手帳"}
        </HandwritingTitle>
      </div>

      {/* News — top of dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <IndustryNews />
        <CompanyNews />
      </div>

      {/* Hero Metrics — always visible */}
      <HeroMetrics
        evaluated={evaluated}
        applied={applied}
        interviewing={interviewing}
        offers={offers}
        avgScore={avgScore}
        prevEvaluated={prevEvaluated}
        prevApplied={prevApplied}
        prevInterviewing={prevInterviewing}
        prevOffers={prevOffers}
        prevAvgScore={prevAvgScore}
      />

      {/* Two-column: Funnel + Todos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PipelineFunnel stages={funnelStages} />
        <TodoReminders applications={appsForTodos} interviews={interviews} />
      </div>

      {/* Mini Pipeline — only when has data */}
      {!isEmpty && <MiniPipeline counts={statusCounts} />}

      {/* Quick Actions */}
      <div>
        <h2 className="font-[family-name:var(--font-body)] text-sm font-medium text-[var(--color-muted)] mb-3">
          快速操作
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link href="/evaluate" className="group">
            <PaperCard hover="lift" padding="sm">
              <FileSearch size={20} className="text-[var(--color-primary)] mb-2" />
              <p className="text-sm font-medium text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors">
                评估 JD
              </p>
            </PaperCard>
          </Link>
          <Link href="/tracker" className="group">
            <PaperCard hover="lift" padding="sm">
              <ListTodo size={20} className="text-[var(--color-primary)] mb-2" />
              <p className="text-sm font-medium text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors">
                查看追踪
              </p>
            </PaperCard>
          </Link>
          <Link href="/cv" className="group">
            <PaperCard hover="lift" padding="sm">
              <FileText size={20} className="text-[var(--color-primary)] mb-2" />
              <p className="text-sm font-medium text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors">
                优化简历
              </p>
            </PaperCard>
          </Link>
          <Link href="/agent" className="group">
            <PaperCard hover="lift" padding="sm">
              <MessageCircle size={20} className="text-[var(--color-primary)] mb-2" />
              <p className="text-sm font-medium text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors">
                AI 顾问
              </p>
            </PaperCard>
          </Link>
        </div>
      </div>

      {/* Daily encouragement */}
      <div className="text-center py-4">
        <p className="text-[var(--color-muted)] text-sm italic">
          「{encouragement}」
        </p>
      </div>
    </div>
  );
}
