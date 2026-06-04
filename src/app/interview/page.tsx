"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Target,
  Sparkles,
  Calendar,
  Plus,
  Star,
  TrendingUp,
  BarChart3,
  ArrowRight,
  MessageCircle,
} from "lucide-react";
import { HandwritingTitle, WarmButton, PaperCard } from "@/components/design";
import db from "@/lib/db";
import InterviewLaunchPanel from "./InterviewLaunchPanel";
import PracticeRecords from "./PracticeRecords";
import AgentInterviewHistory from "./AgentInterviewHistory";
import InterviewRecapReview from "./InterviewRecapReview";
import { listSessions, softDeleteSession } from "@/lib/agent/sessions";
import type {
  PracticeRecord,
  StarStory,
  InterviewSchedule,
  ChatSession,
} from "@/types";

/* ── Analytics helpers ── */

interface PracticeStats {
  totalCount: number;
  avgScore: number | null;
  byCategory: Record<string, { count: number; avgScore: number }>;
  byMode: Record<string, { count: number; avgScore: number }>;
  scoreTrend: { date: string; score: number }[];
  weakCategory: string | null;
}

function computeStats(records: PracticeRecord[]): PracticeStats {
  const byCategory: Record<string, { total: number; count: number }> = {};
  const trend: { date: string; score: number }[] = [];

  for (const r of records) {
    if (r.score != null) {
      const cat = r.questionCategory || "其他";
      if (!byCategory[cat]) byCategory[cat] = { total: 0, count: 0 };
      byCategory[cat].total += r.score;
      byCategory[cat].count++;

      const dateStr = r.createdAt instanceof Date
        ? r.createdAt.toISOString().slice(0, 10)
        : String(r.createdAt).slice(0, 10);
      trend.push({ date: dateStr, score: r.score });
    }
  }
  trend.sort((a, b) => a.date.localeCompare(b.date));
  const recentTrend = trend.slice(-10);

  const byCategoryAvg: Record<string, { count: number; avgScore: number }> = {};
  let weakCategory: string | null = null;
  let weakAvg = Infinity;
  for (const [cat, v] of Object.entries(byCategory)) {
    const avg = Math.round((v.total / v.count) * 10) / 10;
    byCategoryAvg[cat] = { count: v.count, avgScore: avg };
    if (avg < weakAvg && v.count >= 2) { weakAvg = avg; weakCategory = cat; }
  }

  const scoredRecords = records.filter((r) => r.score != null);
  const avgScore = scoredRecords.length > 0
    ? Math.round((scoredRecords.reduce((s, r) => s + r.score!, 0) / scoredRecords.length) * 10) / 10
    : null;

  return {
    totalCount: records.length,
    avgScore,
    byCategory: byCategoryAvg,
    byMode: {},
    scoreTrend: recentTrend,
    weakCategory,
  };
}

function scoreLabel(score: number): string {
  if (score >= 4.5) return "优秀";
  if (score >= 4.0) return "良好";
  if (score >= 3.0) return "中等";
  return "需提升";
}

function scoreColor(score: number): string {
  if (score >= 4.5) return "text-emerald-600";
  if (score >= 4.0) return "text-blue-600";
  if (score >= 3.0) return "text-amber-600";
  return "text-red-500";
}

/* ── Category labels ── */

const CATEGORY_LABELS: Record<string, string> = {
  "behavioral": "行为面试",
  "technical": "技术专业",
  "case-study": "案例分析",
  "culture": "文化匹配",
};

function SurfaceHeader({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-[var(--color-muted)]">{eyebrow}</p>
      <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--color-text)]">
        {title}
      </h2>
    </div>
  );
}

/* ── Main page ── */

export default function InterviewPage() {
  const [mounted, setMounted] = useState(false);
  const [practiceRecords, setPracticeRecords] = useState<PracticeRecord[]>([]);
  const [stories, setStories] = useState<StarStory[]>([]);
  const [interviews, setInterviews] = useState<InterviewSchedule[]>([]);
  const [agentSessions, setAgentSessions] = useState<ChatSession[]>([]);
  const [stats, setStats] = useState<PracticeStats>({
    totalCount: 0, avgScore: null, byCategory: {}, byMode: {}, scoreTrend: [], weakCategory: null,
  });

  // Story editor
  const [showStoryEditor, setShowStoryEditor] = useState(false);
  const [editStory, setEditStory] = useState<Partial<StarStory>>({});

  // Initial data load
  useEffect(() => {
    async function load() {
      const [records, s, iv] = await Promise.all([
        db.practiceRecords.toArray(),
        db.stories.toArray(),
        db.interviews.toArray(),
      ]);
      const agentHistory = await listSessions();
      setPracticeRecords(records);
      setStories(s);
      setInterviews(iv);
      setAgentSessions(agentHistory);
      setStats(computeStats(records));
      setMounted(true);
    }
    load();
  }, []);

  // Refresh on visibility change
  useEffect(() => {
    const refresh = () => {
      db.practiceRecords.toArray().then((r) => {
        setPracticeRecords(r);
        setStats(computeStats(r));
      });
      db.stories.toArray().then(setStories);
      db.interviews.toArray().then(setInterviews);
      listSessions().then(setAgentSessions);
    };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  // Story CRUD
  const saveStory = async (story: Partial<StarStory>) => {
    if (!story.title?.trim()) return;
    if (story.id) {
      await db.stories.update(story.id, { ...story });
    } else {
      await db.stories.put({
        title: story.title,
        situation: story.situation || "",
        task: story.task || "",
        action: story.action || "",
        result: story.result || "",
        reflection: story.reflection || "",
        tags: story.tags || [],
        sourceReport: story.sourceReport || 0,
        createdAt: new Date(),
      } as StarStory);
    }
    setShowStoryEditor(false);
    setEditStory({});
    setStories(await db.stories.toArray());
  };

  const deleteStory = async (id: number) => {
    await db.stories.delete(id);
    setStories(await db.stories.toArray());
  };

  const handleConvertToStory = (record: PracticeRecord) => {
    setEditStory({
      title: record.question?.slice(0, 30) || "练习题目",
      situation: "",
      task: record.question || "",
      action: record.answer || "",
      result: "",
      reflection: "",
      tags: [record.questionCategory || ""].filter(Boolean),
    });
    setShowStoryEditor(true);
  };

  const deletePracticeRecord = async (id: number) => {
    await db.practiceRecords.delete(id);
    const records = await db.practiceRecords.toArray();
    setPracticeRecords(records);
    setStats(computeStats(records));
  };

  const openAgentSession = (id: number) => {
    window.open(`/agent?sessionId=${id}`, "_self");
  };

  const deleteAgentSession = async (id: number) => {
    if (!window.confirm("删除这条 Agent 面试记录？原对话也会从历史列表移除。")) return;
    await softDeleteSession(id);
    setAgentSessions(await listSessions());
  };

  // Upcoming interviews (within 30 days)
  const today = new Date().toISOString().slice(0, 10);
  const upcomingInterviews = interviews
    .filter((iv) => iv.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const hasData = practiceRecords.length > 0 || stories.length > 0 || upcomingInterviews.length > 0 || agentSessions.length > 0;

  if (!mounted) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-[var(--color-divider)] rounded" />
        <div className="h-64 bg-[var(--color-divider)] rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-[var(--color-muted)] text-sm mb-1">面试准备</p>
          <div className="flex items-center gap-3">
            <HandwritingTitle as="h1">面试看板</HandwritingTitle>
            {stats.totalCount > 0 && (
              <span className="text-sm text-[var(--color-muted)]">
                {stats.totalCount} 次练习 · {stories.length} 个故事
                {upcomingInterviews.length > 0 && ` · ${upcomingInterviews.length} 场即将面试`}
              </span>
            )}
          </div>
        </div>
        <a href="/agent">
          <WarmButton>
            <MessageCircle size={16} className="mr-1.5" />
            去 Agent 练习
          </WarmButton>
        </a>
      </div>

      {/* Empty state */}
      {!hasData && (
        <PaperCard padding="lg">
          <div className="text-center py-8">
            <Target size={40} className="mx-auto mb-3 text-[var(--color-muted)]" />
            <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--color-text)] mb-2">
              还没有面试练习记录
            </h3>
            <p className="text-sm text-[var(--color-muted)] mb-4 max-w-md mx-auto">
              去 Agent Chat 与纸鸢面试教练对话，开始模拟面试练习。练习完成后这里会自动汇总数据。
            </p>
            <a href="/agent">
              <WarmButton>
                <MessageCircle size={16} className="mr-1.5" />
                开始练习
              </WarmButton>
            </a>
          </div>
        </PaperCard>
      )}

      <section className="space-y-3">
        <SurfaceHeader
          eyebrow="准备区"
          title="准备下一场模拟"
        />
        <InterviewLaunchPanel />
      </section>

      <section className="space-y-3">
        <SurfaceHeader
          eyebrow="历史区"
          title="历史模拟面试"
        />
        <AgentInterviewHistory
          sessions={agentSessions}
          onOpenSession={openAgentSession}
          onDeleteSession={deleteAgentSession}
        />
      </section>

      <section className="space-y-3">
        <SurfaceHeader
          eyebrow="回看区"
          title="复盘与转录回看"
        />
        <InterviewRecapReview
          sessions={agentSessions}
          onOpenSession={openAgentSession}
        />
      </section>

      {stats.totalCount > 0 && (
        <>
          {/* KPI bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <PaperCard padding="md">
              <p className="text-xs text-[var(--color-muted)] mb-1">练习次数</p>
              <p className="text-2xl font-bold text-[var(--color-text)]">{stats.totalCount}</p>
            </PaperCard>
            <PaperCard padding="md">
              <p className="text-xs text-[var(--color-muted)] mb-1">平均分</p>
              <p className={`text-2xl font-bold ${stats.avgScore ? scoreColor(stats.avgScore) : "text-[var(--color-muted)]"}`}>
                {stats.avgScore != null ? `${stats.avgScore} / 5` : "—"}
                {stats.avgScore != null && (
                  <span className="text-sm font-normal ml-1">{scoreLabel(stats.avgScore)}</span>
                )}
              </p>
            </PaperCard>
            <PaperCard padding="md">
              <p className="text-xs text-[var(--color-muted)] mb-1">STAR 故事</p>
              <p className="text-2xl font-bold text-[var(--color-text)]">{stories.length}</p>
            </PaperCard>
            <PaperCard padding="md">
              <p className="text-xs text-[var(--color-muted)] mb-1">即将面试</p>
              <p className="text-2xl font-bold text-[var(--color-text)]">{upcomingInterviews.length}</p>
            </PaperCard>
          </div>

          {/* Trend + category */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Score trend */}
            <PaperCard padding="md">
              <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] mb-3 flex items-center gap-2">
                <TrendingUp size={14} className="text-[var(--color-primary)]" />
                练习趋势
              </h3>
              {stats.scoreTrend.length > 1 ? (
                <div className="flex items-end gap-1 h-32">
                  {stats.scoreTrend.map((t, i) => {
                    const h = Math.max(8, (t.score / 5) * 100);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-[20px]">
                        <span className="text-[10px] text-[var(--color-muted)]">{t.score}</span>
                        <div
                          className="w-full rounded-t-sm bg-[var(--color-primary)] opacity-70 hover:opacity-100 transition-opacity"
                          style={{ height: `${h}%` }}
                        />
                        <span className="text-[9px] text-[var(--color-muted)] rotate-45 origin-left whitespace-nowrap">
                          {t.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-[var(--color-muted)]">再练几次就能看到趋势了</p>
              )}
            </PaperCard>

            {/* Category distribution */}
            <PaperCard padding="md">
              <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] mb-3 flex items-center gap-2">
                <BarChart3 size={14} className="text-[var(--color-primary)]" />
                题型分布
              </h3>
              {Object.keys(stats.byCategory).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(stats.byCategory).map(([cat, v]) => {
                    const label = CATEGORY_LABELS[cat] || cat;
                    const isWeak = stats.weakCategory === cat;
                    return (
                      <div key={cat} className="flex items-center gap-2">
                        <span className={`text-sm w-20 shrink-0 ${isWeak ? "text-amber-600 font-medium" : "text-[var(--color-text-soft)]"}`}>
                          {label} {isWeak && "⚠️"}
                        </span>
                        <div className="flex-1 h-4 bg-[var(--color-divider)] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isWeak ? "bg-amber-400" : "bg-[var(--color-primary)]"} opacity-60`}
                            style={{ width: `${(v.count / stats.totalCount) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-[var(--color-muted)] w-16 text-right">
                          {v.count}次 · {v.avgScore}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-[var(--color-muted)]">完成评分练习后展示题型分布</p>
              )}
              {stats.weakCategory && (
                <div className="mt-3 pt-3 border-t border-[var(--color-divider)]">
                  <p className="text-sm text-amber-600 mb-2">
                    你的「{CATEGORY_LABELS[stats.weakCategory] || stats.weakCategory}」类题目均分最低
                  </p>
                  <a href={`/agent?coach=true&focus=${encodeURIComponent(stats.weakCategory)}`}>
                    <WarmButton className="text-xs">
                      <Target size={14} className="mr-1" />
                      针对性练习 →
                    </WarmButton>
                  </a>
                </div>
              )}
            </PaperCard>
          </div>
        </>
      )}

      {/* ── Practice records + STAR stories ── */}
      {(practiceRecords.length > 0 || stories.length > 0) && (
        <PracticeRecords
          records={practiceRecords}
          stories={stories}
          onRePractice={(record) => {
            const params = new URLSearchParams();
            params.set("coach", "true");
            if (record.questionCategory) params.set("category", record.questionCategory);
            window.open(`/agent?${params.toString()}`, "_self");
          }}
          onDeleteRecord={deletePracticeRecord}
          onConvertToStory={handleConvertToStory}
          onViewStory={(story) => {
            setEditStory(story);
            setShowStoryEditor(true);
          }}
          onDeleteStory={deleteStory}
          collapsed={false}
          onToggleCollapse={() => {}}
        />
      )}

      {upcomingInterviews.length > 0 && (
        <PaperCard padding="md">
          <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] mb-3 flex items-center gap-2">
            <Calendar size={14} className="text-[var(--color-primary)]" />
            即将面试
          </h3>
          <div className="space-y-2">
            {upcomingInterviews.map((iv) => (
              <div
                key={iv.id}
                className="flex items-center gap-4 text-sm p-3 rounded-[var(--radius-sm)] bg-[var(--color-divider)] group"
              >
                <span className="font-bold text-[var(--color-primary)] min-w-[60px]">{iv.date}</span>
                <span className="text-[var(--color-text)] flex-1">{iv.company} — {iv.role || `R${iv.round}`}</span>
                <span className="text-xs text-[var(--color-muted)]">
                  {iv.format === "video" ? "视频面试" : iv.format === "phone" ? "电话面试" : "现场面试"}
                </span>
                <a
                  href={`/agent?coach=true&company=${encodeURIComponent(iv.company)}${iv.role ? `&role=${encodeURIComponent(iv.role)}` : ""}`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <span className="text-xs text-[var(--color-primary)] flex items-center gap-1">
                    <Target size={12} /> 准备
                  </span>
                </a>
              </div>
            ))}
          </div>
        </PaperCard>
      )}

      {/* ── Story editor modal ── */}
      <AnimatePresence>
        {showStoryEditor && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/20 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowStoryEditor(false)}
            />
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-[var(--shadow-lg)]"
                initial={{ scale: 0.95, y: 16 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 16 }}
              >
                <HandwritingTitle as="h2" className="mb-4">
                  {editStory.id ? "编辑故事" : "添加故事"}
                </HandwritingTitle>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-[var(--color-text-soft)] mb-1">故事标题</label>
                    <input
                      value={editStory.title || ""}
                      onChange={(e) => setEditStory({ ...editStory, title: e.target.value })}
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                    />
                  </div>
                  {[
                    { key: "situation", label: "情境 (Situation)", placeholder: "当时的背景和处境是什么？" },
                    { key: "task", label: "任务 (Task)", placeholder: "你需要完成什么任务？" },
                    { key: "action", label: "行动 (Action)", placeholder: "你采取了什么行动？" },
                    { key: "result", label: "结果 (Result)", placeholder: "取得了什么成果？有数据吗？" },
                    { key: "reflection", label: "反思 (Reflection)", placeholder: "学到了什么？下次怎么改进？" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="block text-sm text-[var(--color-text-soft)] mb-1">{label}</label>
                      <textarea
                        value={(editStory as Record<string, string>)[key] || ""}
                        onChange={(e) => setEditStory({ ...editStory, [key]: e.target.value })}
                        rows={key === "situation" || key === "action" ? 3 : 2}
                        placeholder={placeholder}
                        className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] resize-none"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="block text-sm text-[var(--color-text-soft)] mb-1">标签（逗号分隔）</label>
                    <input
                      value={(editStory.tags || []).join(", ")}
                      onChange={(e) =>
                        setEditStory({
                          ...editStory,
                          tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                        })
                      }
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4">
                  <WarmButton onClick={() => saveStory(editStory)}>
                    <Star size={14} className="mr-1" />
                    保存
                  </WarmButton>
                  <WarmButton onClick={() => setShowStoryEditor(false)}>取消</WarmButton>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add story FAB */}
      {!showStoryEditor && (
        <div className="fixed bottom-6 right-6 z-30">
          <WarmButton
            onClick={() => {
              setEditStory({});
              setShowStoryEditor(true);
            }}
          >
            <Plus size={16} className="mr-1.5" />
            添加故事
          </WarmButton>
        </div>
      )}
    </div>
  );
}
