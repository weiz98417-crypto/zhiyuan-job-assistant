'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/lib/use-toast';

interface UserItem {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: 'admin' | 'member';
  status: 'pending' | 'active' | 'rejected';
  createdAt: string;
  lastLoginAt: string | null;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers(statusFilter?: string) {
    setLoading(true);
    try {
      const url = statusFilter
        ? `/api/admin/users?status=${statusFilter}`
        : '/api/admin/users';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      }
    } catch { /* network error — retain old list */ }
    setLoading(false);
  }

  function handleFilter(f: string) {
    setFilter(f);
    loadUsers(f === 'all' ? undefined : f);
  }

  async function approve(id: string) {
    setActionLoading(id);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    if (res.ok) showToast('审批通过');
    else showToast((await res.json()).error || '操作失败', 'error');
    setActionLoading(null);
    loadUsers(filter === 'all' ? undefined : filter);
  }

  async function reject(id: string) {
    setActionLoading(id);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    });
    if (res.ok) showToast('已拒绝');
    else showToast((await res.json()).error || '操作失败', 'error');
    setActionLoading(null);
    loadUsers(filter === 'all' ? undefined : filter);
  }

  async function resetPassword(id: string) {
    const pw = prompt('输入新密码（至少6位）：');
    if (!pw) return;
    if (pw.length < 6) { showToast('密码至少6位', 'error'); return; }
    setActionLoading(id);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: pw }),
    });
    if (res.ok) showToast('密码已重置');
    else showToast((await res.json()).error || '操作失败', 'error');
    setActionLoading(null);
  }

  async function toggleRole(id: string, currentRole: string) {
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    setActionLoading(id);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) showToast(`已改为${newRole === 'admin' ? '管理员' : '成员'}`);
    else showToast((await res.json()).error || '操作失败', 'error');
    setActionLoading(null);
    loadUsers(filter === 'all' ? undefined : filter);
  }

  async function deleteUser(id: string) {
    setActionLoading(id);
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('用户已删除');
      setDeleteTarget(null);
      loadUsers(filter === 'all' ? undefined : filter);
    } else {
      const data = await res.json();
      showToast(data.error || '删除失败', 'error');
    }
    setActionLoading(null);
  }

  const pendingCount = users.filter((u) => u.status === 'pending').length;
  const activeCount = filter === 'all' ? users.filter((u) => u.status === 'active').length : 0;
  const rejectedCount = filter === 'all' ? users.filter((u) => u.status === 'rejected').length : 0;

  const statusLabel: Record<string, string> = { pending: '待审批', active: '已通过', rejected: '已拒绝' };
  const roleLabel: Record<string, string> = { admin: '管理员', member: '成员' };

  return (
    <div>
      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.25)',
        }} onClick={() => setDeleteTarget(null)}>
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-md)',
            padding: 24, maxWidth: 380, width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontSize: '1.1rem',
              fontWeight: 700, color: 'var(--color-text)', marginBottom: 8,
            }}>确认删除用户</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-soft)', lineHeight: 1.6 }}>
              将删除 <strong>{deleteTarget.displayName}</strong>（{deleteTarget.username}）及其所有数据，包括：
            </p>
            <ul style={{ fontSize: '0.78rem', color: 'var(--color-muted)', margin: '8px 0 16px', paddingLeft: 18 }}>
              <li>个人画像 & 求职目标</li>
              <li>评估记录 & JD 报告</li>
              <li>对话历史</li>
              <li>简历数据 & 偏好设置</li>
            </ul>
            <p style={{ fontSize: '0.78rem', color: '#A85454', marginBottom: 18 }}>
              此操作不可撤销。
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={actionLoading === deleteTarget.id}
                style={{
                  padding: '8px 18px', borderRadius: 'var(--radius-sm)',
                  fontSize: '0.82rem', border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)', color: 'var(--color-text-soft)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >取消</button>
              <button
                onClick={() => deleteUser(deleteTarget.id)}
                disabled={actionLoading === deleteTarget.id}
                style={{
                  padding: '8px 18px', borderRadius: 'var(--radius-sm)',
                  fontSize: '0.82rem', fontWeight: 600,
                  border: 'none', background: '#A85454', color: '#fff',
                  cursor: actionLoading === deleteTarget.id ? 'not-allowed' : 'pointer',
                  opacity: actionLoading === deleteTarget.id ? 0.6 : 1,
                  fontFamily: 'inherit',
                }}
              >{actionLoading === deleteTarget.id ? '删除中...' : '确认删除'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: '1.5rem',
          fontWeight: 700, color: 'var(--color-text)',
        }}>用户管理</h2>
        <p style={{
          fontSize: '0.8rem', color: 'var(--color-muted)', marginTop: 4,
        }}>管理所有注册用户，审批新注册申请</p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          ['all', `全部 · ${users.length}`],
          ['pending', `待审批${pendingCount > 0 ? ' ' + pendingCount : ''}`],
          ['active', `已通过 · ${activeCount}`],
          ['rejected', `已拒绝 · ${rejectedCount}`],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => handleFilter(key)}
            style={{
              padding: '6px 14px', borderRadius: 'var(--radius-sm)',
              fontSize: '0.78rem', fontWeight: filter === key ? 600 : 500,
              border: filter === key
                ? '1px solid var(--color-primary)'
                : '1px solid var(--color-border)',
              background: filter === key
                ? 'var(--color-primary-soft)'
                : 'var(--color-surface)',
              color: filter === key
                ? 'var(--color-primary-hover)'
                : 'var(--color-text-soft)',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {label}
            {key === 'pending' && pendingCount > 0 && (
              <span style={{
                minWidth: 18, height: 18, borderRadius: 999,
                background: '#A85454', color: '#fff',
                fontSize: '0.65rem', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', padding: '0 4px',
              }}>{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr>
              {['用户名', '显示名', '邮箱', '角色', '状态', '注册时间', '最近登录', '操作'].map((h) => (
                <th key={h} style={{
                  textAlign: 'left', padding: '10px 14px',
                  background: 'var(--color-bg)', fontWeight: 600,
                  fontSize: '0.72rem', color: 'var(--color-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  borderBottom: '2px solid var(--color-divider)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{
                textAlign: 'center', padding: '2rem',
                color: 'var(--color-muted)',
              }}>加载中...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={8} style={{
                textAlign: 'center', padding: '2rem',
                color: 'var(--color-muted)',
              }}>暂无数据</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--color-divider)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--color-text)' }}>
                    {u.username}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--color-text-soft)' }}>
                    {u.displayName}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '0.75rem', color: 'var(--color-text-soft)' }}>
                    {u.email || '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px',
                      borderRadius: 999, fontSize: '0.68rem', fontWeight: 600,
                      background: u.role === 'admin' ? 'var(--color-primary-muted)' : 'var(--color-bg)',
                      color: u.role === 'admin' ? 'var(--color-primary-hover)' : 'var(--color-text-soft)',
                    }}>{roleLabel[u.role]}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px',
                      borderRadius: 999, fontSize: '0.68rem', fontWeight: 600,
                      background: { pending: '#FFFBF0', active: '#EFF8F2', rejected: 'var(--color-bg)' }[u.status],
                      color: { pending: '#B8863A', active: '#4A8C6A', rejected: 'var(--color-muted)' }[u.status],
                    }}>{statusLabel[u.status]}</span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '0.72rem', color: 'var(--color-text-soft)' }}>
                    {u.createdAt}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '0.72rem', color: 'var(--color-text-soft)' }}>
                    {u.lastLoginAt || '从未登录'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {u.status === 'pending' ? (
                        <>
                          <ActionBtn
                            label="通过"
                            onClick={() => approve(u.id)}
                            loading={actionLoading === u.id}
                            color="#4A8C6A"
                            borderColor="#B7E4C7"
                          />
                          <ActionBtn
                            label="拒绝"
                            onClick={() => reject(u.id)}
                            loading={actionLoading === u.id}
                            color="#A85454"
                            borderColor="#F5C6C6"
                          />
                        </>
                      ) : u.status === 'active' ? (
                        <>
                          <ActionBtn
                            label="重置密码"
                            onClick={() => resetPassword(u.id)}
                            loading={actionLoading === u.id}
                          />
                          <ActionBtn
                            label={u.role === 'admin' ? '降为成员' : '升为管理'}
                            onClick={() => toggleRole(u.id, u.role)}
                            loading={actionLoading === u.id}
                          />
                          {u.role !== 'admin' && (
                            <ActionBtn
                              label="删除"
                              onClick={() => setDeleteTarget(u)}
                              loading={actionLoading === u.id}
                              color="#A85454"
                              borderColor="#F5C6C6"
                            />
                          )}
                        </>
                      ) : (
                        <>
                          <ActionBtn
                            label="重新通过"
                            onClick={() => approve(u.id)}
                            loading={actionLoading === u.id}
                            color="#4A8C6A"
                            borderColor="#B7E4C7"
                          />
                          <ActionBtn
                            label="删除"
                            onClick={() => setDeleteTarget(u)}
                            loading={actionLoading === u.id}
                            color="#A85454"
                            borderColor="#F5C6C6"
                          />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Mini component: action button with loading spinner ── */
function ActionBtn({
  label, onClick, loading, color, borderColor,
}: {
  label: string;
  onClick: () => void;
  loading?: boolean;
  color?: string;
  borderColor?: string;
}) {
  const c = color || 'var(--color-text-soft)';
  const bc = borderColor || 'var(--color-border)';
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        padding: '3px 8px', borderRadius: 'var(--radius-sm)',
        fontSize: '0.7rem', fontWeight: 500,
        border: `1px solid ${bc}`,
        background: 'var(--color-surface)',
        color: c,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.5 : 1,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }}
    >
      {loading ? '...' : label}
    </button>
  );
}
