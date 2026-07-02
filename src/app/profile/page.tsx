"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Target, Star, History, Compass, MapPin, Pencil, Lock, Download,
  RefreshCw, Trash2, Check, AlertTriangle, TrendingUp, Shield,
  Heart, Activity, EyeOff, Clock, Building2, Briefcase, Zap,
} from "lucide-react";
import { PaperCard } from "@/components/design";
import { loadProfile } from "@/lib/profile-storage";
import db from "@/lib/db";
import { syncProfileToCache } from "@/lib/profile-update";
import { useLockedFields } from "@/lib/useLockedFields";
import Link from "next/link";
import SkillRadar from "./SkillRadar";
import SkillGapList from "./SkillGapList";
import PreferenceBars from "./PreferenceBars";
import EvolutionTimeline from "./EvolutionTimeline";
import EditGoalsDialog from "@/components/profile/EditGoalsDialog";
import EditSkillsDialog from "@/components/profile/EditSkillsDialog";
import HistoryDetailDialog from "@/components/profile/HistoryDetailDialog";
import type { ZhiyuanProfile, ProfileHistoryEntry } from "@/types";

/* ── Helpers ── */

const SOURCE_LABELS: Record<string, string> = {
  manual: "手动添加",
  auto: "对话提取",
  inferred: "行为推断",
};

function getCompetitivenessLevel(score: number): { label: string; color: string; bg: string; barColor: string } {
  if (score >= 80) return { label: "高度匹配", color: "text-emerald-600", bg: "bg-emerald-50", barColor: "bg-emerald-500" };
  if (score >= 60) return { label: "具备竞争力", color: "text-blue-600", bg: "bg-blue-50", barColor: "bg-blue-500" };
  if (score >= 40) return { label: "有竞争力", color: "text-amber-600", bg: "bg-amber-50", barColor: "bg-amber-500" };
  if (score >= 20) return { label: "积累中", color: "text-orange-500", bg: "bg-orange-50", barColor: "bg-orange-400" };
  return { label: "起步", color: "text-slate-500", bg: "bg-slate-50", barColor: "bg-slate-400" };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} 天前`;
  return d.toLocaleDateString("zh-CN");
}

interface CompanySignal {
  content_json: { company?: string; liked?: boolean; disliked?: boolean; evidence?: string };
  signal_type: string;
}

interface SkillCandidateSignal {
  id: number;
  source?: string;
  created_at?: string;
  content_json: {
    skill?: string;
    evidence?: string;
    confidence?: number;
    category?: string;
    sourceType?: string;
    status?: string;
  };
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ZhiyuanProfile | null>(null);
  const [reportCount, setReportCount] = useState(0);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<{ entry: ProfileHistoryEntry; index: number } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [companySignals, setCompanySignals] = useState<CompanySignal[]>([]);
  const [pendingSkillCandidates, setPendingSkillCandidates] = useState<SkillCandidateSignal[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const profileDraftOpenRef = useRef(false);

  const { isLocked } = useLockedFields(profile);

  const fetchProfile = useCallback(async (options?: { force?: boolean }) => {
    if (profileDraftOpenRef.current && !options?.force) return;
    try {
      setLoadError(null);
      const res = await fetch("/api/data/profile", { cache: "no-store" });
      if (!res.ok) throw new Error("server load failed");
      const json = await res.json();
      if (!json.success || !json.data) throw new Error("server response failed");
      await syncProfileToCache(json.data);
      const local = await loadProfile();
      if (local) setProfile(local);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "画像数据加载失败");
      return;
    }
    try {
      const repRes = await fetch("/api/data/reports");
      if (repRes.ok) {
        const repJson = await repRes.json();
        setReportCount(Array.isArray(repJson.data) ? repJson.data.length : 0);
      }
    } catch { /* ignore */ }
    // Fetch company preference signals
    try {
      const sigRes = await fetch("/api/data/signals?signal_type=company_pref&limit=30");
      if (sigRes.ok) {
        const sigJson = await sigRes.json();
        if (sigJson.success) setCompanySignals(sigJson.data || []);
      }
    } catch { /* ignore */ }
    try {
      const skillRes = await fetch("/api/data/signals?signal_type=skill_claim&status=candidate&limit=50");
      if (skillRes.ok) {
        const skillJson = await skillRes.json();
        if (skillJson.success) {
          setPendingSkillCandidates((skillJson.data || []).filter((s: SkillCandidateSignal) => s.content_json?.skill));
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    profileDraftOpenRef.current = goalsOpen || skillsOpen || historyOpen;
  }, [goalsOpen, skillsOpen, historyOpen]);

  const refreshProfileAfterSave = useCallback(() => {
    void fetchProfile({ force: true });
  }, [fetchProfile]);

  useEffect(() => {
    fetchProfile();
    const interval = setInterval(fetchProfile, 5000);
    return () => clearInterval(interval);
  }, [fetchProfile]);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  const goalsLocked = isLocked("goals");

  if (loadError) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-text-soft)]">
        画像数据加载失败：{loadError}
      </div>
    );
  }

  const handleSync = async () => {
    setSyncing(true);
    await fetchProfile();
    setSyncing(false);
    setToast("画像已从服务器同步");
  };

  const handleExport = () => {
    if (!profile) return;
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zhiyuan-profile-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("画像已导出");
  };

  const handleReset = async () => {
    try {
      const res = await fetch("/api/data/profile", { method: "DELETE" });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          // Clear DexieDB cache
          await db.profiles.clear();
          // Set empty profile from server response
          setProfile({ data_json: json.data?.data_json || "{}", goals_json: json.data?.goals_json || "{}", history_json: json.data?.history_json || "[]" } as unknown as ZhiyuanProfile);
        }
      }
      setResetConfirm(false);
      setToast("画像已重置");
    } catch { setToast("重置失败"); }
  };

  const handleRestoreHistory = async (index: number) => {
    await fetchProfile();
    setToast("画像已刷新（还原功能需要历史快照支持）");
  };

  const handleHistoryClick = (entry: ProfileHistoryEntry, index: number) => {
    setSelectedHistory({ entry, index });
    setHistoryOpen(true);
  };

  const handleCandidateAction = async (
    id: number,
    action: "confirm" | "reject" | "edit",
    content_json?: Record<string, unknown>,
  ) => {
    try {
      const res = await fetch("/api/data/signals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, content_json }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || "操作失败");
      setToast(action === "confirm" ? "技能已确认" : action === "reject" ? "候选已拒绝" : "候选已更新");
      await fetchProfile();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "操作失败");
    }
  };

  const handleEditCandidate = async (candidate: SkillCandidateSignal) => {
    const currentSkill = candidate.content_json.skill || "";
    const nextSkill = window.prompt("编辑技能名称", currentSkill);
    if (nextSkill === null) return;
    const nextEvidence = window.prompt("编辑证据", candidate.content_json.evidence || "");
    if (nextEvidence === null) return;
    await handleCandidateAction(candidate.id, "edit", {
      skill: nextSkill.trim(),
      evidence: nextEvidence.trim(),
    });
  };

  const handleDeleteCandidate = async (id: number) => {
    try {
      const res = await fetch(`/api/data/signals?id=${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || "删除失败");
      setToast("候选已删除");
      await fetchProfile();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "删除失败");
    }
  };

  /* ── Empty state: no profile at all ── */
  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-6">
        <Compass size={48} className="mx-auto text-[var(--color-primary)]" />
        <div className="space-y-3">
          <h1 className="text-2xl font-display text-[var(--color-text)]">求职画像</h1>
          <p className="text-[var(--color-muted)] leading-relaxed">
            AI 会通过几轮对话帮你梳理求职方向。<br />完成后这里将展示你的专属求职画像。
          </p>
        </div>
        <Link href="/agent" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity">
          <Compass size={16} /> 去纸鸢 Agent 开始自我定位
        </Link>
        <p className="text-xs text-[var(--color-text-soft)]">在聊天中告诉纸鸢你的技能、偏好和求职目标</p>
      </div>
    );
  }

  const { skills, preferences, marketFit, goals, history: profileHistory } = profile;

  const hasGoals = goals?.targetRoles && goals.targetRoles.length > 0;
  const hasSkills = skills && skills.length > 0;
  const hasGaps = marketFit?.skillGaps && marketFit.skillGaps.length > 0;
  const hasHistory = profileHistory && profileHistory.length > 0;
  const hasDealBreakers = goals?.dealBreakers && goals.dealBreakers.length > 0;

  // Company signals
  const likedCompanies = companySignals.filter((s) => s.content_json?.liked).map((s) => s.content_json.company || "").filter(Boolean);
  const dislikedCompanies = companySignals.filter((s) => s.content_json?.disliked).map((s) => s.content_json.company || "").filter(Boolean);

  // Preferences
  const hasIndustryPrefs = preferences?.industry && Object.keys(preferences.industry).length > 0;
  const hasSalaryPref = goals?.salaryRange?.max && goals.salaryRange.max > 0;
  const hasAnyPref = hasIndustryPrefs || hasSalaryPref || likedCompanies.length > 0 || dislikedCompanies.length > 0;

  // Level
  const scoreLevel = getCompetitivenessLevel(marketFit?.overallScore || 0);

  // Dimension breakdown (derived)
  const skillAvgProficiency = hasSkills
    ? Math.round(skills.reduce((sum, s) => sum + (s.proficiency || 50), 0) / skills.length)
    : 0;
  const marketDemandScore = marketFit?.topArchetypes?.length ? Math.min(100, marketFit.topArchetypes.length * 30) : 0;
  const industryMatchScore = hasIndustryPrefs ? Math.min(100, Object.keys(preferences.industry).length * 20) : 0;
  const gapsPenalty = hasGaps ? Math.max(0, 100 - marketFit.skillGaps.length * 15) : 80;

  const dimensions = [
    { label: "技能覆盖", value: hasSkills ? skillAvgProficiency : 0, icon: Zap },
    { label: "行业匹配", value: industryMatchScore, icon: Building2 },
    { label: "市场需求", value: marketDemandScore, icon: TrendingUp },
    { label: "技能缺口", value: gapsPenalty, icon: Target },
  ];

  // Thresholds (lowered per Group 5)
  const showSkillRadar = hasSkills && (skills.length >= 3 || reportCount >= 1);
  const showSkillGaps = hasGaps || reportCount >= 2;
  const hasNonZeroPref =
    (preferences?.companySize && (preferences.companySize.startup > 0 || preferences.companySize.sme > 0 || preferences.companySize.large > 0)) ||
    (preferences?.salaryTarget && (preferences.salaryTarget.min > 0 || preferences.salaryTarget.max > 0)) ||
    (preferences?.industry && Object.keys(preferences.industry).length > 0);
  const showPrefBars = hasNonZeroPref;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display text-[var(--color-text)]">求职画像</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            上次更新：{formatTime(profile.lastUpdated)}
            {" · "}由 Agent 对话和评估自动更新
            <Link href="/agent" className="text-[var(--color-primary)] hover:underline ml-1">去更新 →</Link>
          </p>
        </div>
        {marketFit?.overallScore > 0 && (
          <div className={`flex items-center gap-3 px-4 py-2 rounded-xl ${scoreLevel.bg}`}>
            <div className="text-right">
              <p className="text-xs text-[var(--color-muted)]">竞争力评级</p>
              <p className={`text-lg font-display font-bold ${scoreLevel.color}`}>{scoreLevel.label}</p>
            </div>
            <div className="text-3xl font-display font-bold text-[var(--color-primary)]">{marketFit.overallScore}</div>
          </div>
        )}
      </div>

      {/* ── Card 1: 目标方向 ── */}
      <PaperCard padding="md">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-[var(--color-text)] flex items-center gap-2">
            <MapPin size={16} className="text-[var(--color-primary)]" /> 目标方向
          </h2>
          <div className="flex items-center gap-1.5">
            {goalsLocked && <Lock size={12} className="text-[var(--color-primary)]" />}
            <button onClick={() => setGoalsOpen(true)} className="p-1 rounded hover:bg-[var(--color-bg-alt)] text-[var(--color-muted)] hover:text-[var(--color-primary)]" title="编辑目标">
              <Pencil size={14} />
            </button>
          </div>
        </div>
        {hasGoals ? (
          <>
            <div className="flex flex-wrap gap-2 mb-2">
              {goals!.targetRoles.map((r, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-primary-muted)] text-sm text-[var(--color-primary)]">
                  <Briefcase size={14} />{r.role}{r.level ? ` (${r.level})` : ""}
                </span>
              ))}
            </div>
            {goals?.companyPrefs?.industry && goals.companyPrefs.industry.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-xs text-[var(--color-muted)]">偏好行业：</span>
                {goals.companyPrefs.industry.map((ind, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded bg-[var(--color-bg-alt)] text-[var(--color-text-soft)]">{ind}</span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-[var(--color-muted)] text-center py-4">
            <Compass size={20} className="mx-auto mb-2 text-[var(--color-primary)]" />
            <p>还未设定求职目标方向</p>
            <Link href="/agent" className="text-[var(--color-primary)] hover:underline text-xs mt-1 inline-block">去纸鸢 Agent 聊聊求职方向 →</Link>
          </div>
        )}
      </PaperCard>

      {/* ── Card 2: 核心技能 ── */}
      <PaperCard padding="md">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-[var(--color-text)] flex items-center gap-2">
            <Zap size={16} className="text-[var(--color-primary)]" /> 核心技能
          </h2>
          <button onClick={() => setSkillsOpen(true)} className="p-1 rounded hover:bg-[var(--color-bg-alt)] text-[var(--color-muted)] hover:text-[var(--color-primary)]" title="编辑技能">
            <Pencil size={14} />
          </button>
        </div>
        {hasSkills ? (
          <div className="space-y-2">
            {skills.map((s, i) => (
              <div key={i} className="flex items-center gap-3 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--color-text)]">{s.name}</span>
                    {s.source && (
                      <span className={`text-[10px] px-1.5 py-px rounded-full ${
                        s.source === "manual" ? "bg-[var(--color-primary-muted)] text-[var(--color-primary)]" :
                        s.source === "auto" ? "bg-emerald-100 text-emerald-700" :
                        "bg-slate-100 text-slate-600"
                      }`}>
                        {SOURCE_LABELS[s.source] || s.source}
                      </span>
                    )}
                    {s.evidence && s.evidence.length > 0 && (
                      <span className="text-[10px] text-[var(--color-text-soft)]" title={s.evidence.join("；")}>
                        ({s.evidence.length} 条证据)
                      </span>
                    )}
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-[var(--color-divider)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                      style={{ width: `${s.proficiency || 50}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-[var(--color-muted)] w-8 text-right tabular-nums">{s.proficiency || 50}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[var(--color-muted)] text-center py-4">
            <Zap size={20} className="mx-auto mb-2 text-[var(--color-primary)]" />
            <p>尚未识别到技能信息</p>
            <p className="text-xs mt-1">在 Agent 对话中提及你的技能（如"我精通 React"），系统会自动提取</p>
          </div>
        )}
        {pendingSkillCandidates.length > 0 && (
          <div className="mt-4 border-t border-[var(--color-divider)] pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-[var(--color-text)]">待确认技能</p>
              <span className="text-[10px] text-[var(--color-muted)]">{pendingSkillCandidates.length} 项</span>
            </div>
            <div className="space-y-2">
              {pendingSkillCandidates.slice(0, 8).map((candidate) => (
                <div key={candidate.id} className="flex items-start gap-2 rounded border border-[var(--color-divider)] px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm text-[var(--color-text)]">{candidate.content_json.skill}</span>
                      <span className="text-[10px] px-1.5 py-px rounded-full bg-amber-50 text-amber-700 border border-amber-100">候选</span>
                      {candidate.content_json.confidence !== undefined && (
                        <span className="text-[10px] text-[var(--color-muted)]">
                          {Math.round((candidate.content_json.confidence || 0) * 100)}
                        </span>
                      )}
                    </div>
                    {candidate.content_json.evidence && (
                      <p className="mt-1 truncate text-xs text-[var(--color-muted)]" title={candidate.content_json.evidence}>
                        {candidate.content_json.evidence}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      onClick={() => handleCandidateAction(candidate.id, "confirm")}
                      className="p-1 rounded text-emerald-600 hover:bg-emerald-50"
                      title="确认"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onClick={() => handleEditCandidate(candidate)}
                      className="p-1 rounded text-[var(--color-muted)] hover:bg-[var(--color-bg-alt)] hover:text-[var(--color-primary)]"
                      title="编辑"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleCandidateAction(candidate.id, "reject")}
                      className="p-1 rounded text-amber-600 hover:bg-amber-50"
                      title="拒绝"
                    >
                      <EyeOff size={13} />
                    </button>
                    <button
                      onClick={() => handleDeleteCandidate(candidate.id)}
                      className="p-1 rounded text-red-500 hover:bg-red-50"
                      title="删除"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </PaperCard>

      {/* ── Card 3: 底线条件 ── */}
      <PaperCard padding="md">
        <h2 className="text-sm font-medium text-[var(--color-text)] flex items-center gap-2 mb-3">
          <Shield size={16} className="text-[var(--color-primary)]" /> 底线条件
        </h2>
        {hasDealBreakers || dislikedCompanies.length > 0 ? (
          <div className="space-y-2">
            {hasDealBreakers && goals!.dealBreakers.map((db, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-red-400 flex-shrink-0">✗</span>
                <span className="text-[var(--color-text)]">{db}</span>
              </div>
            ))}
            {dislikedCompanies.map((c, i) => (
              <div key={`dc-${i}`} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-red-400 flex-shrink-0">✗</span>
                <span className="text-[var(--color-text)]">不考虑 <span className="font-medium">{c}</span></span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[var(--color-muted)] text-center py-4">
            <EyeOff size={20} className="mx-auto mb-2 text-[var(--color-primary)]" />
            <p>尚未发现明确的底线条件</p>
            <p className="text-xs mt-1">在对话中说出你的底线（如"不接受 996"），系统会自动记录</p>
          </div>
        )}
      </PaperCard>

      {/* ── Card 4: 偏好信号 ── */}
      <PaperCard padding="md">
        <h2 className="text-sm font-medium text-[var(--color-text)] flex items-center gap-2 mb-3">
          <Heart size={16} className="text-[var(--color-primary)]" /> 偏好信号
        </h2>
        {hasAnyPref ? (
          <div className="space-y-3">
            {likedCompanies.length > 0 && (
              <div>
                <p className="text-xs text-[var(--color-muted)] mb-1.5">想去的公司</p>
                <div className="flex flex-wrap gap-1.5">
                  {likedCompanies.map((c, i) => (
                    <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{c}</span>
                  ))}
                </div>
              </div>
            )}
            {hasIndustryPrefs && (
              <div>
                <p className="text-xs text-[var(--color-muted)] mb-1.5">行业偏好</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(preferences.industry).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                    <span key={k} className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      {k} <span className="text-blue-400">{Math.round(v * 100)}%</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {hasSalaryPref && (
              <div>
                <p className="text-xs text-[var(--color-muted)] mb-1.5">薪资期望</p>
                <span className="text-sm font-medium text-[var(--color-text)]">
                  {goals!.salaryRange.min}K - {goals!.salaryRange.max}K / 月
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-[var(--color-muted)] text-center py-4">
            <Heart size={20} className="mx-auto mb-2 text-[var(--color-primary)]" />
            <p>尚未收集到偏好信号</p>
            <p className="text-xs mt-1">评估更多 JD 或在对话中表达偏好，系统会逐步学习你的求职倾向</p>
          </div>
        )}
      </PaperCard>

      {/* ── Card 5: 竞争力概览 ── */}
      <PaperCard padding="md">
        <h2 className="text-sm font-medium text-[var(--color-text)] flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-[var(--color-primary)]" /> 竞争力概览
        </h2>

        {/* Score progress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-[var(--color-muted)]">综合评分</span>
            <span className={`text-xs font-medium ${scoreLevel.color}`}>{scoreLevel.label}</span>
          </div>
          <div className="h-2.5 rounded-full bg-[var(--color-divider)] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${scoreLevel.barColor}`}
              style={{ width: `${Math.max(5, marketFit?.overallScore || 0)}%` }}
            />
          </div>
          {/* Level markers */}
          <div className="flex justify-between mt-1 text-[10px] text-[var(--color-text-soft)]">
            <span>起步</span><span>积累中</span><span>有竞争力</span><span>具备竞争力</span><span>高度匹配</span>
          </div>
        </div>

        {/* Dimension breakdown */}
        <div className="space-y-2.5">
          <p className="text-xs text-[var(--color-muted)]">维度分解</p>
          {dimensions.map((dim) => (
            <div key={dim.label} className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-20 flex-shrink-0">
                <dim.icon size={12} className="text-[var(--color-muted)]" />
                <span className="text-xs text-[var(--color-text-soft)]">{dim.label}</span>
              </div>
              <div className="flex-1 h-1.5 rounded-full bg-[var(--color-divider)] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    dim.value >= 70 ? "bg-emerald-500" : dim.value >= 40 ? "bg-amber-500" : "bg-slate-400"
                  }`}
                  style={{ width: `${Math.max(5, dim.value)}%` }}
                />
              </div>
              <span className="text-xs text-[var(--color-muted)] w-8 text-right tabular-nums">{dim.value}</span>
            </div>
          ))}
        </div>

        {marketFit?.topArchetypes?.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[var(--color-divider)]">
            <p className="text-xs text-[var(--color-muted)] mb-1.5">最适合的职业方向</p>
            <div className="flex flex-wrap gap-1.5">
              {marketFit.topArchetypes.map((a, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-[var(--color-primary-muted)] text-[var(--color-primary)]">{a}</span>
              ))}
            </div>
          </div>
        )}
      </PaperCard>

      {/* ── Card 6: 最近活动 ── */}
      <PaperCard padding="md">
        <h2 className="text-sm font-medium text-[var(--color-text)] flex items-center gap-2 mb-3">
          <Activity size={16} className="text-[var(--color-primary)]" /> 最近活动
        </h2>
        {hasHistory ? (
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
            {profileHistory.slice(-10).reverse().map((entry, i) => (
              <div
                key={i}
                className="flex items-start gap-3 py-1.5 px-2 -mx-2 rounded hover:bg-[var(--color-bg-alt)] cursor-pointer transition-colors"
                onClick={() => handleHistoryClick(entry, profileHistory.length - 1 - i)}
              >
                <Clock size={12} className="mt-0.5 flex-shrink-0 text-[var(--color-text-soft)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--color-text)]">{entry.event}</p>
                  {entry.changes && entry.changes.length > 0 && (
                    <p className="text-xs text-[var(--color-muted)] mt-0.5 truncate">{entry.changes[0]}</p>
                  )}
                </div>
                <span className="text-xs text-[var(--color-text-soft)] flex-shrink-0">{formatTime(entry.timestamp)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[var(--color-muted)] text-center py-4">
            <Activity size={20} className="mx-auto mb-2 text-[var(--color-primary)]" />
            <p>暂无活动记录</p>
            <p className="text-xs mt-1">每次聊天和评估都会在这里留下记录</p>
          </div>
        )}
      </PaperCard>

      {/* ── 可视化分析区域 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <PaperCard padding="md">
            <h2 className="text-sm font-medium text-[var(--color-text)] mb-4 flex items-center gap-2">
              <Target size={16} className="text-[var(--color-primary)]" /> 技能雷达
            </h2>
            {showSkillRadar ? (
              <SkillRadar skills={skills} />
            ) : (
              <div className="text-sm text-[var(--color-muted)] text-center py-8">
                <Compass size={24} className="mx-auto mb-2 text-[var(--color-text-soft)]" />
                <p>{!hasSkills ? "去 Agent 对话中聊聊你的技能" : skills.length < 3 ? `已有 ${skills.length} 项技能，再积累 ${3 - skills.length} 项或完成 1 次 JD 评估` : "完成 1 次 JD 评估来解锁雷达图"}</p>
              </div>
            )}
          </PaperCard>
          <PaperCard padding="md">
            <h2 className="text-sm font-medium text-[var(--color-text)] mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-[var(--color-primary)]" /> 技能缺口
            </h2>
            {showSkillGaps ? (
              <SkillGapList gaps={marketFit?.skillGaps || []} />
            ) : (
              <div className="text-sm text-[var(--color-muted)] text-center py-8">
                <Target size={24} className="mx-auto mb-2 text-[var(--color-text-soft)]" />
                <p>完成 2 次 JD 评估或发现技能缺口数据后展示</p>
              </div>
            )}
          </PaperCard>
        </div>
        <div className="space-y-6">
          <PaperCard padding="md">
            <h2 className="text-sm font-medium text-[var(--color-text)] mb-4">偏好分布</h2>
            {showPrefBars ? (
              <PreferenceBars preferences={preferences} />
            ) : (
              <div className="text-sm text-[var(--color-muted)] text-center py-8">
                <Compass size={24} className="mx-auto mb-2 text-[var(--color-text-soft)]" />
                <p>偏好数据将从 JD 评估中逐步积累</p>
                <p className="text-xs mt-1">评估岗位越多，偏好分布越准确</p>
              </div>
            )}
          </PaperCard>
          <PaperCard padding="md">
            <h2 className="text-sm font-medium text-[var(--color-text)] mb-4 flex items-center gap-2">
              <History size={16} className="text-[var(--color-primary)]" /> 进化轨迹
            </h2>
            {hasHistory ? (
              <div className="max-h-72 overflow-y-auto pr-1 scrollbar-thin cursor-pointer" onClick={() => profileHistory && profileHistory.length > 0 && handleHistoryClick(profileHistory[profileHistory.length - 1], profileHistory.length - 1)}>
                <EvolutionTimeline history={profileHistory} />
              </div>
            ) : (
              <div className="text-sm text-[var(--color-muted)] text-center py-8">
                <Clock size={24} className="mx-auto mb-2 text-[var(--color-text-soft)]" />
                <p>暂无进化记录</p>
              </div>
            )}
          </PaperCard>
        </div>
      </div>

      {/* ── Data Operations ── */}
      <div className="pt-4 border-t border-[var(--color-divider)]">
        <p className="text-xs text-[var(--color-muted)] mb-3">数据操作</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleSync} disabled={syncing} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-[var(--color-divider)] text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] disabled:opacity-50">
            <RefreshCw size={12} className={syncing ? "animate-spin" : ""} /> {syncing ? "同步中..." : "从服务器同步"}
          </button>
          <button onClick={handleExport} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-[var(--color-divider)] text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]">
            <Download size={12} /> 导出画像 JSON
          </button>
          {resetConfirm ? (
            <div className="inline-flex items-center gap-1.5">
              <button onClick={handleReset} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-red-500 text-white"><AlertTriangle size={12} /> 确认重置</button>
              <button onClick={() => setResetConfirm(false)} className="px-3 py-1.5 text-xs rounded border border-[var(--color-divider)] text-[var(--color-muted)]">取消</button>
            </div>
          ) : (
            <button onClick={() => setResetConfirm(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-red-200 text-red-400 hover:bg-red-50 hover:border-red-300">
              <Trash2 size={12} /> 重置画像
            </button>
          )}
        </div>
      </div>

      {/* ── Dialogs ── */}
      <EditGoalsDialog open={goalsOpen} goals={profile.goals} isLocked={goalsLocked} onClose={() => setGoalsOpen(false)} onSaved={refreshProfileAfterSave} />
      <EditSkillsDialog open={skillsOpen} skills={skills} onClose={() => setSkillsOpen(false)} onSaved={refreshProfileAfterSave} />
      <HistoryDetailDialog open={historyOpen} entry={selectedHistory?.entry || null} entryIndex={selectedHistory?.index || 0} onClose={() => setHistoryOpen(false)} onRestore={handleRestoreHistory} />

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-text)] text-white text-sm shadow-lg">
          <Check size={14} /> {toast}
        </div>
      )}
    </div>
  );
}
