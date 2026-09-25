"use client";

/**
 * Run 工具条与撤销横幅(0.11.0-D 任务 5.3:页面巨石缩减的第一步)。
 *
 * 从 page.tsx 原样迁出的运行控制 UI;动作回调仍由页面持有
 * (resume/pause/cancel/rollback 是 durable Run 语义,不下沉)。
 */

import { Play, Pause, RotateCcw, XCircle } from "lucide-react";
import type { AgentArtifactRef } from "@/lib/agent/task-journey";

function runStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: "排队中",
    planned: "已计划",
    running: "运行中",
    waiting_user: "等待用户",
    paused: "已暂停",
    recovering: "恢复中",
    cancel_requested: "取消中",
    verifying: "自检中",
    repairing: "自愈中",
    recovered: "已恢复",
    needs_engineering: "需工程处理",
    succeeded: "成功",
    failed: "失败",
    rolled_back: "已回滚",
    cancelled: "已取消",
  };
  return labels[status] || status || "未知";
}

function runPhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    understanding: "理解意图",
    executing: "执行工具",
    verifying: "自检验证",
    repairing: "自愈修复",
    responding: "生成回复",
    "image-intake": "图片识别",
  };
  return labels[phase] || phase || "未知阶段";
}

export interface AgentRunToolbarProps {
  status: string;
  phase?: string;
  artifacts?: AgentArtifactRef[];
  action: "resume" | "pause" | "cancel" | null;
  onResume: () => void;
  onPause: () => void;
  onCancel: () => void;
}

export function AgentRunToolbar({ status, phase, artifacts, action, onResume, onPause, onCancel }: AgentRunToolbarProps) {
  return (
    <div data-testid="agent-run-toolbar" className="mt-2 flex h-8 w-fit max-w-full flex-shrink-0 items-center gap-1 overflow-hidden text-xs text-[var(--color-muted)]">
      <div className="flex min-w-0 items-center gap-2 rounded-full bg-[var(--color-bg)] px-3">
        <span className="font-medium text-[var(--color-text)]">
          {status === "waiting_user"
            ? "等待你的回复"
            : status === "paused"
              ? "任务已暂停"
              : "纸鸢正在处理"}
        </span>
        <span>{runStatusLabel(status)}</span>
        {phase && <span>{runPhaseLabel(phase)}</span>}
        {artifacts && artifacts.length > 0 && <span>材料 {artifacts.length}</span>}
      </div>
      <div className="flex items-center gap-1">
        {status === "paused" ? (
          <button
            type="button"
            onClick={onResume}
            disabled={action !== null}
            title="恢复运行"
            className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play size={13} />
            {action === "resume" ? "恢复中" : "恢复"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onPause}
            disabled={action !== null}
            title="暂停运行"
            className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Pause size={13} />
            {action === "pause" ? "暂停中" : "暂停"}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={action !== null}
          title="取消运行"
          className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/30"
        >
          <XCircle size={13} />
          {action === "cancel" ? "取消中" : "取消"}
        </button>
      </div>
    </div>
  );
}

export interface RollbackProposalBannerProps {
  sectionId?: string;
  updatedAt?: string;
  rollingBack: boolean;
  disabled: boolean;
  onRollback: () => void;
}

export function RollbackProposalBanner({ sectionId, updatedAt, rollingBack, disabled, onRollback }: RollbackProposalBannerProps) {
  return (
    <div className="mt-2 flex flex-shrink-0 flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
      <div className="min-w-0 flex-1">
        <span className="font-medium">最近简历修改可撤销</span>
        {sectionId && <span className="ml-2">section: {sectionId}</span>}
        {updatedAt && <span className="ml-2">updated: {updatedAt}</span>}
      </div>
      <button
        type="button"
        onClick={onRollback}
        disabled={disabled}
        title="撤销最近一次已应用的简历修改"
        className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-sm)] border border-amber-300 bg-[var(--color-surface)] px-2 text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/40"
      >
        <RotateCcw size={13} />
        {rollingBack ? "撤销中" : "撤销"}
      </button>
    </div>
  );
}
