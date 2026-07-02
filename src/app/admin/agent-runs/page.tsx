"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Shield,
  Wrench,
  XCircle,
} from "lucide-react";

interface DebugStep {
  id: number;
  phase: string;
  toolName: string;
  status: string;
  inputSummary: string;
  outputSummary: string;
  verifier: unknown;
  error: unknown;
  createdAt: string;
}

interface DebugRun {
  id: string;
  userId: string;
  sessionId: number | null;
  taskType: string;
  agentId: string;
  status: string;
  contract: {
    target: string;
    successCriteria: string[];
    validators: string[];
    routing?: {
      contractPolicy?: string;
      memoryTask?: string;
      allowedTools?: string[];
      requiresClarification?: boolean;
      clarificationQuestion?: string;
      blockedReason?: string;
      auditSummary?: string;
      activeTaskId?: string;
      activeTaskType?: string;
      activeTaskPhase?: string;
      routeLocked?: boolean;
    };
  };
  result: unknown;
  error: unknown;
  createdAt: string;
  updatedAt: string;
  recentSteps: DebugStep[];
}

interface DebugSummary {
  totalRuns: number;
  failedRuns: number;
  activeRuns: number;
  succeededRuns: number;
  failedSteps: number;
  totalSteps: number;
  byStatus: Record<string, number>;
  byTaskType: Record<string, number>;
}

const EMPTY_SUMMARY: DebugSummary = {
  totalRuns: 0,
  failedRuns: 0,
  activeRuns: 0,
  succeededRuns: 0,
  failedSteps: 0,
  totalSteps: 0,
  byStatus: {},
  byTaskType: {},
};

const STATUS_FILTERS = [
  { value: "all", label: "全部" },
  { value: "running", label: "运行中" },
  { value: "verifying", label: "自检中" },
  { value: "repairing", label: "自愈中" },
  { value: "recovered", label: "已恢复" },
  { value: "needs_engineering", label: "需工程处理" },
  { value: "succeeded", label: "成功" },
  { value: "failed", label: "失败/回滚" },
  { value: "cancelled", label: "已取消" },
];

export default function AdminAgentRunsPage() {
  const [runs, setRuns] = useState<DebugRun[]>([]);
  const [summary, setSummary] = useState<DebugSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    loadRuns(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function loadRuns(nextStatus = statusFilter) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: "50" });
    if (nextStatus !== "all") params.set("status", nextStatus);

    try {
      const res = await fetch(`/api/admin/agent-runs?${params.toString()}`, { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) throw new Error(payload.error || "加载 Agent 运行记录失败");
      setEnabled(payload.enabled !== false);
      setRuns(Array.isArray(payload.data) ? payload.data : []);
      setSummary(payload.summary || EMPTY_SUMMARY);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 Agent 运行记录失败");
    } finally {
      setLoading(false);
    }
  }

  const lastUpdated = useMemo(() => runs[0]?.updatedAt || "", [runs]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)]">
            Agent 运行监控
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            查看最近 50 次 Agent 任务、步骤、自检和失败原因，用来排查“说保存了但没落库”等问题。
          </p>
          {lastUpdated && (
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              最近更新：{formatTime(lastUpdated)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => loadRuns()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-divider)] disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          刷新
        </button>
      </div>

      {!enabled && (
        <Notice tone="warn" text="Agent 运行台未启用。需要 DB_DRIVER=postgres 和 DATABASE_URL，才能沉淀运行记录。" />
      )}
      {error && <Notice tone="error" text={error} />}

      <div className="grid gap-3 md:grid-cols-4">
        <Stat icon={<Activity size={16} />} label="最近运行" value={summary.totalRuns} />
        <Stat icon={<Clock3 size={16} />} label="运行中" value={summary.activeRuns} />
        <Stat icon={<CheckCircle2 size={16} />} label="成功" value={summary.succeededRuns} />
        <Stat icon={<XCircle size={16} />} label="失败/回滚" value={summary.failedRuns} tone={summary.failedRuns ? "red" : "default"} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setStatusFilter(item.value)}
              className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === item.value
                  ? "bg-[var(--color-primary)] text-white"
                  : "border border-[var(--color-border)] text-[var(--color-text-soft)] hover:bg-[var(--color-divider)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-[var(--color-muted)]">
          最近步骤 {summary.totalSteps} 条，自检失败 {summary.failedSteps} 条
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <EmptyPanel text="正在加载 Agent 运行记录..." />
        ) : runs.length === 0 ? (
          <EmptyPanel
            text={enabled
              ? "暂时没有 Agent 运行记录。当前表里还没有沉淀到 durable run，后续 Agent 任务创建运行台记录后这里会展示完整链路。"
              : "运行台未启用，所以没有可展示的记录。"}
          />
        ) : (
          runs.map((run) => <RunPanel key={run.id} run={run} />)
        )}
      </div>
    </div>
  );
}

function RunPanel({ run }: { run: DebugRun }) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <Shield size={15} />
            <span>{taskLabel(run.taskType)}</span>
            <Pill text={statusLabel(run.status)} tone={statusTone(run.status)} />
            <Pill text={agentLabel(run.agentId)} />
          </div>
          <div className="mt-1 text-xs text-[var(--color-muted)]">
            运行 {shortId(run.id)} · 用户 {shortId(run.userId)} · 会话 {run.sessionId ?? "无"} · 更新 {formatTime(run.updatedAt)}
          </div>
        </div>
        <div className="max-w-xl text-xs text-[var(--color-muted)]">
          目标：{run.contract.target || "未记录"}
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <InfoBlock title="成功标准" items={run.contract.successCriteria.map(criteriaLabel)} />
        <InfoBlock title="校验器" items={run.contract.validators.map(validatorLabel)} />
      </div>

      {run.contract.routing && (
        <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs">
          <div className="mb-2 font-medium text-[var(--color-text)]">路由治理</div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="text-[var(--color-muted)]">
              契约策略：{contractPolicyLabel(run.contract.routing.contractPolicy || "")}
            </div>
            <div className="text-[var(--color-muted)]">
              记忆策略：{memoryTaskLabel(run.contract.routing.memoryTask || "")}
            </div>
            <div className="text-[var(--color-muted)]">
              摘要：{run.contract.routing.auditSummary || "未记录"}
            </div>
            {run.contract.routing.routeLocked && (
              <div className="text-[var(--color-muted)]">
                任务锁：{taskLabel(run.contract.routing.activeTaskType || "")} · {run.contract.routing.activeTaskPhase || "未记录阶段"}
              </div>
            )}
            {run.contract.routing.activeTaskId && (
              <div className="text-[var(--color-muted)]">
                锁 ID：{shortId(run.contract.routing.activeTaskId)}
              </div>
            )}
            {run.contract.routing.requiresClarification && (
              <div className="text-amber-700">
                需要澄清：{run.contract.routing.clarificationQuestion || run.contract.routing.blockedReason || "是"}
              </div>
            )}
            {run.contract.routing.blockedReason && !run.contract.routing.requiresClarification && (
              <div className="text-red-600">
                阻断原因：{run.contract.routing.blockedReason}
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(run.contract.routing.allowedTools || []).slice(0, 12).map((tool) => (
              <Pill key={tool} text={toolLabel(tool)} />
            ))}
            {(run.contract.routing.allowedTools || []).length > 12 && (
              <span className="text-[var(--color-muted)]">+{(run.contract.routing.allowedTools || []).length - 12}</span>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        <div className="text-xs font-medium text-[var(--color-text)]">最近步骤</div>
        {run.recentSteps.length === 0 ? (
          <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] px-3 py-3 text-xs text-[var(--color-muted)]">
            还没有记录到步骤。通常表示任务刚创建，或前端没有成功写入步骤日志。
          </div>
        ) : run.recentSteps.map((step) => (
          <div key={step.id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[var(--color-text)]">
              <Wrench size={13} />
              <span>{phaseLabel(step.phase)}</span>
              {step.toolName && <Pill text={toolLabel(step.toolName)} />}
              <Pill text={stepStatusLabel(step.status)} tone={step.status === "failed" ? "red" : "default"} />
              <span className="text-[var(--color-muted)]">{formatTime(step.createdAt)}</span>
            </div>
            {step.inputSummary && <p className="break-words text-[var(--color-muted)]">输入：{step.inputSummary}</p>}
            {step.outputSummary && <p className="mt-1 break-words text-[var(--color-muted)]">输出：{step.outputSummary}</p>}
            <JsonLine label="校验" value={step.verifier} />
            <JsonLine label="错误" value={step.error} />
          </div>
        ))}
      </div>
    </section>
  );
}

function InfoBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs">
      <div className="mb-1 font-medium text-[var(--color-text)]">{title}</div>
      {items.length ? (
        <ul className="space-y-1 text-[var(--color-muted)]">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <div className="text-[var(--color-muted)]">未记录</div>
      )}
    </div>
  );
}

function JsonLine({ label, value }: { label: string; value: unknown }) {
  const text = JSON.stringify(value || {});
  if (!text || text === "{}") return null;
  return <p className="mt-1 break-words text-[var(--color-muted)]">{label}：{text}</p>;
}

function Notice({ tone, text }: { tone: "warn" | "error"; text: string }) {
  const className = tone === "error"
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <div className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-3 text-sm ${className}`}>
      <AlertTriangle size={15} />
      {text}
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-muted)]">
      {text}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "default" | "red";
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
        {icon}
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${tone === "red" ? "text-red-600" : "text-[var(--color-text)]"}`}>{value}</div>
    </div>
  );
}

function Pill({ text, tone = "default" }: { text: string; tone?: "default" | "red" | "green" | "amber" }) {
  const className = tone === "red"
    ? "bg-red-50 text-red-600"
    : tone === "green"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : "bg-[var(--color-primary-muted)] text-[var(--color-text-soft)]";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${className}`}>{text}</span>;
}

function statusTone(status: string): "default" | "red" | "green" | "amber" {
  if (status === "failed" || status === "rolled_back" || status === "needs_engineering") return "red";
  if (status === "succeeded" || status === "recovered") return "green";
  if (["planned", "running", "waiting_user", "verifying", "repairing"].includes(status)) return "amber";
  return "default";
}

function formatTime(value: string) {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

function shortId(value: string) {
  if (!value) return "未知";
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function taskLabel(value: string) {
  const labels: Record<string, string> = {
    career_positioning_guidance: "自我定位引导",
    resume_query: "简历查询",
    resume_edit: "简历修改",
    jd_evaluation: "JD 评估",
    offer_evaluation: "Offer 评估",
    interview_coaching: "模拟面试",
    profile_update: "画像更新",
    reference_resume_save: "优秀简历沉淀",
    file_export: "文件导出",
  };
  return labels[value] || value || "未知任务";
}

function contractPolicyLabel(value: string) {
  const labels: Record<string, string> = {
    guidance: "指导型",
    read_only: "只读查询",
    verified_write: "可验证写入",
    high_risk_verified_write: "高风险写入",
    export_verified: "文件导出",
    admin_verified: "后台治理",
  };
  return labels[value] || value || "未记录";
}

function memoryTaskLabel(value: string) {
  const labels: Record<string, string> = {
    resume_optimization: "简历优化记忆",
    jd_evaluation: "JD 评估记忆",
    offer_evaluation: "Offer 评估记忆",
    interview_coaching: "面试教练记忆",
    profile_growth: "画像成长记忆",
    reference_resume_save: "优秀简历记忆",
    general_chat: "通用对话",
  };
  return labels[value] || value || "未记录";
}

function agentLabel(value: string) {
  const labels: Record<string, string> = {
    resume: "简历 Agent",
    evaluate: "JD 评估 Agent",
    offer: "Offer Agent",
    interview: "面试 Agent",
    profile: "画像 Agent",
  };
  return labels[value] || value || "未知 Agent";
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    planned: "已计划",
    running: "运行中",
    waiting_user: "等待用户",
    verifying: "自检中",
    repairing: "自愈中",
    recovered: "已恢复",
    needs_engineering: "需工程处理",
    succeeded: "成功",
    failed: "失败",
    rolled_back: "已回滚",
    cancelled: "已取消",
  };
  return labels[value] || value || "未知状态";
}

function stepStatusLabel(value: string) {
  const labels: Record<string, string> = {
    running: "运行中",
    succeeded: "成功",
    failed: "失败",
    skipped: "跳过",
  };
  return labels[value] || value || "未知状态";
}

function phaseLabel(value: string) {
  const labels: Record<string, string> = {
    understanding: "理解意图",
    executing: "执行工具",
    verifying: "自检验证",
    repairing: "自愈修复",
    responding: "生成回复",
    done: "完成",
  };
  return labels[value] || value || "未知阶段";
}

function toolLabel(value: string) {
  const labels: Record<string, string> = {
    save_resume_section: "保存简历模块",
    evaluate_jd_full: "完整 JD 评估",
    evaluate_offer: "Offer 评估",
  };
  return labels[value] || value;
}

function criteriaLabel(value: string) {
  const labels: Record<string, string> = {
    "target section read-back hash matches applied content": "目标模块读回 hash 与写入内容一致",
    "resume context read": "简历上下文已读取",
    "answer generated": "回答已生成",
    "user approved draft": "用户已确认修改方案",
    "source content extracted or fetched": "来源内容已提取或抓取",
    "A-G evaluation generated": "A-G 评估已生成",
    "report persisted": "报告已保存",
    "saved report read-back verification passes": "保存报告读回验证通过",
    "JD/resume context bound": "JD/简历上下文已绑定",
  };
  return labels[value] || value;
}

function validatorLabel(value: string) {
  const labels: Record<string, string> = {
    read_back_match: "读回一致性校验",
    report_read_back: "报告读回校验",
    user_approval_required: "用户确认校验",
  };
  return labels[value] || value;
}
