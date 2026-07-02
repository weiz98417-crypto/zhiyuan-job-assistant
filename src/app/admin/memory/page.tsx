"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  Database,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useToast } from "@/lib/use-toast";

interface UsageSummary {
  total: number;
  accepted: number;
  rejected: number;
  lastUsedAt: string | null;
  recent: Array<{
    id: number;
    taskType: string;
    accepted: boolean | null;
    feedback: string;
    metadata: Record<string, unknown>;
    createdAt: string | null;
  }>;
}

interface GovernanceReference {
  id: number;
  ownerUserId: string | null;
  ownerLabel: string;
  name: string;
  source: string;
  roleCategory: string;
  visibility: string;
  status: string;
  qualityScore: number;
  anonymized: boolean;
  tags: string[];
  notes: string;
  previewText: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  usage: UsageSummary;
  riskReasons: string[];
}

interface EmbeddingHealthItem {
  id: number;
  sourceKind: "reference_resume" | "memory";
  sourceId: string;
  name: string;
  ownerUserId: string | null;
  roleCategory: string;
  visibility: string;
  embeddingStatus: string;
  failureReason: string;
  retryCount: number;
  embeddingModel: string;
  updatedAt: string | null;
}

interface CandidateMemoryItem {
  id: number;
  userId: string;
  memoryType: string;
  canonicalText: string;
  status: string;
  confidence: number;
  importance: number;
  sourceCount: number;
  evidence: Array<{
    id: number;
    sourceType: string;
    sourceId: string;
    quote: string;
    confidence: number;
    extractionMethod: string;
  }>;
  createdAt: string | null;
  updatedAt: string | null;
}

interface MemoryGovernanceData {
  driver: string;
  vectorStoreAvailable: boolean;
  health: {
    referencesTotal: number;
    teamShared: number;
    pending: number;
    disabled: number;
    indexFailed: number;
    lowQuality: number;
    averageQuality: number;
    memoryItems: Record<string, number>;
    referenceChunks: Record<string, number>;
    memoryChunks: Record<string, number>;
  };
  references: GovernanceReference[];
  queues: {
    pendingTeamReferences: GovernanceReference[];
    embeddingHealth: EmbeddingHealthItem[];
    candidatePatterns: CandidateMemoryItem[];
    riskyReferences: GovernanceReference[];
  };
}

const EMPTY_DATA: MemoryGovernanceData = {
  driver: "sqlite",
  vectorStoreAvailable: false,
  health: {
    referencesTotal: 0,
    teamShared: 0,
    pending: 0,
    disabled: 0,
    indexFailed: 0,
    lowQuality: 0,
    averageQuality: 0,
    memoryItems: {},
    referenceChunks: {},
    memoryChunks: {},
  },
  references: [],
  queues: {
    pendingTeamReferences: [],
    embeddingHealth: [],
    candidatePatterns: [],
    riskyReferences: [],
  },
};

export default function AdminMemoryPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<MemoryGovernanceData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    owner: "",
    roleCategory: "all",
    sourceType: "all",
    visibility: "all",
    status: "all",
  });

  const roleOptions = useMemo(() => uniqueOptions(data.references.map((item) => item.roleCategory)), [data.references]);
  const sourceOptions = useMemo(() => uniqueOptions(data.references.map((item) => item.source)), [data.references]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData(nextFilters = filters) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    Object.entries(nextFilters).forEach(([key, value]) => {
      if (value && value !== "all") params.set(key, value);
    });
    try {
      const res = await fetch(`/api/admin/memory?${params.toString()}`);
      if (res.status === 401) {
        setError("登录状态已失效，请重新登录。");
        return;
      }
      if (res.status === 403) {
        setError("当前账号不是管理员，不能查看记忆治理。");
        return;
      }
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "加载失败");
      setData(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function runAction(id: number, action: string, scope: "reference" | "memory") {
    const busyKey = `${scope}:${id}:${action}`;
    setBusyId(busyKey);
    try {
      const res = await fetch("/api/admin/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) throw new Error(payload.error || "操作失败");
      if (scope === "memory" && payload.data?.updated === false) {
        throw new Error("候选记忆未更新，请刷新后重试");
      }
      await loadData();
      showToast(actionSuccessMessage(action));
    } catch (err) {
      const message = err instanceof Error ? err.message : "操作失败";
      setError(message);
      showToast(message, "error");
    } finally {
      setBusyId(null);
    }
  }

  function applyFilters() {
    loadData(filters);
  }

  if (loading && data === EMPTY_DATA) {
    return <div className="p-8 text-sm text-[var(--color-muted)]">加载记忆治理数据...</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)]">
            记忆治理
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            管理员审核团队共享材料、候选记忆、索引健康和低质量引用。
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadData()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-divider)] disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          刷新
        </button>
      </div>

      {error && (
        <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="材料总数" value={data.health.referencesTotal} />
        <StatCard label="团队共享" value={data.health.teamShared} />
        <StatCard label="待审核" value={data.health.pending} tone={data.health.pending ? "amber" : "default"} />
        <StatCard label="低质量/高风险" value={data.queues.riskyReferences.length} tone={data.queues.riskyReferences.length ? "red" : "default"} />
      </div>

      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
          <Search size={15} />
          筛选
        </div>
        <div className="grid gap-2 md:grid-cols-5">
          <input
            value={filters.owner}
            onChange={(event) => setFilters((prev) => ({ ...prev, owner: event.target.value }))}
            placeholder="Owner"
            className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
          />
          <FilterSelect label="方向" value={filters.roleCategory} options={roleOptions} onChange={(value) => setFilters((prev) => ({ ...prev, roleCategory: value }))} />
          <FilterSelect label="来源" value={filters.sourceType} options={sourceOptions} onChange={(value) => setFilters((prev) => ({ ...prev, sourceType: value }))} />
          <FilterSelect label="可见性" value={filters.visibility} options={["private", "team_pending", "team", "disabled"]} onChange={(value) => setFilters((prev) => ({ ...prev, visibility: value }))} />
          <FilterSelect label="状态" value={filters.status} options={["active", "pending", "disabled", "index_failed"]} onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))} />
        </div>
        <button
          type="button"
          onClick={applyFilters}
          className="mt-3 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-2 text-sm text-white"
        >
          应用筛选
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="团队共享待审核" count={data.queues.pendingTeamReferences.length}>
          {data.queues.pendingTeamReferences.length === 0 ? (
            <EmptyState text="暂无待审核共享材料。" />
          ) : (
            <div className="space-y-2">
              {data.queues.pendingTeamReferences.map((item) => (
                <ReferenceReviewRow key={item.id} item={item} busyId={busyId} onAction={runAction} />
              ))}
            </div>
          )}
        </Section>

        <Section title="Embedding 健康队列" count={data.queues.embeddingHealth.length}>
          {!data.vectorStoreAvailable ? (
            <EmptyState text="当前使用 SQLite，向量内部治理在切换 Postgres + pgvector 后启用。" />
          ) : data.queues.embeddingHealth.length === 0 ? (
            <EmptyState text="暂无失败或长期 pending 的 embedding。" />
          ) : (
            <div className="space-y-2">
              {data.queues.embeddingHealth.map((item) => (
                <div key={`${item.sourceKind}-${item.id}`} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-[var(--color-text)] truncate">{item.name || item.sourceId}</div>
                      <div className="mt-1 text-xs text-[var(--color-muted)]">
                        {item.sourceKind} · {item.embeddingStatus} · retry {item.retryCount}
                      </div>
                    </div>
                    {item.sourceKind === "reference_resume" && (
                      <IconButton
                        label="重建索引"
                        busy={busyId === `reference:${Number(item.sourceId)}:reindex_reference`}
                        onClick={() => runAction(Number(item.sourceId), "reindex_reference", "reference")}
                      >
                        <RefreshCw size={13} />
                      </IconButton>
                    )}
                  </div>
                  {item.failureReason && (
                    <p className="mt-2 text-xs text-red-600">{item.failureReason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="候选记忆模式" count={data.queues.candidatePatterns.length}>
          {!data.vectorStoreAvailable ? (
            <EmptyState text="当前未启用 Postgres 向量记忆。" />
          ) : data.queues.candidatePatterns.length === 0 ? (
            <EmptyState text="暂无候选记忆模式。" />
          ) : (
            <div className="space-y-2">
              {data.queues.candidatePatterns.map((item) => (
                <div key={item.id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-[var(--color-text)]">{item.canonicalText}</div>
                      <div className="mt-1 text-xs text-[var(--color-muted)]">
                        {item.memoryType} · {item.status} · confidence {Math.round(item.confidence * 100)}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <IconButton label="批准" disabled={busyId?.startsWith(`memory:${item.id}:`)} busy={busyId === `memory:${item.id}:approve_memory`} onClick={() => runAction(item.id, "approve_memory", "memory")}>
                        <Check size={13} />
                      </IconButton>
                      <IconButton label="拒绝" disabled={busyId?.startsWith(`memory:${item.id}:`)} busy={busyId === `memory:${item.id}:reject_memory`} onClick={() => runAction(item.id, "reject_memory", "memory")}>
                        <X size={13} />
                      </IconButton>
                      <IconButton label="归档" disabled={busyId?.startsWith(`memory:${item.id}:`)} busy={busyId === `memory:${item.id}:disable_memory`} onClick={() => runAction(item.id, "disable_memory", "memory")}>
                        <Ban size={13} />
                      </IconButton>
                    </div>
                  </div>
                  {item.evidence.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-[var(--color-divider)] pt-2 text-xs text-[var(--color-muted)]">
                      {item.evidence.slice(0, 2).map((evidence) => (
                        <p key={evidence.id}>{evidence.sourceType} #{evidence.sourceId}: {evidence.quote}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="低质量或高拒绝材料" count={data.queues.riskyReferences.length}>
          {data.queues.riskyReferences.length === 0 ? (
            <EmptyState text="暂无低质量或高拒绝材料。" />
          ) : (
            <div className="space-y-2">
              {data.queues.riskyReferences.map((item) => (
                <ReferenceReviewRow key={item.id} item={item} busyId={busyId} onAction={runAction} compact />
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section title="全部优秀简历材料" count={data.references.length}>
        {data.references.length === 0 ? (
          <EmptyState text="暂无材料。" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-[var(--color-divider)] text-xs text-[var(--color-muted)]">
                <tr>
                  <th className="py-2 pr-3 font-medium">材料</th>
                  <th className="py-2 pr-3 font-medium">Owner</th>
                  <th className="py-2 pr-3 font-medium">方向</th>
                  <th className="py-2 pr-3 font-medium">状态</th>
                  <th className="py-2 pr-3 font-medium">质量</th>
                  <th className="py-2 pr-3 font-medium">使用</th>
                  <th className="py-2 pr-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.references.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--color-divider)] align-top">
                    <td className="py-3 pr-3">
                      <div className="font-medium text-[var(--color-text)]">{item.name}</div>
                      <div className="mt-1 max-w-xl text-xs text-[var(--color-muted)]">{item.previewText}</div>
                    </td>
                    <td className="py-3 pr-3 text-xs text-[var(--color-muted)]">{item.ownerLabel}</td>
                    <td className="py-3 pr-3 text-xs text-[var(--color-muted)]">{item.roleCategory || "general"}</td>
                    <td className="py-3 pr-3">
                      <StatusPill value={`${item.visibility} / ${item.status}`} />
                    </td>
                    <td className="py-3 pr-3 text-xs text-[var(--color-muted)]">{Math.round(item.qualityScore * 100)}</td>
                    <td className="py-3 pr-3 text-xs text-[var(--color-muted)]">
                      {item.usage.total} 次 · 采纳 {item.usage.accepted} · 拒绝 {item.usage.rejected}
                      {item.usage.recent[0] && (
                        <div className="mt-1 max-w-xs truncate">
                          {usageReason(item.usage.recent[0])}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <ReferenceActions item={item} busyId={busyId} onAction={runAction} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-xs text-[var(--color-muted)]">
        <div className="mb-2 flex items-center gap-2 font-medium text-[var(--color-text)]">
          <Database size={14} />
          存储状态
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <span>Driver: {data.driver}</span>
          <span>Reference chunks: {formatCountMap(data.health.referenceChunks)}</span>
          <span>Memory items: {formatCountMap(data.health.memoryItems)}</span>
        </div>
      </div>
    </div>
  );
}

function ReferenceReviewRow({
  item,
  busyId,
  onAction,
  compact = false,
}: {
  item: GovernanceReference;
  busyId: string | null;
  onAction: (id: number, action: string, scope: "reference" | "memory") => Promise<void>;
  compact?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-[var(--color-text)]">{item.name}</div>
          <div className="mt-1 text-xs text-[var(--color-muted)]">
            {item.ownerLabel} · {item.roleCategory || "general"} · {item.visibility}/{item.status}
          </div>
        </div>
        <ReferenceActions item={item} busyId={busyId} onAction={onAction} />
      </div>
      {!compact && item.previewText && (
        <p className="mt-2 text-xs text-[var(--color-muted)]">{item.previewText}</p>
      )}
      {item.riskReasons.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.riskReasons.map((reason) => (
            <StatusPill key={reason} value={riskLabel(reason)} tone="red" />
          ))}
        </div>
      )}
    </div>
  );
}

function ReferenceActions({
  item,
  busyId,
  onAction,
}: {
  item: GovernanceReference;
  busyId: string | null;
  onAction: (id: number, action: string, scope: "reference" | "memory") => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {(item.visibility === "team_pending" || item.status === "pending") && (
        <>
          <IconButton label="批准" busy={busyId === `reference:${item.id}:approve_reference`} onClick={() => onAction(item.id, "approve_reference", "reference")}>
            <ShieldCheck size={13} />
          </IconButton>
          <IconButton label="退回" busy={busyId === `reference:${item.id}:reject_reference`} onClick={() => onAction(item.id, "reject_reference", "reference")}>
            <X size={13} />
          </IconButton>
        </>
      )}
      <IconButton label="重建索引" busy={busyId === `reference:${item.id}:reindex_reference`} onClick={() => onAction(item.id, "reindex_reference", "reference")}>
        <RefreshCw size={13} />
      </IconButton>
      {item.status === "disabled" || item.visibility === "disabled" ? (
        <IconButton label="恢复" busy={busyId === `reference:${item.id}:restore_reference`} onClick={() => onAction(item.id, "restore_reference", "reference")}>
          <RotateCcw size={13} />
        </IconButton>
      ) : (
        <IconButton label="停用" busy={busyId === `reference:${item.id}:disable_reference`} onClick={() => onAction(item.id, "disable_reference", "reference")}>
          <Ban size={13} />
        </IconButton>
      )}
      <IconButton label="删除" danger busy={busyId === `reference:${item.id}:delete_reference`} onClick={() => onAction(item.id, "delete_reference", "reference")}>
        <Trash2 size={13} />
      </IconButton>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
        <span className="rounded-full bg-[var(--color-primary-muted)] px-2 py-0.5 text-xs text-[var(--color-text-soft)]">{count}</span>
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "amber" | "red" }) {
  const toneClass = tone === "red"
    ? "text-red-600"
    : tone === "amber"
      ? "text-amber-600"
      : "text-[var(--color-text)]";
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)]"
      >
        <option value="all">全部</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function IconButton({
  label,
  busy,
  disabled,
  danger,
  onClick,
  children,
}: {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={busy || disabled}
      onClick={onClick}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] disabled:opacity-50 ${
        danger ? "text-red-600 hover:bg-red-50" : "text-[var(--color-text-soft)] hover:bg-[var(--color-divider)]"
      }`}
    >
      {busy ? <RefreshCw size={13} className="animate-spin" /> : children}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] px-3 py-4 text-sm text-[var(--color-muted)]">
      <AlertTriangle size={14} />
      {text}
    </div>
  );
}

function StatusPill({ value, tone = "default" }: { value: string; tone?: "default" | "red" }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
      tone === "red"
        ? "bg-red-50 text-red-600"
        : "bg-[var(--color-primary-muted)] text-[var(--color-text-soft)]"
    }`}>
      {value}
    </span>
  );
}

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values.map((item) => item || "").filter(Boolean))).sort();
}

function formatCountMap(value: Record<string, number>) {
  const entries = Object.entries(value);
  if (!entries.length) return "none";
  return entries.map(([key, count]) => `${key}:${count}`).join(" / ");
}

function actionSuccessMessage(action: string) {
  const messages: Record<string, string> = {
    approve_reference: "已批准共享材料",
    reject_reference: "已退回共享材料",
    disable_reference: "已停用材料",
    restore_reference: "已恢复材料",
    delete_reference: "已删除材料",
    reindex_reference: "已提交重建索引",
    approve_memory: "已批准候选记忆",
    reject_memory: "已拒绝候选记忆",
    disable_memory: "已归档候选记忆",
    restore_memory: "已恢复候选记忆",
    delete_memory: "已删除候选记忆",
  };
  return messages[action] || "操作完成";
}

function riskLabel(value: string) {
  if (value === "quality_low") return "低质量";
  if (value === "index_failed") return "索引失败";
  if (value === "high_rejection") return "高拒绝";
  return value;
}

function usageReason(item: UsageSummary["recent"][number]) {
  const sectionId = typeof item.metadata.sectionId === "string" ? item.metadata.sectionId : "";
  const operation = typeof item.metadata.operation === "string" ? item.metadata.operation : "";
  const decision = item.accepted === true ? "采纳" : item.accepted === false ? "拒绝" : "记录";
  return [decision, item.taskType, item.feedback, sectionId, operation].filter(Boolean).join(" · ");
}
