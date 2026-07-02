"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ListFilter,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

interface ReviewEvidence {
  code: string;
  failureType: string;
  severity: "warning" | "fail";
  message: string;
  stepId?: number;
  phase?: string;
  toolName?: string;
  snippet?: string;
}

interface AgentReview {
  id: number;
  run_id: string;
  user_id: string;
  session_id: number | null;
  task_type: string;
  agent_id: string;
  verdict: "pass" | "warning" | "fail";
  score: number;
  primary_failure_type: string;
  failure_types: string[];
  evidence_json: ReviewEvidence[];
  suggested_fix: string;
  reviewer_version: string;
  reviewed_at: string;
}

interface EvalCandidate {
  id: number;
  review_id: number | null;
  run_id: string | null;
  name: string;
  task_type: string;
  failure_type: string;
  input_summary: string;
  expected_contract_json?: unknown;
  fixture_json?: unknown;
  status: "candidate" | "accepted" | "rejected" | "promoted";
  updated_at: string;
}

interface CandidateLifecycle {
  status: EvalCandidate["status"];
  message: string;
  requiresExplicitDeveloperAction: boolean;
  nextAction: string;
  promotionDraft?: {
    name?: string;
    suggestedTestName?: string;
    applyHint?: string;
  };
}

interface ReviewStep {
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

interface ReviewDetailData {
  review: AgentReview;
  run: {
    id: string;
    taskType: string;
    agentId: string;
    status: string;
    contract: {
      routing?: Record<string, unknown>;
      successCriteria?: string[];
      validators?: string[];
      target?: string;
    };
    result: unknown;
    error: unknown;
  } | null;
  steps: ReviewStep[];
  candidate: EvalCandidate | null;
}

interface ReviewSummary {
  total: number;
  pass: number;
  warning: number;
  fail: number;
  byFailureType: Record<string, number>;
  byTaskType: Record<string, number>;
  pendingCandidates: number;
}

const EMPTY_SUMMARY: ReviewSummary = {
  total: 0,
  pass: 0,
  warning: 0,
  fail: 0,
  byFailureType: {},
  byTaskType: {},
  pendingCandidates: 0,
};

const VERDICT_FILTERS = [
  { value: "all", label: "全部" },
  { value: "fail", label: "失败" },
  { value: "warning", label: "警告" },
  { value: "pass", label: "通过" },
];

const CANDIDATE_STATUS_FILTERS: Array<{ value: EvalCandidate["status"] | "all"; label: string }> = [
  { value: "candidate", label: "待审核" },
  { value: "accepted", label: "已接受" },
  { value: "promoted", label: "已提升" },
  { value: "rejected", label: "已拒绝" },
  { value: "all", label: "全部" },
];

export default function AdminAgentReviewsPage() {
  const [reviews, setReviews] = useState<AgentReview[]>([]);
  const [candidates, setCandidates] = useState<EvalCandidate[]>([]);
  const [summary, setSummary] = useState<ReviewSummary>(EMPTY_SUMMARY);
  const [verdictFilter, setVerdictFilter] = useState("all");
  const [candidateStatusFilter, setCandidateStatusFilter] = useState<EvalCandidate["status"] | "all">("candidate");
  const [selectedReviewId, setSelectedReviewId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ReviewDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [candidateLifecycle, setCandidateLifecycle] = useState<CandidateLifecycle | null>(null);

  useEffect(() => {
    loadReviews(verdictFilter, candidateStatusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdictFilter, candidateStatusFilter]);

  const selectedReview = useMemo(
    () => reviews.find((review) => review.id === selectedReviewId) || reviews[0] || null,
    [reviews, selectedReviewId],
  );

  useEffect(() => {
    if (!selectedReview?.id) {
      setDetail(null);
      return;
    }
    loadReviewDetail(selectedReview.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedReview?.id]);

  async function loadReviews(nextVerdict = verdictFilter, nextCandidateStatus = candidateStatusFilter) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: "50" });
    if (nextVerdict !== "all") params.set("verdict", nextVerdict);
    if (nextCandidateStatus !== "candidate") params.set("candidateStatus", nextCandidateStatus);
    try {
      const res = await fetch(`/api/admin/agent-reviews?${params.toString()}`, { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) throw new Error(payload.error || "加载 Agent 复盘失败");
      setEnabled(payload.enabled !== false);
      setReviews(Array.isArray(payload.data) ? payload.data : []);
      setCandidates(Array.isArray(payload.candidates) ? payload.candidates : []);
      setSummary(payload.summary || EMPTY_SUMMARY);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 Agent 复盘失败");
    } finally {
      setLoading(false);
    }
  }

  async function updateCandidate(candidate: EvalCandidate, status: EvalCandidate["status"]) {
    setNotice("");
    setError("");
    try {
      const res = await fetch(`/api/admin/agent-eval-candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) throw new Error(payload.error || "更新 eval 候选失败");
      const lifecycle = payload.lifecycle as CandidateLifecycle | undefined;
      setCandidateLifecycle(lifecycle || null);
      setNotice(lifecycle?.message || `已将候选 #${candidate.id} 标记为${candidateStatusLabel(status)}`);
      await loadReviews(verdictFilter, candidateStatusFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新 eval 候选失败");
    }
  }

  async function loadReviewDetail(id: number) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/agent-reviews/${id}`, { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) throw new Error(payload.error || "加载复盘详情失败");
      setDetail(payload.data || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载复盘详情失败");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)]">
            Agent 复盘治理
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            每次 Agent Run 结束后做确定性复盘，把缺读回、路由错、图片识别漏走、简历写入污染等问题沉淀成可审核的 eval 候选。
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadReviews()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-divider)] disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          刷新
        </button>
      </div>

      {!enabled && <Notice tone="warn" text="Agent 复盘台账未启用，需要 Postgres 配置后才会自动沉淀 review/eval。" />}
      {error && <Notice tone="error" text={error} />}
      {notice && <Notice tone="success" text={notice} />}

      <div className="grid gap-3 md:grid-cols-4">
        <Stat icon={<ClipboardCheck size={16} />} label="已复盘" value={summary.total} />
        <Stat icon={<CheckCircle2 size={16} />} label="通过" value={summary.pass} />
        <Stat icon={<AlertTriangle size={16} />} label="警告" value={summary.warning} tone={summary.warning ? "amber" : "default"} />
        <Stat icon={<XCircle size={16} />} label="失败" value={summary.fail} tone={summary.fail ? "red" : "default"} />
      </div>

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <ListFilter size={15} />
            复盘筛选
          </div>
          <div className="text-xs text-[var(--color-muted)]">
            待审核 eval 候选：{summary.pendingCandidates}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {VERDICT_FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setVerdictFilter(item.value)}
              className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors ${
                verdictFilter === item.value
                  ? "bg-[var(--color-primary)] text-white"
                  : "border border-[var(--color-border)] text-[var(--color-text-soft)] hover:bg-[var(--color-divider)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)]">
        <div className="space-y-3">
          <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">近期复盘</h3>
              <FailureRanking items={summary.byFailureType} />
            </div>

            {loading ? (
              <EmptyPanel text="正在加载 Agent 复盘..." />
            ) : reviews.length === 0 ? (
              <EmptyPanel text={enabled ? "还没有复盘记录。完成一次 Agent Run 后这里会显示结果。" : "复盘台账未启用。"} />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-[var(--color-divider)] text-xs text-[var(--color-muted)]">
                    <tr>
                      <th className="py-2 pr-3 font-medium">结论</th>
                      <th className="py-2 pr-3 font-medium">任务</th>
                      <th className="py-2 pr-3 font-medium">失败类型</th>
                      <th className="py-2 pr-3 font-medium">分数</th>
                      <th className="py-2 pr-3 font-medium">时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-divider)]">
                    {reviews.map((review) => (
                      <tr
                        key={review.id}
                        onClick={() => setSelectedReviewId(review.id)}
                        className={`cursor-pointer hover:bg-[var(--color-primary-muted)] ${
                          selectedReview?.id === review.id ? "bg-[var(--color-primary-muted)]" : ""
                        }`}
                      >
                        <td className="py-2 pr-3"><Pill text={verdictLabel(review.verdict)} tone={verdictTone(review.verdict)} /></td>
                        <td className="py-2 pr-3">
                          <div className="font-medium text-[var(--color-text)]">{taskLabel(review.task_type)}</div>
                          <div className="text-xs text-[var(--color-muted)]">{shortId(review.run_id)} · {review.agent_id || "agent"}</div>
                        </td>
                        <td className="py-2 pr-3 text-xs text-[var(--color-text-soft)]">{failureLabel(review.primary_failure_type)}</td>
                        <td className="py-2 pr-3 text-xs text-[var(--color-muted)]">{Math.round(review.score * 100)}%</td>
                        <td className="py-2 pr-3 text-xs text-[var(--color-muted)]">{formatTime(review.reviewed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <ReviewDetail review={selectedReview} detail={detail} loading={detailLoading} />
        </div>

        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
                <ShieldCheck size={16} />
                Eval 候选队列
              </div>
              <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
                接受会进入待实现改进队列；提升会生成 regression eval 草案。两者都不会自动改代码，仍需要显式 apply。
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CANDIDATE_STATUS_FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setCandidateStatusFilter(item.value)}
                  className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    candidateStatusFilter === item.value
                      ? "bg-[var(--color-primary)] text-white"
                      : "border border-[var(--color-border)] text-[var(--color-text-soft)] hover:bg-[var(--color-divider)]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {candidateLifecycle && (
            <div className="mb-3 rounded-[var(--radius-sm)] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
              <div className="font-semibold">{candidateLifecycle.message}</div>
              <div className="mt-1">{candidateLifecycle.nextAction}</div>
              {candidateLifecycle.promotionDraft?.suggestedTestName && (
                <div className="mt-1 font-mono text-[11px] text-emerald-700">
                  {candidateLifecycle.promotionDraft.suggestedTestName}
                </div>
              )}
            </div>
          )}
          {candidates.length === 0 ? (
            <EmptyPanel text={`当前没有${candidateStatusLabel(candidateStatusFilter)} eval 候选。`} />
          ) : (
            <div className="space-y-3">
              {candidates.map((candidate) => (
                <article key={candidate.id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[var(--color-text)]">{candidate.name}</div>
                      <div className="mt-1 text-xs text-[var(--color-muted)]">
                        {taskLabel(candidate.task_type)} · {failureLabel(candidate.failure_type)} · {formatTime(candidate.updated_at)}
                      </div>
                    </div>
                    <Pill text={candidateStatusLabel(candidate.status)} />
                  </div>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--color-text-soft)]">
                    {candidate.input_summary || "无输入摘要"}
                  </p>
                  {candidateRepairSummary(candidate) && (
                    <div className="mt-2 rounded-[var(--radius-sm)] bg-[var(--color-divider)]/40 px-2 py-1.5 text-xs leading-5 text-[var(--color-muted)]">
                      修复动作：{candidateRepairSummary(candidate)}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {candidate.status !== "accepted" && (
                      <ActionButton label="接受" onClick={() => updateCandidate(candidate, "accepted")} />
                    )}
                    {candidate.status !== "rejected" && (
                      <ActionButton label="拒绝" onClick={() => updateCandidate(candidate, "rejected")} />
                    )}
                    {candidate.status !== "promoted" && (
                      <ActionButton label="提升为回归草案" onClick={() => updateCandidate(candidate, "promoted")} />
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ReviewDetail({ review, detail, loading }: {
  review: AgentReview | null;
  detail: ReviewDetailData | null;
  loading: boolean;
}) {
  if (!review) {
    return (
      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <EmptyPanel text="选择一条复盘查看详情。" />
      </section>
    );
  }
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">复盘详情 #{review.id}</h3>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Run {shortId(review.run_id)} · 用户 {shortId(review.user_id)} · reviewer {review.reviewer_version}
          </p>
        </div>
        <Pill text={verdictLabel(review.verdict)} tone={verdictTone(review.verdict)} />
      </div>
      <div className="rounded-[var(--radius-sm)] bg-[var(--color-divider)]/40 p-3 text-xs leading-5 text-[var(--color-text-soft)]">
        <div className="font-semibold text-[var(--color-text)]">建议修复</div>
        <div className="mt-1">{review.suggested_fix || "暂无建议"}</div>
      </div>
      <div className="mt-3 space-y-2">
        {loading && <EmptyPanel text="正在加载步骤和验证器详情..." />}
        {review.evidence_json.length === 0 ? (
          <EmptyPanel text="没有发现确定性失败证据。" />
        ) : (
          review.evidence_json.slice(0, 8).map((evidence, index) => (
            <div key={`${evidence.code}-${index}`} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Pill text={evidence.severity === "fail" ? "失败证据" : "警告证据"} tone={evidence.severity === "fail" ? "red" : "amber"} />
                <span className="font-medium text-[var(--color-text)]">{failureLabel(evidence.failureType)}</span>
                <span className="text-[var(--color-muted)]">{evidence.code}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--color-text-soft)]">{evidence.message}</p>
              {evidence.snippet && (
                <p className="mt-1 break-words text-xs leading-5 text-[var(--color-muted)]">{evidence.snippet}</p>
              )}
            </div>
          ))
        )}
      </div>
      {detail && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <InfoPanel
            title="路由审计"
            text={formatJson(detail.run?.contract?.routing || detail.run?.contract || {})}
          />
          <InfoPanel
            title="Eval 候选"
            text={detail.candidate
              ? `${detail.candidate.name} · ${candidateStatusLabel(detail.candidate.status)}`
              : "本次复盘没有关联候选，或候选已被去重合并。"}
          />
        </div>
      )}
      {detail?.steps?.length ? (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold text-[var(--color-text)]">运行步骤与验证器</h4>
          <div className="space-y-2">
            {detail.steps.map((step) => (
              <div key={step.id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Pill text={step.status} tone={step.status === "failed" ? "red" : "default"} />
                  <span className="font-medium text-[var(--color-text)]">{step.phase}</span>
                  <span className="text-[var(--color-muted)]">{step.toolName || "no-tool"}</span>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <InfoPanel title="输出摘要" text={step.outputSummary || "无"} />
                  <InfoPanel title="验证器" text={formatJson(step.verifier)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function InfoPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-[var(--color-divider)]/40 p-3">
      <div className="text-[11px] font-semibold text-[var(--color-text)]">{title}</div>
      <div className="mt-1 break-words text-xs leading-5 text-[var(--color-text-soft)]">{text}</div>
    </div>
  );
}

function FailureRanking({ items }: { items: Record<string, number> }) {
  const ranked = Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (ranked.length === 0) return <span className="text-xs text-[var(--color-muted)]">暂无失败排行</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {ranked.map(([name, count]) => (
        <Pill key={name} text={`${failureLabel(name)} ${count}`} tone="amber" />
      ))}
    </div>
  );
}

function Stat({ icon, label, value, tone = "default" }: {
  icon: ReactNode;
  label: string;
  value: number;
  tone?: "default" | "amber" | "red";
}) {
  const toneClass = tone === "red"
    ? "text-red-600"
    : tone === "amber"
      ? "text-amber-600"
      : "text-[var(--color-primary)]";
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className={`mb-2 inline-flex ${toneClass}`}>{icon}</div>
      <div className="text-2xl font-bold text-[var(--color-text)]">{value}</div>
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
    </div>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-divider)]"
    >
      {label}
    </button>
  );
}

function Notice({ tone, text }: { tone: "success" | "warn" | "error"; text: string }) {
  const className = tone === "error"
    ? "border-red-200 bg-red-50 text-red-700"
    : tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return <div className={`rounded-[var(--radius-md)] border px-3 py-2 text-sm ${className}`}>{text}</div>;
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-muted)]">
      {text}
    </div>
  );
}

function Pill({ text, tone = "default" }: { text: string; tone?: "default" | "green" | "amber" | "red" }) {
  const className = tone === "green"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : tone === "amber"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : tone === "red"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-[var(--color-divider)] text-[var(--color-text-soft)] border-[var(--color-border)]";
  return <span className={`inline-flex rounded-[var(--radius-sm)] border px-2 py-0.5 text-[11px] font-medium ${className}`}>{text}</span>;
}

function verdictLabel(verdict: string): string {
  if (verdict === "pass") return "通过";
  if (verdict === "fail") return "失败";
  return "警告";
}

function verdictTone(verdict: string): "green" | "amber" | "red" {
  if (verdict === "pass") return "green";
  if (verdict === "fail") return "red";
  return "amber";
}

function candidateStatusLabel(status: string): string {
  if (status === "accepted") return "已接受";
  if (status === "rejected") return "已拒绝";
  if (status === "promoted") return "已提升";
  return "候选";
}

function taskLabel(taskType: string): string {
  const labels: Record<string, string> = {
    career_positioning_guidance: "自我定位",
    resume_query: "简历查询",
    resume_edit: "简历优化",
    jd_evaluation: "JD 评估",
    offer_evaluation: "Offer 评估",
    interview_coaching: "模拟面试",
    profile_update: "画像更新",
    reference_resume_save: "优秀简历沉淀",
    file_export: "文件导出",
  };
  return labels[taskType] || taskType || "未知任务";
}

function failureLabel(failureType: string): string {
  const labels: Record<string, string> = {
    routing_error: "路由错误",
    tool_contract_mismatch: "工具契约不匹配",
    missing_run: "缺少运行记录",
    wrong_task_routed: "任务路由错误",
    tool_failed_but_message_success: "工具失败却提示成功",
    tool_succeeded_but_message_failure: "工具成功却提示失败",
    missing_readback: "缺少读回验证",
    partial_write: "部分写入",
    image_intake_failure: "图片识别链路失败",
    image_intake_not_called: "图片识别未调用",
    image_intake_conflict_ignored: "图片冲突被忽略",
    guided_task_drift: "引导任务漂移",
    context_loss: "上下文丢失",
    bad_output_rendering: "输出渲染差",
    admin_action_no_feedback: "后台操作无反馈",
    resume_write_pollution: "简历写入污染",
    profile_signal_noise: "画像信号噪声",
    interview_policy_violation: "面试策略违规",
    memory_governance_failure: "记忆治理失败",
    user_intent_unresolved: "用户意图未解决",
    llm_judge_quality_warning: "语义质量警告",
    system_error: "系统错误",
  };
  return labels[failureType] || failureType || "无";
}

function candidateRepairSummary(candidate: EvalCandidate): string {
  const plan = findRepairPlan(candidate.expected_contract_json) || findRepairPlan(candidate.fixture_json);
  if (!plan) return "";
  const action = typeof plan.action === "string" ? repairActionLabel(plan.action) : "";
  const status = typeof plan.status === "string" ? repairStatusLabel(plan.status) : "";
  const reason = typeof plan.reason === "string" ? plan.reason : "";
  return [action, status, reason].filter(Boolean).join(" · ");
}

function findRepairPlan(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.repairPlan && typeof record.repairPlan === "object" && !Array.isArray(record.repairPlan)) {
    return record.repairPlan as Record<string, unknown>;
  }
  for (const item of Object.values(record)) {
    const nested = findRepairPlan(item);
    if (nested) return nested;
  }
  return null;
}

function repairActionLabel(action: string): string {
  const labels: Record<string, string> = {
    retry_transient: "重试临时错误",
    rerun_image_intake: "补跑图片识别",
    ask_clarification: "询问用户确认",
    rollback_partial_write: "回滚部分写入",
    resume_guided_task: "恢复引导任务",
    correct_success_claim: "纠正成功话术",
    create_eval_candidate: "沉淀 Eval",
    needs_engineering: "转工程处理",
    noop: "无需操作",
  };
  return labels[action] || action;
}

function repairStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    repairing: "修复中",
    waiting_user: "等待用户",
    recovered: "已恢复",
    failed: "修复失败",
    rolled_back: "已回滚",
    needs_engineering: "需要工程处理",
  };
  return labels[status] || status;
}

function shortId(value: string): string {
  if (!value) return "-";
  return value.length <= 8 ? value : value.slice(0, 8);
}

function formatTime(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatJson(value: unknown): string {
  if (!value) return "无";
  if (typeof value === "string") return value || "无";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
