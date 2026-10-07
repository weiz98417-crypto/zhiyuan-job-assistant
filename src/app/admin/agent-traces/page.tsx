"use client";

/**
 * Admin Trace 页（Spec 18 / ADR-0040）。
 * 只呈现元数据：trace 树（span/generation）、模型、token 成本、延迟。
 * 没有正文列可读——这本身就是脱敏约束（ADR-0040）。
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

interface TraceRow {
  run_id: string;
  user_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
}

interface ObservationRow {
  id: string;
  kind: string;
  name: string;
  status: string;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  latency_ms: number | null;
  level: string;
}

interface TraceDetail {
  trace: TraceRow | null;
  observations: ObservationRow[];
}

export default function AdminAgentTracesPage() {
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<TraceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/agent-traces?limit=50", { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "trace 读取失败");
      setTraces(Array.isArray(json.data) ? json.data : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "trace 读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    fetch(`/api/admin/agent-traces?runId=${encodeURIComponent(selected)}`, { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) throw new Error(json.error || "trace 详情读取失败");
        if (!cancelled) setDetail(json.data as TraceDetail);
      })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "trace 详情读取失败"); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Agent Traces</h1>
          <p className="mt-1 text-xs text-slate-500">
            Langfuse 形状（trace → observations）；仅元数据：模型 / token / 延迟 / 事件名。正文按 ADR-0040 不入库。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}刷新
        </button>
      </header>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Run</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">开始</th>
              </tr>
            </thead>
            <tbody>
              {traces.map((trace) => (
                <tr
                  key={trace.run_id}
                  onClick={() => setSelected(trace.run_id)}
                  className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${selected === trace.run_id ? "bg-slate-100" : ""}`}
                >
                  <td className="max-w-[14rem] truncate px-3 py-2 font-mono text-[11px]">{trace.run_id}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${trace.status === "succeeded" ? "bg-emerald-50 text-emerald-700" : trace.status === "failed" ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600"}`}>
                      {trace.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{new Date(trace.started_at).toLocaleString()}</td>
                </tr>
              ))}
              {!loading && traces.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-400">暂无 trace（真跑一次 agent run 后出现）</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          {!selected && <p className="text-xs text-slate-400">选择左侧一个 trace 查看调用树。</p>}
          {selected && detailLoading && (
            <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={13} className="animate-spin" />读取中…</p>
          )}
          {selected && detail && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-mono text-xs text-slate-700">{selected}</h2>
                <span className="text-xs text-slate-500">
                  {detail.observations.reduce((sum, item) => sum + (item.total_tokens || 0), 0).toLocaleString()} tokens
                </span>
              </div>
              <ol className="space-y-1.5">
                {detail.observations.map((observation) => (
                  <li
                    key={observation.id}
                    className={`rounded-lg border px-3 py-1.5 text-xs ${observation.level === "error" ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${observation.kind === "generation" ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-600"}`}>
                        {observation.kind}
                      </span>
                      <span className="font-medium text-slate-700">{observation.name}</span>
                      {observation.model && <span className="text-slate-500">{observation.model}</span>}
                      {observation.total_tokens !== null && (
                        <span className="ml-auto text-slate-500">{observation.total_tokens.toLocaleString()} tokens</span>
                      )}
                      {observation.latency_ms !== null && <span className="text-slate-400">{observation.latency_ms}ms</span>}
                    </div>
                  </li>
                ))}
                {detail.observations.length === 0 && <li className="text-xs text-slate-400">该 trace 暂无 observation。</li>}
              </ol>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
