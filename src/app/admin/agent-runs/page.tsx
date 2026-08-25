"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  XCircle,
} from "lucide-react";

interface RuntimeRun {
  id: string;
  userId: string;
  sessionId: number | null;
  taskType: string;
  agentId: string;
  status: string;
  runtimeMode: string;
  snapshotVersion: number;
  eventSequence: number;
  ownerId: string | null;
  leaseExpiresAt: string | null;
  heartbeatAt: string | null;
  fencingToken: number;
  wakeAt: string | null;
  isolationReason: string;
  lastObservation: Record<string, unknown>;
  leaseStale: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RuntimeEvent {
  id: number;
  runId: string;
  sequence: number;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface RuntimeCheckpoint {
  id: number;
  runId: string;
  snapshotVersion: number;
  fencingToken: number;
  boundary: string;
  budgets: Record<string, unknown>;
  createdAt: string;
}

interface RuntimeDeadLetter {
  id: number;
  runId: string;
  topic: string;
  attemptCount: number;
  lastError: string;
  deadLetteredAt: string | null;
}

interface RuntimeReconciliation {
  id: string;
  runId: string;
  toolName: string;
  status: string;
  effectState: string;
  input: Record<string, unknown>;
  verifier: Record<string, unknown>;
  error: Record<string, unknown>;
  updatedAt: string;
}

interface RuntimeBackgroundJob {
  id: string;
  runId: string;
  jobType: string;
  status: string;
  progress: Record<string, unknown>;
  error: Record<string, unknown>;
  ownerId: string | null;
  leaseExpiresAt: string | null;
  updatedAt: string;
}

interface RuntimeStatus {
  claimsPaused: boolean;
  pauseReason: string;
  controlUpdatedAt: string | null;
  runsByStatus: Record<string, number>;
  backgroundJobsByStatus: Record<string, number>;
  recentRuns: RuntimeRun[];
  recentEvents: RuntimeEvent[];
  recentCheckpoints: RuntimeCheckpoint[];
  deadLetters: RuntimeDeadLetter[];
  reconciliations: RuntimeReconciliation[];
  backgroundJobs: RuntimeBackgroundJob[];
  deadLetterCount: number;
  reconciliationCount: number;
  staleLeaseCount: number;
  activeLeaseCount: number;
}

const EMPTY_STATUS: RuntimeStatus = {
  claimsPaused: false,
  pauseReason: "",
  controlUpdatedAt: null,
  runsByStatus: {},
  backgroundJobsByStatus: {},
  recentRuns: [],
  recentEvents: [],
  recentCheckpoints: [],
  deadLetters: [],
  reconciliations: [],
  backgroundJobs: [],
  deadLetterCount: 0,
  reconciliationCount: 0,
  staleLeaseCount: 0,
  activeLeaseCount: 0,
};

const STATUS_FILTERS = [
  { value: "all", label: "全部" },
  { value: "queued", label: "排队" },
  { value: "running", label: "运行中" },
  { value: "recovering", label: "恢复中" },
  { value: "waiting_user", label: "等待用户" },
  { value: "verifying", label: "验证中" },
  { value: "cancel_requested", label: "取消中" },
  { value: "succeeded", label: "成功" },
  { value: "failed", label: "失败" },
  { value: "cancelled", label: "已取消" },
];

export default function AdminAgentRunsPage() {
  const [status, setStatus] = useState<RuntimeStatus>(EMPTY_STATUS);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  async function loadStatus() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/agent-runtime", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "加载 Agent Runtime 失败");
      setStatus({ ...EMPTY_STATUS, ...payload.data });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载 Agent Runtime 失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function command(action: string, values: Record<string, unknown> = {}) {
    const operation = `${action}:${String(values.runId || values.outboxId || values.attemptId || "global")}`;
    setMutating(operation);
    setError("");
    try {
      const response = await fetch("/api/admin/agent-runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), action, ...values }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Runtime 操作失败");
      await loadStatus();
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : "Runtime 操作失败");
    } finally {
      setMutating("");
    }
  }

  const runs = useMemo(
    () => filter === "all" ? status.recentRuns : status.recentRuns.filter((run) => run.status === filter),
    [filter, status.recentRuns],
  );
  const activeCount = ["queued", "running", "recovering", "waiting_user", "verifying", "cancel_requested"]
    .reduce((sum, item) => sum + (status.runsByStatus[item] || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)]">Durable Agent Runtime</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">观察可续跑 Run、租约、恢复预算和旁路投影；治理动作不会把普通故障升级成整条 Run 阻断。</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={Boolean(mutating)}
            onClick={() => command(status.claimsPaused ? "resume_claims" : "pause_claims", status.claimsPaused ? {} : { reason: "admin pause" })}
            className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-divider)] disabled:opacity-50"
          >
            {status.claimsPaused ? <PlayCircle size={15} /> : <PauseCircle size={15} />}
            {status.claimsPaused ? "恢复领取" : "暂停新领取"}
          </button>
          <button type="button" onClick={() => loadStatus()} disabled={loading} className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-divider)] disabled:opacity-50">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />刷新
          </button>
        </div>
      </div>

      {status.claimsPaused && <Notice tone="warn" text={`新 Run 领取已暂停${status.pauseReason ? `：${status.pauseReason}` : ""}。已领取 Run 仍会在安全点完成或交还租约。`} />}
      {error && <Notice tone="error" text={error} />}
      {status.staleLeaseCount > 0 && <Notice tone="warn" text={`检测到 ${status.staleLeaseCount} 个过期租约；Worker 将使用新的 fencing token 接管同一 Run。`} />}

      <div className="grid gap-3 md:grid-cols-5">
        <Stat icon={<Activity size={16} />} label="活跃 Run" value={activeCount} />
        <Stat icon={<CheckCircle2 size={16} />} label="已成功" value={status.runsByStatus.succeeded || 0} />
        <Stat icon={<Clock3 size={16} />} label="有效租约" value={status.activeLeaseCount} />
        <Stat icon={<ShieldAlert size={16} />} label="待对账" value={status.reconciliationCount} tone={status.reconciliationCount ? "amber" : "default"} />
        <Stat icon={<XCircle size={16} />} label="观察器死信" value={status.deadLetterCount} tone={status.deadLetterCount ? "red" : "default"} />
      </div>

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((item) => (
            <button key={item.value} type="button" onClick={() => setFilter(item.value)} className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium ${filter === item.value ? "bg-[var(--color-primary)] text-white" : "border border-[var(--color-border)] text-[var(--color-text-soft)]"}`}>
              {item.label} {item.value === "all" ? "" : status.runsByStatus[item.value] || 0}
            </button>
          ))}
        </div>
      </section>

      <div className="space-y-3">
        {loading ? <EmptyPanel text="正在加载 durable runtime..." /> : runs.length === 0 ? <EmptyPanel text="当前筛选下没有 durable Run。" /> : runs.map((run) => (
          <RunPanel
            key={run.id}
            run={run}
            events={status.recentEvents.filter((event) => event.runId === run.id).slice(0, 8)}
            checkpoints={status.recentCheckpoints.filter((checkpoint) => checkpoint.runId === run.id).slice(0, 4)}
            mutating={mutating}
            command={command}
          />
        ))}
      </div>

      <QueueSection title="人工对账" empty="没有未确认副作用。" count={status.reconciliations.length}>
        {status.reconciliations.map((item) => (
          <div key={item.id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium text-[var(--color-text)]">{item.toolName} · {shortId(item.runId)} · {item.effectState}</div>
              <div className="flex flex-wrap gap-2">
                <ActionButton disabled={Boolean(mutating)} onClick={() => command("resolve_reconciliation", { attemptId: item.id, resolution: "verified" })}>确认已执行</ActionButton>
                <ActionButton disabled={Boolean(mutating)} onClick={() => command("resolve_reconciliation", { attemptId: item.id, resolution: "not_executed" })}>确认未执行</ActionButton>
                <ActionButton danger disabled={Boolean(mutating)} onClick={() => command("resolve_reconciliation", { attemptId: item.id, resolution: "manual_failed" })}>人工失败</ActionButton>
              </div>
            </div>
            <JsonLine label="输入" value={item.input} />
            <JsonLine label="错误" value={item.error} />
          </div>
        ))}
      </QueueSection>

      <QueueSection title="观察器死信" empty="没有旁路投影死信。" count={status.deadLetters.length}>
        {status.deadLetters.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs">
            <div><span className="font-medium text-[var(--color-text)]">{item.topic} · {shortId(item.runId)}</span><p className="mt-1 text-[var(--color-muted)]">尝试 {item.attemptCount} 次 · {item.lastError || "无错误摘要"}</p></div>
            <ActionButton disabled={Boolean(mutating)} onClick={() => command("retry_dead_letter", { outboxId: item.id })}><RotateCcw size={13} />重新投影</ActionButton>
          </div>
        ))}
      </QueueSection>

      <QueueSection title="后台作业" empty="当前没有 durable 后台作业。" count={status.backgroundJobs.length}>
        {status.backgroundJobs.map((job) => (
          <div key={job.id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2"><Pill text={job.status} tone={statusTone(job.status)} /><span className="font-medium text-[var(--color-text)]">{job.jobType}</span><span className="text-[var(--color-muted)]">Run {shortId(job.runId)} · {job.ownerId || "未领取"}</span></div>
            <JsonLine label="进度" value={job.progress} />
            <JsonLine label="错误" value={job.error} />
          </div>
        ))}
      </QueueSection>
    </div>
  );
}

function RunPanel({ run, events, checkpoints, mutating, command }: { run: RuntimeRun; events: RuntimeEvent[]; checkpoints: RuntimeCheckpoint[]; mutating: string; command: (action: string, values?: Record<string, unknown>) => Promise<void> }) {
  const terminal = ["succeeded", "failed", "cancelled"].includes(run.status);
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--color-text)]"><Shield size={15} />{taskLabel(run.taskType)}<Pill text={statusLabel(run.status)} tone={statusTone(run.status)} />{run.leaseStale && <Pill text="租约已过期" tone="red" />}</div>
          <p className="mt-1 text-xs text-[var(--color-muted)]">{shortId(run.id)} · 用户 {shortId(run.userId)} · {run.runtimeMode} · snapshot {run.snapshotVersion} · event {run.eventSequence} · fence {run.fencingToken}</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">Worker {run.ownerId || "未领取"} · 心跳 {formatTime(run.heartbeatAt)} · 更新 {formatTime(run.updatedAt)}</p>
        </div>
        {!terminal && <div className="flex gap-2"><ActionButton disabled={Boolean(mutating)} onClick={() => command("isolate_run", { runId: run.id, reason: "admin isolation" })}>隔离</ActionButton><ActionButton danger disabled={Boolean(mutating)} onClick={() => window.confirm("确认取消这个 Run 及其活跃子 Run？") && void command("cancel_run", { runId: run.id })}>取消</ActionButton></div>}
      </div>
      <JsonLine label="最近 Observation" value={run.lastObservation} />
      {run.isolationReason && <p className="mt-2 text-xs text-amber-700">隔离原因：{run.isolationReason}</p>}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Timeline title="最近事件" empty="暂无事件">{events.map((event) => <div key={event.id} className="text-xs text-[var(--color-muted)]"><span className="font-medium text-[var(--color-text)]">#{event.sequence} {event.eventType}</span> · {formatTime(event.createdAt)}<JsonLine label="" value={event.payload} /></div>)}</Timeline>
        <Timeline title="最近检查点" empty="暂无检查点">{checkpoints.map((checkpoint) => <div key={checkpoint.id} className="text-xs text-[var(--color-muted)]"><span className="font-medium text-[var(--color-text)]">{checkpoint.boundary}</span> · snapshot {checkpoint.snapshotVersion} · fence {checkpoint.fencingToken}<JsonLine label="预算" value={checkpoint.budgets} /></div>)}</Timeline>
      </div>
    </section>
  );
}

function QueueSection({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3><Pill text={String(count)} /></div><div className="space-y-2">{count ? children : <p className="text-xs text-[var(--color-muted)]">{empty}</p>}</div></section>;
}

function Timeline({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3"><div className="mb-2 text-xs font-medium text-[var(--color-text)]">{title}</div><div className="space-y-2">{hasChildren ? children : <p className="text-xs text-[var(--color-muted)]">{empty}</p>}</div></div>;
}

function ActionButton({ children, onClick, disabled, danger = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-xs disabled:opacity-50 ${danger ? "border-red-200 text-red-700 hover:bg-red-50" : "border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-divider)]"}`}>{children}</button>;
}

function Notice({ tone, text }: { tone: "warn" | "error"; text: string }) {
  return <div className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-3 text-sm ${tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}><AlertTriangle size={15} />{text}</div>;
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-muted)]">{text}</div>;
}

function Stat({ icon, label, value, tone = "default" }: { icon: React.ReactNode; label: string; value: number; tone?: "default" | "red" | "amber" }) {
  const valueClass = tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-[var(--color-text)]";
  return <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"><div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">{icon}{label}</div><div className={`mt-2 text-2xl font-bold ${valueClass}`}>{value}</div></div>;
}

function Pill({ text, tone = "default" }: { text: string; tone?: "default" | "red" | "green" | "amber" }) {
  const className = tone === "red" ? "bg-red-50 text-red-600" : tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-[var(--color-primary-muted)] text-[var(--color-text-soft)]";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${className}`}>{text}</span>;
}

function JsonLine({ label, value }: { label: string; value: unknown }) {
  const serialized = JSON.stringify(value || {});
  if (!serialized || serialized === "{}") return null;
  return <p className="mt-1 break-words text-xs text-[var(--color-muted)]">{label ? `${label}：` : ""}{serialized}</p>;
}

function statusTone(status: string): "default" | "red" | "green" | "amber" {
  if (["failed", "cancelled"].includes(status)) return "red";
  if (status === "succeeded") return "green";
  if (["queued", "running", "recovering", "waiting_user", "verifying", "cancel_requested", "waiting"].includes(status)) return "amber";
  return "default";
}

function statusLabel(status: string) {
  return ({ queued: "排队", running: "运行中", recovering: "恢复中", waiting_user: "等待用户", verifying: "验证中", cancel_requested: "取消中", succeeded: "成功", failed: "失败", cancelled: "已取消" } as Record<string, string>)[status] || status;
}

function taskLabel(taskType: string) {
  return ({ career_positioning_guidance: "自我定位引导", resume_query: "简历查询", resume_edit: "简历修改", jd_evaluation: "JD 评估", offer_evaluation: "Offer 评估", interview_coaching: "模拟面试", profile_update: "画像更新", reference_resume_save: "优秀简历沉淀", file_export: "文件导出", job_discovery: "岗位发现" } as Record<string, string>)[taskType] || taskType || "未知任务";
}

function formatTime(value: string | null) {
  if (!value) return "无";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}
