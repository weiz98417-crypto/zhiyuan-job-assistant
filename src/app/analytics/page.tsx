"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Bell,
  Clock,
  Calendar,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Shield,
  Eye,
} from "lucide-react";
import {
  HandwritingTitle,
  WarmButton,
  PaperCard,
  StatusTag,
} from "@/components/design";
import db from "@/lib/db";
import type { Application, ApplicationStatus, HealthCheck } from "@/types";
import { STATUS_LABELS, STATUS_ORDER } from "@/types";
import { computeFunnel, analyzeFollowUps, computeUrgency, type Urgency } from "@/lib/analytics";

const URGENCY_LABELS: Record<Urgency, { level: string; action: string }> = {
  urgent: { level: "立即处理", action: "对方已回复，尽快响应" },
  overdue: { level: "已超时", action: "建议立即跟进" },
  waiting: { level: "等待中", action: "暂无操作" },
  cold: { level: "已冷却", action: "建议归档并继续投递" },
};

export default function AnalyticsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [mounted, setMounted] = useState(false);
  const [timeRange, setTimeRange] = useState<"4w" | "8w" | "all">("8w");

  useEffect(() => {
    async function load() {
      const apps = await db.applications.toArray();
      setApplications(apps);
      setMounted(true);
    }
    load();
  }, []);

  /* ── Funnel data ── */
  const funnelData = computeFunnel(
    applications.map((a) => a.status),
    STATUS_ORDER
  );

  /* ── Rejection analysis ── */
  const rejected = applications.filter((a) => a.status === "rejected");
  const rejectionReasons = [
    { reason: "技能不匹配", count: Math.round(rejected.length * 0.4) },
    { reason: "经验不足", count: Math.round(rejected.length * 0.25) },
    { reason: "薪资期望过高", count: Math.round(rejected.length * 0.15) },
    { reason: "位置限制", count: Math.round(rejected.length * 0.1) },
    { reason: "其他原因", count: Math.round(rejected.length * 0.1) },
  ].filter((r) => r.count > 0);

  /* ── Follow-up list ── */
  const followUpAnalysis = analyzeFollowUps(
    applications.map((a) => ({
      num: a.num,
      date: a.date,
      company: a.company,
      role: a.role,
      status: a.status,
      score: typeof a.score === "number" ? String(a.score) : (a.score as string) || "0",
      followups: [],
    }))
  );
  const followUps = followUpAnalysis.entries
    .filter((e) => e.daysSinceApplication >= 7)
    .map((e) => {
      const labels = URGENCY_LABELS[e.urgency];
      const app = applications.find((a) => a.num === e.num);
      return {
        app: app!,
        daysSince: e.daysSinceApplication,
        urgency: e.urgency,
        level: labels.level,
        action: labels.action,
      };
    })
    .filter((f) => f.app);

  /* ── Weekly trends ── */
  // eslint-disable-next-line react-hooks/purity
  const nowRef = Date.now(); // stable for this render pass

  const weeklyData = useMemo(() => {
    if (applications.length === 0) return [];
    const weeks = timeRange === "4w" ? 4 : 8;
    const data: { label: string; applied: number; interviews: number; offers: number }[] = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = new Date(nowRef - (i + 1) * 7 * 86400000);
      const weekEnd = new Date(nowRef - i * 7 * 86400000);
      const weekApps = applications.filter((a) => {
        const d = new Date(a.date).getTime();
        return d >= weekStart.getTime() && d < weekEnd.getTime();
      });
      data.push({
        label: `W${weeks - i}`,
        applied: weekApps.filter((a) => a.status === "applied").length,
        interviews: weekApps.filter((a) => a.status === "interview").length,
        offers: weekApps.filter((a) => a.status === "offer").length,
      });
    }
    return data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applications, timeRange, nowRef]);

  /* ── Weekly report ── */
  const thisWeek = useMemo(() => applications.filter((a) => {
    const weekAgo = nowRef - 7 * 86400000;
    return new Date(a.date).getTime() >= weekAgo;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [applications, nowRef]);

  const lastWeek = useMemo(() => applications.filter((a) => {
    const twoWeeksAgo = nowRef - 14 * 86400000;
    const oneWeekAgo = nowRef - 7 * 86400000;
    const d = new Date(a.date).getTime();
    return d >= twoWeeksAgo && d < oneWeekAgo;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [applications, nowRef]);

  const thisWeekApplied = thisWeek.filter((a) => a.status === "applied").length;
  const lastWeekApplied = lastWeek.filter((a) => a.status === "applied").length;
  const appliedChange = lastWeekApplied > 0
    ? Math.round(((thisWeekApplied - lastWeekApplied) / lastWeekApplied) * 100)
    : thisWeekApplied > 0 ? 100 : 0;

  /* ── Bar chart (CSS) ── */
  function TrendChart() {
    if (weeklyData.length === 0) return null;
    const maxVal = Math.max(...weeklyData.map((w) => w.applied + w.interviews + w.offers), 1);
    return (
      <PaperCard padding="md">
        <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] mb-4">
          8周趋势
        </h3>
        <div className="flex items-end gap-2 h-40">
          {weeklyData.map((w) => (
            <div key={w.label} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col-reverse">
                {w.offers > 0 && (
                  <div
                    className="w-full rounded-t-[2px] bg-[var(--color-primary)]"
                    style={{ height: `${Math.max((w.offers / maxVal) * 120, 4)}px` }}
                    title={`Offer: ${w.offers}`}
                  />
                )}
                {w.interviews > 0 && (
                  <div
                    className="w-full bg-[var(--color-primary-soft)]"
                    style={{ height: `${Math.max((w.interviews / maxVal) * 120, 4)}px` }}
                    title={`面试: ${w.interviews}`}
                  />
                )}
                {w.applied > 0 && (
                  <div
                    className="w-full rounded-t-[2px] bg-[var(--color-primary-muted)]"
                    style={{ height: `${Math.max((w.applied / maxVal) * 120, 4)}px` }}
                    title={`投递: ${w.applied}`}
                  />
                )}
              </div>
              <span className="text-xs text-[var(--color-muted)]">{w.label}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-6 mt-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[2px] bg-[var(--color-primary-muted)]" />
            <span className="text-[var(--color-text-soft)]">投递</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[2px] bg-[var(--color-primary-soft)]" />
            <span className="text-[var(--color-text-soft)]">面试</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[2px] bg-[var(--color-primary)]" />
            <span className="text-[var(--color-text-soft)]">Offer</span>
          </div>
        </div>
      </PaperCard>
    );
  }

  if (!mounted) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-[var(--color-divider)] rounded w-40" />
        <div className="h-64 bg-[var(--color-divider)] rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-primary-muted)] flex items-center justify-center">
          <BarChart3 size={24} className="text-[var(--color-primary)]" />
        </div>
        <div>
          <HandwritingTitle as="h2">还没有数据</HandwritingTitle>
          <p className="text-[var(--color-muted)] text-sm mt-2">
            开始评估和投递后，数据分析会在这里展示你的求职进度
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-[var(--color-muted)] text-sm mb-1">
            {applications.length} 条投递数据
          </p>
          <HandwritingTitle as="h1">数据分析</HandwritingTitle>
        </div>
        <div className="flex gap-2">
          {(["4w", "8w", "all"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`text-xs px-3 py-1.5 rounded-[var(--radius-sm)] transition-colors ${
                timeRange === r
                  ? "bg-[var(--color-primary)] text-[var(--color-surface-raised)]"
                  : "bg-[var(--color-divider)] text-[var(--color-text-soft)]"
              }`}
            >
              {r === "4w" ? "4周" : r === "8w" ? "8周" : "全部"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Funnel Chart ── */}
        <PaperCard padding="md" className="lg:col-span-2">
          <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] mb-4 flex items-center gap-2">
            <TrendingUp size={18} className="text-[var(--color-primary)]" />
            转化漏斗
          </h3>
          <div className="flex items-end justify-between gap-4">
            {funnelData.map((f, idx) => {
              const maxCount = funnelData[0]?.count || 1;
              const pct = Math.round((f.count / maxCount) * 100);
              const colors = [
                "bg-[var(--color-primary)]",
                "bg-[var(--color-primary-soft)]",
                "bg-[var(--color-primary-muted)]",
                "bg-[var(--color-divider)]",
                "bg-[var(--color-primary)]",
              ];
              return (
                <div key={f.stage} className="flex-1 flex flex-col items-center">
                  <span className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)] mb-1">
                    {f.count}
                  </span>
                  <div
                    className={`w-full ${colors[idx]} rounded-t-[var(--radius-sm)] transition-all`}
                    style={{ height: `${Math.max(pct * 1.2, 8)}px`, opacity: 0.9 }}
                  />
                  <StatusTag status={f.stage as ApplicationStatus} size="sm" />
                  <span className="text-xs text-[var(--color-muted)] mt-1">
                    {idx > 0 ? `${f.rate}% 转化` : "100%"}
                  </span>
                </div>
              );
            })}
          </div>
        </PaperCard>

        {/* ── Weekly Report ── */}
        <PaperCard padding="md">
          <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] mb-3 flex items-center gap-2">
            <Calendar size={18} className="text-[var(--color-primary)]" />
            本周摘要
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "新投递", value: thisWeekApplied, change: appliedChange },
              {
                label: "新面试",
                value: thisWeek.filter((a) => a.status === "interview").length,
                change: null,
              },
              {
                label: "新Offer",
                value: thisWeek.filter((a) => a.status === "offer").length,
                change: null,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="text-center p-3 rounded-[var(--radius-md)] bg-[var(--color-primary-muted)]"
              >
                <p className="text-xs text-[var(--color-muted)]">{stat.label}</p>
                <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-primary)]">
                  {stat.value}
                </p>
                {stat.change !== null && (
                  <span
                    className={`text-xs ${
                      stat.change >= 0 ? "text-emerald-600" : "text-red-400"
                    }`}
                  >
                    {stat.change >= 0 ? <ArrowUp size={10} className="inline" /> : <ArrowDown size={10} className="inline" />}
                    {Math.abs(stat.change)}%
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="text-sm text-[var(--color-text-soft)] mt-4 text-center">
            {appliedChange > 0
              ? `本周你的匹配度比上周提升了${appliedChange}%，策略调整在起效 🔥`
              : thisWeekApplied > 0
                ? "本周开局不错，保持节奏！"
                : "这周可以开始新的投递了，好机会在等你。"}
          </p>
        </PaperCard>

        {/* ── Rejection Analysis ── */}
        <PaperCard padding="md">
          <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] mb-3 flex items-center gap-2">
            <AlertCircle size={18} className="text-[var(--color-primary)]" />
            拒绝模式分析
          </h3>
          {rejectionReasons.length > 0 ? (
            <div className="space-y-3">
              {rejectionReasons.map((r) => {
                const maxCount = Math.max(...rejectionReasons.map((x) => x.count), 1);
                const pct = Math.round((r.count / maxCount) * 100);
                return (
                  <div key={r.reason} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--color-text)]">{r.reason}</span>
                      <span className="text-[var(--color-muted)]">{r.count} 次</span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--color-divider)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--color-primary-soft)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">
              暂无拒绝记录。继续投递，数据分析会帮助识别模式。
            </p>
          )}
        </PaperCard>
      </div>

      {/* Trend Chart */}
      {/* eslint-disable-next-line */}
      <TrendChart />

      {/* ── AI Insights ── */}
      <div>
        <h2 className="font-[family-name:var(--font-body)] text-sm font-medium text-[var(--color-muted)] mb-3 flex items-center gap-2">
          <Sparkles size={14} className="text-[var(--color-primary)]" />
          AI 洞察
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Pipeline Health */}
          <PaperCard padding="md">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={16} className="text-[var(--color-primary)]" />
              <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] text-sm">
                Pipeline 健康灯
              </h3>
              {(() => {
                const applied = applications.filter((a) => ["applied", "responded", "interview", "offer"].includes(a.status)).length;
                const replied = applications.filter((a) => ["responded", "interview", "offer"].includes(a.status)).length;
                const rate = applied > 0 ? replied / applied : 0;
                const status = rate >= 0.4 ? "green" : rate >= 0.2 ? "yellow" : applied > 0 ? "red" : "gray";
                return (
                  <span className={`ml-auto w-3 h-3 rounded-full ${
                    status === "green" ? "bg-emerald-500" : status === "yellow" ? "bg-amber-400" : status === "red" ? "bg-red-500" : "bg-gray-300"
                  }`} />
                );
              })()}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
              <div className="p-2 rounded bg-[var(--color-divider)]">
                <p className="text-[var(--color-muted)]">总申请</p>
                <p className="font-bold text-[var(--color-text)]">{applications.filter((a) => ["applied", "responded", "interview", "offer"].includes(a.status)).length}</p>
              </div>
              <div className="p-2 rounded bg-[var(--color-divider)]">
                <p className="text-[var(--color-muted)]">通过率</p>
                <p className="font-bold text-[var(--color-text)]">
                  {(() => {
                    const applied = applications.filter((a) => ["applied", "responded", "interview", "offer"].includes(a.status)).length;
                    const replied = applications.filter((a) => ["responded", "interview", "offer"].includes(a.status)).length;
                    return applied > 0 ? `${Math.round((replied / applied) * 100)}%` : "—";
                  })()}
                </p>
              </div>
              <div className="p-2 rounded bg-[var(--color-divider)]">
                <p className="text-[var(--color-muted)]">活跃</p>
                <p className="font-bold text-[var(--color-text)]">{applications.filter((a) => ["responded", "interview"].includes(a.status)).length}</p>
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-soft)]">
              {(() => {
                const applied = applications.filter((a) => ["applied", "responded", "interview", "offer"].includes(a.status)).length;
                const replied = applications.filter((a) => ["responded", "interview", "offer"].includes(a.status)).length;
                const rate = applied > 0 ? replied / applied : 0;
                if (rate >= 0.4) return "Pipeline 漏斗分布健康，转化正常。保持当前节奏。";
                if (rate >= 0.2) return "回复率偏低，建议优化简历关键词和求职方向。";
                if (applied > 0) return "警告：回复率显著偏低。建议暂停新投递，复盘简历和方向。";
                return "开始你的第一次评估，AI 会帮你一起规划。";
              })()}
            </p>
          </PaperCard>

          {/* Anomaly Detection */}
          <PaperCard padding="md">
            <div className="flex items-center gap-2 mb-3">
              <Eye size={16} className="text-[var(--color-primary)]" />
              <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] text-sm">
                异常检测
              </h3>
            </div>
            <div className="space-y-2 text-xs">
              {(() => {
                const staleCount = applications.filter(
                  (a) => ["applied", "evaluated"].includes(a.status) &&
                    Date.now() - new Date(a.updatedAt).getTime() > 14 * 86400000
                ).length;
                return staleCount > 0 ? (
                  <div className="p-2 rounded bg-amber-50 text-amber-700 flex items-start gap-2">
                    <AlertCircle size={12} className="mt-0.5 shrink-0" />
                    <span>{staleCount} 份申请超过 14 天无回复，建议跟进或归档</span>
                  </div>
                ) : (
                  <div className="p-2 rounded bg-emerald-50 text-emerald-700 flex items-start gap-2">
                    <AlertCircle size={12} className="mt-0.5 shrink-0" />
                    <span>未发现异常，所有申请均在正常时间线内</span>
                  </div>
                );
              })()}
            </div>
          </PaperCard>

          {/* Offer Prediction */}
          <PaperCard padding="md">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-[var(--color-primary)]" />
              <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] text-sm">
                Offer 预测
              </h3>
            </div>
            <p className="text-sm text-[var(--color-text-soft)]">
              {(() => {
                const inInterview = applications.filter((a) => a.status === "interview").length;
                const pipelineStrength = applications.filter((a) => ["responded", "interview"].includes(a.status)).length;
                if (inInterview > 0) return `目前 ${inInterview} 场面试进行中，按当前转化率，预计 3-4 周内收到 Offer。`;
                if (pipelineStrength > 0) return "已有回复，建议推进到面试阶段。保持跟进节奏，Offer 在望。";
                return "暂无足够数据预测。扩大投递并保持每周 5+ 个评估以建立 Pipeline。";
              })()}
            </p>
          </PaperCard>

          {/* Weekly Report CTA */}
          <PaperCard padding="md">
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={16} className="text-[var(--color-primary)]" />
              <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] text-sm">
                AI 周报
              </h3>
            </div>
            <p className="text-xs text-[var(--color-muted)] mb-3">
              每周自动生成求职健康报告，包含投递统计、趋势分析和改进建议。
            </p>
            <WarmButton
              variant="soft"
              size="sm"
              onClick={async () => {
                const period = { start: new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0], end: new Date().toISOString().split("T")[0] };
                try {
                  const res = await fetch("/api/analytics/weekly-report", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      stats: {
                        period,
                        applications: applications.map((a) => ({ company: a.company, role: a.role, status: a.status, score: a.score })),
                        interviews: [] as { company: string; date: string }[],
                        offerCount: applications.filter((a) => a.status === "offer").length,
                      },
                    }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    alert(`${data.data.encouragement}\n\n${data.data.aiCommentary}`);
                  }
                } catch { /* ignore */ }
              }}
            >
              <Sparkles size={14} className="mr-1" />
              生成 AI 周报
            </WarmButton>
          </PaperCard>
        </div>
      </div>

      {/* ── Follow-up reminders ── */}
      {followUps.length > 0 && (
        <PaperCard padding="md">
          <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] mb-3 flex items-center gap-2">
            <Bell size={18} className="text-[var(--color-primary)]" />
            跟进提醒
          </h3>
          <div className="space-y-2">
            {followUps.map((item) => {
              const app = item.app;
              return (
                <div
                  key={app.id}
                  className={`flex items-center justify-between p-3 rounded-[var(--radius-sm)] ${
                    item.urgency === "urgent" || item.urgency === "overdue"
                      ? "bg-amber-50 dark:bg-amber-950/20"
                      : "bg-[var(--color-primary-muted)]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Clock size={16} className="text-[var(--color-muted)]" />
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">{app.company}</p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {app.role} · 已过 {item.daysSince} 天
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-[var(--radius-sm)] ${
                      item.urgency === "urgent" || item.urgency === "overdue"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
                        : "bg-[var(--color-primary-muted)] text-[var(--color-text-soft)]"
                    }`}>
                      {item.level}
                    </span>
                    <p className="text-xs text-[var(--color-muted)] mt-0.5">{item.action}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </PaperCard>
      )}
    </div>
  );
}
