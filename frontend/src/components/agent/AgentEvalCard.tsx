"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, FileText, Briefcase, Trash2, Sparkles } from "lucide-react";
import { WarmButton, ScoreBadge } from "@/components/design";
import type { EvalStreamState } from "@/lib/use-evaluation-stream";
import db from "@/lib/db";
import { createJD } from "@/lib/jd-storage";
import type { Application, ApplicationStatus } from "@/types";

/* ── HITL button state ── */
type ButtonState = "idle" | "done";

interface AgentEvalCardProps {
  evalState: EvalStreamState;
}

export default function AgentEvalCard({ evalState }: AgentEvalCardProps) {
  const { phase, ocrProgress, blocks, overallScore, company, role, archetype, jdText, done, error } = evalState;

  const [jdSaved, setJdSaved] = useState<ButtonState>("idle");
  const [trackerSaved, setTrackerSaved] = useState<ButtonState>("idle");
  const [discarded, setDiscarded] = useState(false);
  const [saving, setSaving] = useState(false);

  const blockKeys = ["a", "b", "c", "d", "e", "f", "g"] as const;
  const completedBlocks = blockKeys.filter((bk) => blocks[bk]?.status === "done").length;
  const activeBlock = blockKeys.find((bk) => blocks[bk]?.status === "streaming");

  /* ── Phase label ── */
  const phaseLabel = () => {
    if (error) return "评估中断";
    if (done) return "评估完成";
    if (phase === "extracting_ocr") return `正在识别截图 (${ocrProgress?.current || 0}/${ocrProgress?.total || 0})...`;
    if (phase === "extracting_jd") return "正在获取 JD...";
    if (phase === "detecting_archetype") return "正在分析职位类型...";
    if (activeBlock) return `正在生成 ${blocks[activeBlock]?.label}...`;
    return "评估中...";
  };

  /* ── Save handlers ── */
  const handleSaveToJDLibrary = useCallback(async () => {
    if (jdSaved === "done" || !jdText) return;
    setSaving(true);
    try {
      await createJD({
        company: company || "未知",
        role: role || "未知",
        sourceType: "agent",
        body: jdText,
        keywords: [],
      });
      setJdSaved("done");
    } catch { /* ignore */ }
    setSaving(false);
  }, [jdSaved, jdText, company, role]);

  const handleAddToTracker = useCallback(async () => {
    if (trackerSaved === "done") return;
    setSaving(true);
    try {
      const allApps = await db.applications.toArray();
      const maxNum = allApps.reduce((max, a) => Math.max(max, a.num), 0);
      const app: Application = {
        num: maxNum + 1,
        date: new Date().toISOString().split("T")[0],
        company: company || "未知",
        role: role || "未知",
        score: overallScore,
        status: "evaluated" as ApplicationStatus,
        pdfGenerated: false,
        reportPath: "",
        notes: `Archetype: ${archetype}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.applications.add(app);
      setTrackerSaved("done");
    } catch { /* ignore */ }
    setSaving(false);
  }, [trackerSaved, company, role, overallScore, archetype]);

  const handleDiscard = useCallback(() => {
    setDiscarded(true);
  }, []);

  /* ── Not started yet ── */
  if (phase === "connecting" || (!done && completedBlocks === 0 && !activeBlock)) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <Loader2 size={14} className="animate-spin" />
          {phaseLabel()}
        </div>
      </motion.div>
    );
  }

  /* ── Error state ── */
  if (error && !done) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-red-50/30 border border-red-200 rounded-[var(--radius-md)] px-4 py-3">
        <p className="text-sm text-red-600">{error}</p>
      </motion.div>
    );
  }

  /* ── HITL: all buttons done or discarded ── */
  if ((jdSaved === "done" || trackerSaved === "done" || discarded) && done) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <Check size={16} className="text-emerald-500" />
          <span className="font-medium text-[var(--color-text)]">{company} — {role}</span>
          <ScoreBadge score={overallScore} size="sm" />
        </div>
        <div className="flex items-center gap-3 mt-2 text-xs text-[var(--color-muted)]">
          {jdSaved === "done" && <span className="flex items-center gap-1"><Check size={12} className="text-emerald-500" /> JD 已保存</span>}
          {trackerSaved === "done" && <span className="flex items-center gap-1"><Check size={12} className="text-emerald-500" /> 已加入追踪</span>}
          {discarded && <span>已放弃保存</span>}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--color-divider)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {done ? (
            <Sparkles size={16} className="text-[var(--color-primary)]" />
          ) : (
            <Loader2 size={16} className="text-[var(--color-primary)] animate-spin" />
          )}
          <span className="font-[family-name:var(--font-display)] text-sm font-bold text-[var(--color-text)]">
            {done ? `${company || "JD"} — ${role || "评估结果"}` : phaseLabel()}
          </span>
        </div>
        {done && overallScore > 0 && <ScoreBadge score={overallScore} size="sm" />}
      </div>

      {/* Progress bar (during eval) */}
      {!done && (
        <div className="px-4 py-2 bg-[var(--color-bg)]">
          <div className="flex items-center gap-1 flex-wrap">
            {blockKeys.map((bk) => {
              const bs = blocks[bk]?.status;
              return (
                <span
                  key={bk}
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    bs === "done" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                    bs === "streaming" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                    bs === "error" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                    "bg-[var(--color-divider)] text-[var(--color-muted)]"
                  }`}
                >
                  {bk.toUpperCase()}
                  {bs === "done" ? " ✓" : bs === "streaming" ? " ⏳" : bs === "error" ? " ✗" : ""}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Content preview (when done and not yet acted) */}
      {done && (
        <div className="px-4 py-3 space-y-3">
          <div className="text-sm text-[var(--color-text-soft)] space-y-1">
            <p>总分 {overallScore}/5 · {archetype}</p>
            {overallScore >= 4.5 && <p className="text-[var(--color-text)]">匹配度很高，强烈建议投递</p>}
            {overallScore >= 4.0 && overallScore < 4.5 && <p className="text-[var(--color-text)]">匹配度良好，值得认真准备</p>}
            {overallScore >= 3.5 && overallScore < 4.0 && <p className="text-[var(--color-text)]">匹配度尚可，可以尝试</p>}
            {overallScore < 3.5 && overallScore > 0 && <p className="text-[var(--color-text)]">匹配度偏低，建议谨慎考虑</p>}
          </div>

          {/* HITL Buttons */}
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-[var(--color-divider)]">
            <WarmButton
              variant={jdSaved === "done" ? "soft" : "primary"}
              size="sm"
              onClick={handleSaveToJDLibrary}
              disabled={jdSaved === "done" || saving}
            >
              {jdSaved === "done" ? (
                <><Check size={14} className="mr-1" /> 已保存</>
              ) : (
                <><FileText size={14} className="mr-1" /> 保存到 JD 库</>
              )}
            </WarmButton>

            <WarmButton
              variant={trackerSaved === "done" ? "soft" : "primary"}
              size="sm"
              onClick={handleAddToTracker}
              disabled={trackerSaved === "done" || saving}
            >
              {trackerSaved === "done" ? (
                <><Check size={14} className="mr-1" /> 已加入追踪</>
              ) : (
                <><Briefcase size={14} className="mr-1" /> 加入投递追踪</>
              )}
            </WarmButton>

            {overallScore < 3.5 && overallScore > 0 && trackerSaved !== "done" && (
              <span className="text-xs text-[var(--color-muted)]">该岗位匹配度偏低，建议谨慎考虑</span>
            )}

            <WarmButton
              variant="ghost"
              size="sm"
              onClick={handleDiscard}
              disabled={discarded || saving}
            >
              <Trash2 size={14} className="mr-1" />
              {discarded ? "已放弃" : "放弃"}
            </WarmButton>
          </div>
        </div>
      )}
    </motion.div>
  );
}
