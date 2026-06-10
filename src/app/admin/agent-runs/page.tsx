"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Shield, Wrench } from "lucide-react";

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
  };
  result: unknown;
  error: unknown;
  createdAt: string;
  updatedAt: string;
  recentSteps: DebugStep[];
}

export default function AdminAgentRunsPage() {
  const [runs, setRuns] = useState<DebugRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    loadRuns();
  }, []);

  async function loadRuns() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/agent-runs?limit=50", { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) throw new Error(payload.error || "Failed to load agent runs");
      setEnabled(payload.enabled !== false);
      setRuns(Array.isArray(payload.data) ? payload.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agent runs");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)]">
            Agent Run Debug
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Failed durable runs with redacted verifier and tool evidence.
          </p>
        </div>
        <button
          type="button"
          onClick={loadRuns}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-divider)] disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {!enabled && (
        <Notice tone="warn" text="Agent run ledger is disabled. Configure DB_DRIVER=postgres and DATABASE_URL to enable this debug view." />
      )}
      {error && <Notice tone="error" text={error} />}

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Failed runs" value={runs.length} />
        <Stat label="Resume edits" value={runs.filter((run) => run.taskType === "resume_edit").length} />
        <Stat label="Verifier failures" value={runs.reduce((sum, run) => sum + run.recentSteps.filter((step) => step.status === "failed").length, 0)} />
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-muted)]">
            Loading agent run ledger...
          </div>
        ) : runs.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-muted)]">
            No failed agent runs found.
          </div>
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
            <span>{run.taskType}</span>
            <Pill text={run.status} tone="red" />
            <Pill text={run.agentId || "unknown-agent"} />
          </div>
          <div className="mt-1 text-xs text-[var(--color-muted)]">
            run {run.id} · user {run.userId} · session {run.sessionId ?? "none"} · updated {formatTime(run.updatedAt)}
          </div>
        </div>
        <div className="max-w-xl text-xs text-[var(--color-muted)]">
          target: {run.contract.target || "n/a"}
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <InfoBlock title="Success criteria" items={run.contract.successCriteria} />
        <InfoBlock title="Validators" items={run.contract.validators} />
      </div>

      <div className="mt-3 space-y-2">
        {run.recentSteps.map((step) => (
          <div key={step.id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[var(--color-text)]">
              <Wrench size={13} />
              <span>{step.phase}</span>
              {step.toolName && <Pill text={step.toolName} />}
              <Pill text={step.status} tone={step.status === "failed" ? "red" : "default"} />
              <span className="text-[var(--color-muted)]">{formatTime(step.createdAt)}</span>
            </div>
            {step.inputSummary && <p className="text-[var(--color-muted)]">input: {step.inputSummary}</p>}
            {step.outputSummary && <p className="mt-1 text-[var(--color-muted)]">output: {step.outputSummary}</p>}
            <JsonLine label="verifier" value={step.verifier} />
            <JsonLine label="error" value={step.error} />
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
        <div className="text-[var(--color-muted)]">none</div>
      )}
    </div>
  );
}

function JsonLine({ label, value }: { label: string; value: unknown }) {
  const text = JSON.stringify(value || {});
  if (!text || text === "{}") return null;
  return <p className="mt-1 break-words text-[var(--color-muted)]">{label}: {text}</p>;
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
      <div className="mt-2 text-2xl font-bold text-[var(--color-text)]">{value}</div>
    </div>
  );
}

function Pill({ text, tone = "default" }: { text: string; tone?: "default" | "red" }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
      tone === "red" ? "bg-red-50 text-red-600" : "bg-[var(--color-primary-muted)] text-[var(--color-text-soft)]"
    }`}>
      {text}
    </span>
  );
}

function formatTime(value: string) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
