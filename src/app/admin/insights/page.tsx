'use client';

import { useState, useEffect } from 'react';
import type { TeamInsights } from '@/lib/team-insights';

export default function AdminInsightsPage() {
  const [data, setData] = useState<TeamInsights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/insights')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-muted)' }}>
        加载中...
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-muted)' }}>
        加载失败，请刷新重试
      </div>
    );
  }

  const { overview, weeklyActivity, hotDirections, weeklyTrend } = data;
  const maxActivity = Math.max(1, ...weeklyActivity.map((a) => a.count));
  const maxTrend = Math.max(1, ...weeklyTrend.map((t) => t.count));

  return (
    <div>
      <div className="page-header">
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: '1.5rem',
          fontWeight: 700, color: 'var(--color-text)',
        }}>团队洞察</h2>
        <p style={{
          fontSize: '0.8rem', color: 'var(--color-muted)', marginTop: 4,
        }}>团队整体活跃度一览</p>
      </div>

      {/* Overview cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 16, marginBottom: 24,
      }}>
        {[
          ['总用户数', overview.totalUsers],
          ['本周活跃', overview.activeThisWeek],
          ['待审批', overview.pendingApprovals],
        ].map(([label, value]) => (
          <div key={label} style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 20,
          }}>
            <div style={{
              fontSize: '0.72rem', fontWeight: 500,
              color: 'var(--color-muted)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
              marginBottom: 8,
            }}>{label}</div>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: '2rem',
              fontWeight: 700, color: 'var(--color-text)',
            }}>{String(value)}</div>
          </div>
        ))}
      </div>

      {/* Panels */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
      }}>
        {/* Activity ranking */}
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', padding: 20,
        }}>
          <h3 style={{
            fontSize: '0.85rem', fontWeight: 600,
            color: 'var(--color-text)', marginBottom: 14,
          }}>个人活跃度排行</h3>
          {weeklyActivity.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>暂无数据</p>
          ) : (
            weeklyActivity.map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 0', borderBottom: '1px solid var(--color-divider)',
              }}>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-muted)',
                  width: 20,
                }}>{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '0.8rem', color: 'var(--color-text)',
                    marginBottom: 3,
                  }}>{a.displayName}</div>
                  <div style={{
                    height: 4, background: 'var(--color-primary-muted)',
                    borderRadius: 2,
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      background: 'var(--color-primary)',
                      width: `${(a.count / maxActivity) * 100}%`,
                    }} />
                  </div>
                </div>
                <span style={{
                  fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-primary)',
                }}>{a.count} 次</span>
              </div>
            ))
          )}
        </div>

        {/* Hot directions + trend */}
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', padding: 20,
        }}>
          <h3 style={{
            fontSize: '0.85rem', fontWeight: 600,
            color: 'var(--color-text)', marginBottom: 14,
          }}>热门 JD 方向（近30天）</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
            {hotDirections.map((d) => (
              <span key={d.archetype} style={{
                padding: '4px 10px', borderRadius: 999,
                fontSize: '0.72rem', fontWeight: 500,
                background: 'var(--color-primary-muted)',
                color: 'var(--color-primary-hover)',
              }}>{d.archetype} · {d.count}</span>
            ))}
          </div>

          <h3 style={{
            fontSize: '0.85rem', fontWeight: 600,
            color: 'var(--color-text)', marginBottom: 14,
          }}>近4周评估趋势</h3>
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-end',
            height: 80,
          }}>
            {weeklyTrend.map((t) => (
              <div key={t.week} style={{ flex: 1, position: 'relative' }}>
                <div style={{
                  background: 'var(--color-primary)',
                  borderRadius: '3px 3px 0 0',
                  opacity: 0.6,
                  height: `${Math.max(4, (t.count / maxTrend) * 80)}px`,
                  minHeight: 4,
                }} />
                <span style={{
                  position: 'absolute', bottom: -20, left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '0.6rem', color: 'var(--color-muted)',
                  whiteSpace: 'nowrap',
                }}>{t.week}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
