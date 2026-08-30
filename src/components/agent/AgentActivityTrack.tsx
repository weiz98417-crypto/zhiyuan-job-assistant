"use client";

import { useEffect, useId, useState } from "react";
import { Progress, Timeline } from "antd";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, ChevronRight, CircleDashed, PauseCircle, ShieldCheck } from "lucide-react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { sanitizeSafeReasoningSummary } from "@/lib/agent/surface-projection";
import type { AgentArtifactRef } from "@/lib/agent/task-journey";

interface AgentActivityTrackProps {
  streaming: boolean;
  status?: string;
  phase?: string | null;
  thinkingContent?: string;
  startTime?: number;
  artifacts?: AgentArtifactRef[];
  evalProgress?: Array<{ block: string; label: string; status: "running" | "done"; score?: number }>;
  resultQuality?: string | null;
}

const PHASE_LABELS: Record<string, string> = {
  understanding: "正在理解你的目标",
  executing: "正在处理相关材料",
  verifying: "正在核对结果",
  reflecting: "正在整理下一步",
  responding: "正在生成回复",
  compressing_context: "正在整理对话上下文",
  extracting_ocr: "正在读取图片内容",
  extracting_jd: "正在提取岗位信息",
  detecting_archetype: "正在识别岗位重点",
};

export default function AgentActivityTrack({
  streaming,
  status,
  phase,
  thinkingContent,
  startTime,
  artifacts = [],
  evalProgress = [],
  resultQuality,
}: AgentActivityTrackProps) {
  const reducedMotion = useReducedMotion();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const isPaused = status === "paused";
  const isWaiting = status === "waiting_user";
  const label = isPaused
    ? "任务已暂停，可随时恢复"
    : isWaiting
      ? "需要你的确认才能继续"
      : PHASE_LABELS[phase || ""] || (streaming ? "纸鸢正在处理" : "处理已完成");
  const orbState = resolveOrbState(phase, isWaiting);
  const safeSummary = sanitizeSafeReasoningSummary(thinkingContent || label, label);
  const completedBlocks = evalProgress.filter((item) => item.status === "done").length;
  const progress = evalProgress.length > 0 ? Math.round((completedBlocks / evalProgress.length) * 100) : undefined;
  const timelineItems = [
    ...(thinkingContent ? [{
      color: isPaused ? "#d99a38" : isWaiting ? "#d99a38" : "#8c6a4a",
      dot: isPaused ? <PauseCircle size={15} /> : isWaiting ? <CircleDashed size={15} /> : <ShieldCheck size={15} />,
      children: <span className="text-xs text-[var(--color-text-soft)]">{safeSummary}</span>,
    }] : []),
    ...(artifacts.length > 0 ? [{
      color: "#8c6a4a",
      dot: <CheckCircle2 size={15} />,
      children: <span className="text-xs text-[var(--color-text-soft)]">已绑定 {artifacts.length} 个版本化材料</span>,
    }] : []),
    ...(resultQuality ? [{
      color: resultQuality === "good" ? "#4c9a72" : "#d99a38",
      dot: <CheckCircle2 size={15} />,
      children: <span className="text-xs text-[var(--color-text-soft)]">结果校验：{resultQuality === "good" ? "通过" : "需要关注"}</span>,
    }] : []),
  ];
  const hasDetails = timelineItems.length > 0;

  useEffect(() => {
    if (!startTime) {
      setElapsedSeconds(0);
      return;
    }
    const updateElapsed = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1_000)));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(timer);
  }, [startTime]);

  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 6 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      className="w-fit max-w-[min(560px,78%)] text-[var(--color-text-soft)]"
      aria-live="polite"
      aria-label="Agent 活动进度"
    >
      <div className="flex min-h-7 max-w-full items-center gap-2 px-1 py-1">
        <ThinkingOrb
          state={orbState}
          size={20}
          theme="auto"
          paused={!streaming || isPaused || isWaiting}
          aria-label={label}
          className="shrink-0"
        />
        <span className="truncate text-xs text-[var(--color-text-soft)]">{label}</span>
        {startTime && (
          <span data-testid="agent-run-elapsed" className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--color-muted)]">
            {formatElapsed(elapsedSeconds)}
          </span>
        )}
        {hasDetails && (
          <button
            type="button"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen((current) => !current)}
            className="relative inline-flex h-6 shrink-0 items-center gap-0.5 rounded-[var(--radius-sm)] px-1.5 text-[11px] text-[var(--color-muted)] transition-colors before:absolute before:-inset-2 before:content-[''] hover:bg-[var(--color-primary-muted)] hover:text-[var(--color-text-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-muted)]"
          >
            <ChevronRight size={12} className={`transition-transform ${detailsOpen ? "rotate-90" : ""}`} />
            详情
          </button>
        )}
      </div>
      {progress !== undefined && (
        <Progress percent={progress} size="small" showInfo={false} strokeColor="#8c6a4a" trailColor="rgba(140,106,74,.16)" className="ml-7 max-w-52" />
      )}
      {detailsOpen && hasDetails && (
        <div id={detailsId} className="ml-7 mt-1 max-w-lg pt-1">
          <Timeline className="mb-0" items={timelineItems} />
        </div>
      )}
    </motion.section>
  );
}

function resolveOrbState(phase: string | null | undefined, isWaiting: boolean): OrbState {
  if (isWaiting) return "listening";
  if (phase === "extracting_ocr" || phase === "extracting_jd") return "searching";
  if (phase === "executing") return "working";
  if (phase === "verifying") return "connecting";
  if (phase === "responding") return "composing";
  return "solving";
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds}s`;
}
