'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';

interface SecurityEvent {
  id: string;
  eventType: string;
  actorUserId?: string;
  targetUserId?: string;
  actorRole?: string;
  outcome: string;
  reasonCode?: string;
  requestId: string;
  sourceIp?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const PAGE_SIZE = 50;

export default function SecurityEventsPage() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [eventType, setEventType] = useState('');
  const [outcome, setOutcome] = useState('');
  const [appliedEventType, setAppliedEventType] = useState('');
  const [appliedOutcome, setAppliedOutcome] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (appliedEventType) params.set('eventType', appliedEventType);
    if (appliedOutcome) params.set('outcome', appliedOutcome);
    try {
      const response = await fetch(`/api/admin/security-events?${params.toString()}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '安全事件加载失败');
      setEvents(Array.isArray(data.events) ? data.events : []);
      setTotal(Number(data.total) || 0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '安全事件加载失败');
    } finally {
      setLoading(false);
    }
  }, [appliedEventType, appliedOutcome, offset]);

  useEffect(() => { void load(); }, [load]);

  function applyFilters() {
    setOffset(0);
    setAppliedEventType(eventType.trim());
    setAppliedOutcome(outcome);
  }

  return (
    <div className="space-y-5">
      <header className="page-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)]">安全审计</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">只读、追加式的身份认证与特权操作记录。</p>
        </div>
        <button type="button" title="刷新安全事件" onClick={() => void load()} className="p-2 text-[var(--color-primary)] disabled:opacity-50" disabled={loading}>
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="flex flex-wrap items-end gap-3 border-y border-[var(--color-border)] py-4">
        <label className="text-xs font-medium text-[var(--color-text-soft)]">
          事件类型
          <input value={eventType} onChange={(event) => setEventType(event.target.value)} placeholder="例如 login_failure" className="mt-1 block w-56 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]" />
        </label>
        <label className="text-xs font-medium text-[var(--color-text-soft)]">
          结果
          <select value={outcome} onChange={(event) => setOutcome(event.target.value)} className="mt-1 block w-36 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]">
            <option value="">全部</option>
            <option value="success">成功</option>
            <option value="failure">失败</option>
          </select>
        </label>
        <button type="button" onClick={applyFilters} className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white">
          <Search size={15} />筛选
        </button>
      </div>

      {error ? (
        <p className="py-10 text-center text-sm text-red-600">{error}</p>
      ) : (
        <div className="overflow-x-auto border-y border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead><tr className="bg-[var(--color-bg)] text-left text-xs text-[var(--color-muted)]">
              {['时间', '事件', '结果', '操作者', '目标', '来源 IP', '原因', '请求 ID', '元数据'].map((heading) => (
                <th key={heading} className="border-b border-[var(--color-divider)] px-3 py-3 font-semibold">{heading}</th>
              ))}
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-3 py-12 text-center text-[var(--color-muted)]">加载中...</td></tr>
              ) : events.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-12 text-center text-[var(--color-muted)]">没有符合条件的安全事件</td></tr>
              ) : events.map((event) => (
                <tr key={event.id} className="border-b border-[var(--color-divider)] align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-[var(--color-text-soft)]">{new Date(event.createdAt).toLocaleString('zh-CN')}</td>
                  <td className="px-3 py-3 font-medium text-[var(--color-text)]">{event.eventType}</td>
                  <td className={`px-3 py-3 text-xs font-semibold ${event.outcome === 'success' ? 'text-green-700' : 'text-red-700'}`}>{event.outcome}</td>
                  <td className="px-3 py-3 text-xs text-[var(--color-text-soft)]">{event.actorUserId || '—'}<br />{event.actorRole || ''}</td>
                  <td className="px-3 py-3 text-xs text-[var(--color-text-soft)]">{event.targetUserId || '—'}</td>
                  <td className="px-3 py-3 text-xs text-[var(--color-text-soft)]">{event.sourceIp || '—'}</td>
                  <td className="px-3 py-3 text-xs text-[var(--color-text-soft)]">{event.reasonCode || '—'}</td>
                  <td className="max-w-44 break-all px-3 py-3 font-mono text-[11px] text-[var(--color-muted)]">{event.requestId}</td>
                  <td className="max-w-72 break-all px-3 py-3 font-mono text-[11px] text-[var(--color-muted)]">{JSON.stringify(event.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
        <span>共 {total} 条，第 {total === 0 ? 0 : Math.floor(offset / PAGE_SIZE) + 1} 页</span>
        <div className="flex gap-2">
          <button type="button" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 disabled:opacity-40">上一页</button>
          <button type="button" disabled={offset + PAGE_SIZE >= total || loading} onClick={() => setOffset(offset + PAGE_SIZE)} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 disabled:opacity-40">下一页</button>
        </div>
      </div>
    </div>
  );
}
