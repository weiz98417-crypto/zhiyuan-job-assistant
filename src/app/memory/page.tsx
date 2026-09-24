"use client";

import { useCallback, useEffect, useState } from "react";

interface Candidate {
  id: number;
  kind: string;
  canonicalText: string;
  sourceType: string;
  sourceId: string;
  createdAt: string;
  expiresAt: string;
  status: string;
  sensitivity: "none" | "job_sensitive";
}

interface ActiveFact {
  id: number;
  canonicalText: string;
  subject: string;
  predicate: string;
  partition: string;
  sourceType: string | null;
  sourceId: string | null;
  validAt: string;
}

interface MemoryData {
  candidates: Candidate[];
  facts: ActiveFact[];
  discovery: { enabled: boolean; noticeAcknowledged: boolean };
}

const EMPTY: MemoryData = { candidates: [], facts: [], discovery: { enabled: true, noticeAcknowledged: false } };

export default function MemoryPage() {
  const [data, setData] = useState<MemoryData>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/memory/candidates", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.success) setData({ ...EMPTY, ...payload.data, discovery: { ...EMPTY.discovery, ...(payload.data.discovery || {}) } });
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function candidateAction(id: number, action: "confirm" | "reject") {
    const candidate = data.candidates.find((item) => item.id === id);
    const confirmedJobUse = action === "confirm" && candidate?.sensitivity === "job_sensitive"
      ? window.confirm("这条记忆包含求职敏感偏好（例如薪资、签证或健康限制）。确认仅用于你的求职助手筛选和建议吗？")
      : false;
    if (action === "confirm" && candidate?.sensitivity === "job_sensitive" && !confirmedJobUse) return;
    setBusy(`candidate:${id}:${action}`);
    setMessage("");
    try {
      const response = await fetch("/api/memory/candidates", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action, confirmedJobUse }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "操作失败");
      setMessage(action === "confirm" ? "已确认记忆" : "已拒绝候选");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function setDiscovery(enabled: boolean) {
    setBusy("discovery");
    setMessage("");
    try {
      const response = await fetch("/api/memory/discovery", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, acknowledgeNotice: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "设置失败");
      await load();
      setMessage(enabled ? "已开启自动发现" : "已关闭自动发现，未确认闲聊候选已清除");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function eraseFact(id: number) {
    setBusy(`erase:${id}`);
    setMessage("");
    try {
      const preparedResponse = await fetch("/api/memory/erasure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType: "fact", targetId: id }),
      });
      const prepared = await preparedResponse.json().catch(() => ({}));
      if (!preparedResponse.ok || !prepared.success) throw new Error(prepared.error || "无法准备清除范围");
      const confirmed = window.confirm(`将清除以下记忆及其派生副本：\n\n${prepared.data.canonicalText}\n\n原始对话、简历和报告会保留。确认继续？`);
      if (!confirmed) {
        await fetch("/api/memory/erasure", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestId: prepared.data.request.id, action: "cancel" }),
        });
        return;
      }
      const response = await fetch("/api/memory/erasure", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: prepared.data.request.id, action: "confirm" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "清除未完成");
      setMessage("清除请求已完成并读回确认");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function correctFact(fact: ActiveFact) {
    const replacement = window.prompt("请输入纠正后的事实：", fact.canonicalText)?.trim();
    if (!replacement || replacement === fact.canonicalText) return;
    const sourceText = window.prompt("请说明这次纠正的依据：", replacement)?.trim();
    if (!sourceText) return;
    setBusy(`correct:${fact.id}`);
    setMessage("");
    try {
      const response = await fetch("/api/memory/correction", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetFactId: fact.id,
          canonicalText: replacement,
          sourceText,
          object: { value: replacement },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "纠正未完成");
      setMessage("已写入纠正后的事实，旧事实已失效");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">我的记忆</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">查看来源和状态，分别确认、纠正或清除记忆。未确认的闲聊候选不会影响推荐。</p>
      </header>
      {message && <div role="status" className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">{message}</div>}

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium text-[var(--color-text)]">自动发现记忆候选</h2>
            <p className="mt-1 text-xs text-[var(--color-muted)]">关闭后会立即清除尚未确认的闲聊候选；你仍可单次明确请求“请记住”。</p>
          </div>
          <button type="button" disabled={busy === "discovery"} onClick={() => void setDiscovery(!data.discovery.enabled)} className="rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-2 text-sm text-white disabled:opacity-50">
            {data.discovery.enabled ? "关闭自动发现" : "开启自动发现"}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium text-[var(--color-text)]">待确认候选（{data.candidates.length}）</h2>
        {data.candidates.length === 0 ? <Empty text="暂无待确认候选。" /> : data.candidates.map((candidate) => (
          <article key={candidate.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-sm text-[var(--color-text)]">{candidate.canonicalText}</p>
            {candidate.sensitivity === "job_sensitive" && <p className="mt-2 text-xs text-amber-700">求职敏感内容：确认前会要求你同意仅用于求职辅助。</p>}
            <p className="mt-2 text-xs text-[var(--color-muted)]">来源：{candidate.sourceType} / {candidate.sourceId} · 到期：{new Date(candidate.expiresAt).toLocaleDateString()}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={busy !== null} onClick={() => void candidateAction(candidate.id, "confirm")} className="rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-xs text-white">确认记住</button>
              <button type="button" disabled={busy !== null} onClick={() => void candidateAction(candidate.id, "reject")} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-soft)]">拒绝</button>
            </div>
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium text-[var(--color-text)]">已生效事实（{data.facts.length}）</h2>
        {data.facts.length === 0 ? <Empty text="暂无可显示的私人事实。" /> : data.facts.map((fact) => (
          <article key={fact.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div>
              <p className="text-sm text-[var(--color-text)]">{fact.canonicalText}</p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">分区：{fact.partition} · 来源：{fact.sourceType || "未知"} / {fact.sourceId || "未知"}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={busy !== null} onClick={() => void correctFact(fact)} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-soft)]">纠正</button>
              <button type="button" disabled={busy !== null} onClick={() => void eraseFact(fact.id)} className="rounded-[var(--radius-sm)] border border-red-200 px-3 py-1.5 text-xs text-red-600">清除记忆</button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-5 text-sm text-[var(--color-muted)]">{text}</div>;
}
