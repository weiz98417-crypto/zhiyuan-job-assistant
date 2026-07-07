"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Briefcase, Check, FileText, Loader2, Sparkles, Trash2 } from "lucide-react";
import { ScoreBadge, WarmButton } from "@/components/design";
import type { EvalStreamState } from "@/lib/use-evaluation-stream";
import { createJD } from "@/lib/jd-storage";

type ButtonState = "idle" | "done";

interface AgentEvalCardProps {
  evalState: EvalStreamState;
}

const BLOCK_KEYS = ["a", "b", "c", "d", "e", "f", "g"] as const;

export default function AgentEvalCard({ evalState }: AgentEvalCardProps) {
  const { phase, ocrProgress, blocks, overallScore, company, role, archetype, jdText, done, error } = evalState;
  const [jdSaved, setJdSaved] = useState<ButtonState>("idle");
  const [trackerSaved, setTrackerSaved] = useState<ButtonState>("idle");
  const [discarded, setDiscarded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  const completedBlocks = BLOCK_KEYS.filter((key) => blocks[key]?.status === "done").length;
  const activeBlock = BLOCK_KEYS.find((key) => blocks[key]?.status === "streaming");

  const phaseLabel = () => {
    if (error) return "评估中断";
    if (done) return "评估完成";
    if (phase === "extracting_ocr") return `正在识别截图 (${ocrProgress?.current || 0}/${ocrProgress?.total || 0})...`;
    if (phase === "extracting_jd") return "正在获取 JD...";
    if (phase === "detecting_archetype") return "正在分析职位类型...";
    if (activeBlock) return `正在生成 ${blocks[activeBlock]?.label || activeBlock.toUpperCase()}...`;
    return "评估中...";
  };

  const handleSaveToJDLibrary = useCallback(async () => {
    if (jdSaved === "done" || !jdText) return;
    setSaving(true);
    setActionError("");
    try {
      await createJD({
        company: company || "未知公司",
        role: role || "未知岗位",
        sourceType: "agent",
        body: jdText,
        keywords: [],
      });
      setJdSaved("done");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "保存 JD 失败");
    } finally {
      setSaving(false);
    }
  }, [jdSaved, jdText, company, role]);

  const handleAddToTracker = useCallback(async () => {
    if (trackerSaved === "done") return;
    setSaving(true);
    setActionError("");
    try {
      const res = await fetch("/api/data/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: company || "未知公司",
          role: role || "未知岗位",
          score: overallScore,
          status: "evaluated",
          notes: `Archetype: ${archetype || "unknown"}`,
          source: "agent_eval_card",
          metadata: { archetype: archetype || "unknown" },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success || !json.data?.id) throw new Error(json.error || "pipeline write failed");
      setTrackerSaved("done");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "加入追踪失败");
    } finally {
      setSaving(false);
    }
  }, [trackerSaved, company, role, overallScore, archetype]);

  if (phase === "connecting" || (!done && completedBlocks === 0 && !activeBlock)) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <Loader2 size={14} className="animate-spin" />
          {phaseLabel()}
        </div>
      </motion.div>
    );
  }

  if (error && !done) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[var(--radius-md)] border border-red-200 bg-red-50/30 px-4 py-3">
        <p className="text-sm text-red-600">{error}</p>
      </motion.div>
    );
  }

  if ((jdSaved === "done" || trackerSaved === "done" || discarded) && done) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <Check size={16} className="text-emerald-500" />
          <span className="font-medium text-[var(--color-text)]">{company || "未知公司"} - {role || "未知岗位"}</span>
          <ScoreBadge score={overallScore} size="sm" />
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-[var(--color-muted)]">
          {jdSaved === "done" && <span className="flex items-center gap-1"><Check size={12} className="text-emerald-500" />JD 已保存</span>}
          {trackerSaved === "done" && <span className="flex items-center gap-1"><Check size={12} className="text-emerald-500" />已加入追踪</span>}
          {discarded && <span>已放弃保存</span>}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--color-divider)] px-4 py-3">
        <div className="flex items-center gap-2">
          {done ? <Sparkles size={16} className="text-[var(--color-primary)]" /> : <Loader2 size={16} className="animate-spin text-[var(--color-primary)]" />}
          <span className="font-[family-name:var(--font-display)] text-sm font-bold text-[var(--color-text)]">
            {done ? `${company || "JD"} - ${role || "评估结果"}` : phaseLabel()}
          </span>
        </div>
        {done && overallScore > 0 && <ScoreBadge score={overallScore} size="sm" />}
      </div>

      {!done && (
        <div className="bg-[var(--color-bg)] px-4 py-2">
          <div className="flex flex-wrap items-center gap-1">
            {BLOCK_KEYS.map((key) => {
              const status = blocks[key]?.status;
              const className = status === "done"
                ? "bg-emerald-100 text-emerald-700"
                : status === "streaming"
                  ? "bg-blue-100 text-blue-700"
                  : status === "error"
                    ? "bg-red-100 text-red-700"
                    : "bg-[var(--color-divider)] text-[var(--color-muted)]";
              return (
                <span key={key} className={`rounded-full px-2 py-0.5 text-xs ${className}`}>
                  {key.toUpperCase()}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {done && (
        <div className="space-y-3 px-4 py-3">
          <div className="space-y-1 text-sm text-[var(--color-text-soft)]">
            <p>总分 {overallScore}/5 · {archetype || "unknown"}</p>
            {overallScore >= 4.5 && <p className="text-[var(--color-text)]">匹配度很高，建议优先投递。</p>}
            {overallScore >= 4.0 && overallScore < 4.5 && <p className="text-[var(--color-text)]">匹配度良好，值得认真准备。</p>}
            {overallScore >= 3.5 && overallScore < 4.0 && <p className="text-[var(--color-text)]">匹配度尚可，可以尝试。</p>}
            {overallScore < 3.5 && overallScore > 0 && <p className="text-[var(--color-text)]">匹配度偏低，建议谨慎考虑。</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-divider)] pt-3">
            <WarmButton variant={jdSaved === "done" ? "soft" : "primary"} size="sm" onClick={handleSaveToJDLibrary} disabled={jdSaved === "done" || saving || !jdText}>
              {jdSaved === "done" ? <Check size={14} className="mr-1" /> : <FileText size={14} className="mr-1" />}
              {jdSaved === "done" ? "已保存" : "保存到 JD 库"}
            </WarmButton>

            <WarmButton variant={trackerSaved === "done" ? "soft" : "primary"} size="sm" onClick={handleAddToTracker} disabled={trackerSaved === "done" || saving}>
              {trackerSaved === "done" ? <Check size={14} className="mr-1" /> : <Briefcase size={14} className="mr-1" />}
              {trackerSaved === "done" ? "已加入追踪" : "加入投递追踪"}
            </WarmButton>

            <WarmButton variant="ghost" size="sm" onClick={() => setDiscarded(true)} disabled={discarded || saving}>
              <Trash2 size={14} className="mr-1" />
              {discarded ? "已放弃" : "放弃"}
            </WarmButton>
          </div>

          {actionError && <p className="text-xs text-red-500">{actionError}</p>}
        </div>
      )}
    </motion.div>
  );
}
