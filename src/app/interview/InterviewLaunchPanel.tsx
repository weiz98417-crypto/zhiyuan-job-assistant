"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, RefreshCw, Target } from "lucide-react";
import { PaperCard, WarmButton } from "@/components/design";
import { getAllJDs } from "@/lib/jd-storage";
import { createSession } from "@/lib/agent/sessions";
import {
  buildInterviewPlanSnapshot,
  createInterviewState,
  interviewTitleFromPlan,
} from "@/lib/agent/interview-session-state";
import { getCVFullText } from "@/lib/cv-storage";
import type { JDRecord } from "@/types";

export default function InterviewLaunchPanel() {
  const [jds, setJds] = useState<JDRecord[]>([]);
  const [selectedJdId, setSelectedJdId] = useState<number | "">("");
  const [cvText, setCvText] = useState("");
  const [mode, setMode] = useState("realistic");
  const [difficulty, setDifficulty] = useState<"normal" | "hard" | "pressure">("normal");
  const [focusAreas, setFocusAreas] = useState("");
  const [allowFollowUps, setAllowFollowUps] = useState(true);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    let allJds = await getAllJDs();
    try {
      const res = await fetch("/api/data/jds", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          allJds = json.data;
        }
      }
    } catch {
      /* keep local fallback */
    }
    const text = getCVFullText();
    setJds(allJds);
    setCvText(text);
    if (allJds.length > 0) {
      const selectedStillExists = allJds.some((jd) => jd.id === selectedJdId);
      if (selectedJdId === "" || !selectedStillExists) {
        setSelectedJdId(allJds[0].id || "");
      }
    }
  };

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedJd = useMemo(
    () => jds.find((jd) => jd.id === selectedJdId),
    [jds, selectedJdId],
  );

  const startMockInterview = async () => {
    if (!selectedJd) return;
    setLoading(true);
    try {
      const snapshot = buildInterviewPlanSnapshot({
        jd: selectedJd,
        resumeText: cvText,
        resumeTitle: "当前简历",
        mode,
        difficulty,
        focusAreas: focusAreas.split(/[,，\n]+/).map((s) => s.trim()).filter(Boolean),
        allowFollowUps,
      });
      const sessionId = await createSession([], {
        title: interviewTitleFromPlan(snapshot),
        interviewState: createInterviewState(snapshot),
      });
      window.open(`/agent?sessionId=${sessionId}`, "_self");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PaperCard padding="md">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs text-[var(--color-muted)] mb-1">面试准备</p>
            <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)]">
              开始真实模拟
            </h3>
          </div>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            <RefreshCw size={12} />
            刷新素材
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs text-[var(--color-muted)]">选择 JD</span>
            <select
              value={selectedJdId}
              onChange={(e) => setSelectedJdId(Number(e.target.value) || "")}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)]"
            >
              <option value="">请选择</option>
              {jds.map((jd) => (
                <option key={jd.id} value={jd.id}>
                  {jd.company} · {jd.role}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs text-[var(--color-muted)]">模式</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)]"
            >
              <option value="realistic">真实模拟</option>
              <option value="pressure">压力面试</option>
              <option value="focused">专项追问</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs text-[var(--color-muted)]">难度</span>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as "normal" | "hard" | "pressure")}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)]"
            >
              <option value="normal">正常</option>
              <option value="hard">偏难</option>
              <option value="pressure">压力</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs text-[var(--color-muted)]">重点方向</span>
            <input
              value={focusAreas}
              onChange={(e) => setFocusAreas(e.target.value)}
              placeholder="例如：项目深挖、沟通协作、JD 匹配"
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)]"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            checked={allowFollowUps}
            onChange={(e) => setAllowFollowUps(e.target.checked)}
          />
          允许自然追问
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-bg)] p-3">
            <div className="flex items-center gap-2 mb-2 text-xs text-[var(--color-muted)]">
              <Target size={12} />
              选中的 JD
            </div>
            <p className="text-sm font-medium text-[var(--color-text)]">
              {selectedJd ? `${selectedJd.company} · ${selectedJd.role}` : "尚未选择"}
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted)] line-clamp-3">
              {selectedJd?.body || "从 JD 管理页选择一个岗位后再开始模拟。"}
            </p>
          </div>

          <div className="rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-bg)] p-3">
            <div className="flex items-center gap-2 mb-2 text-xs text-[var(--color-muted)]">
              <ArrowRight size={12} />
              当前简历
            </div>
            <p className="text-sm font-medium text-[var(--color-text)]">
              {cvText.trim() ? "已读取当前简历" : "简历为空"}
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted)] line-clamp-3">
              {cvText.trim() || "请先在简历管理页补全简历，再开始真实模拟。"}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-[var(--color-muted)]">
            这会冻结本次 JD / 简历快照，之后的改动只影响下一场。
          </p>
          <WarmButton onClick={startMockInterview} disabled={!selectedJd || loading}>
            <ArrowRight size={14} className="mr-1.5" />
            {loading ? "启动中..." : "开始模拟"}
          </WarmButton>
        </div>
      </div>
    </PaperCard>
  );
}
