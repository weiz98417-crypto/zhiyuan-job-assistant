'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, KeyRound, ShieldCheck, Trash2, X } from 'lucide-react';
import { useToast } from '@/lib/use-toast';

type UserRole = 'member' | 'admin' | 'superadmin';
type UserStatus = 'pending' | 'active' | 'rejected';

interface UserItem {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
  passwordRecovery?: {
    id: string;
    requestedAt: string;
  };
}

interface CurrentUser {
  id: string;
  role: UserRole;
}

interface UserSummary {
  all: number;
  pending: number;
  active: number;
  rejected: number;
}

const EMPTY_SUMMARY: UserSummary = { all: 0, pending: 0, active: 0, rejected: 0 };

type SecureAction =
  | { kind: 'reset'; target: UserItem }
  | { kind: 'role'; target: UserItem; role: UserRole }
  | { kind: 'status'; target: UserItem; status: UserStatus }
  | { kind: 'delete'; target: UserItem };

const statusLabel: Record<UserStatus, string> = {
  pending: '待审批', active: '已通过', rejected: '已拒绝',
};
const roleLabel: Record<UserRole, string> = {
  admin: '管理员', member: '成员', superadmin: '超级管理员',
};

export default function AdminUsersPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [summary, setSummary] = useState<UserSummary>(EMPTY_SUMMARY);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null);
  const [secureAction, setSecureAction] = useState<SecureAction | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');

  useEffect(() => {
    void loadUsers();
    fetch('/api/users/me')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data && setCurrentUser({ id: data.id, role: data.role }))
      .catch(() => {});
  }, []);

  async function handleUnauthorized() {
    showToast('登录状态已失效，请重新登录', 'error');
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.push('/login');
    router.refresh();
  }

  async function responseData(response: Response): Promise<Record<string, unknown>> {
    return response.json().catch(() => ({}));
  }

  async function loadUsers(statusFilter?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ includeSummary: '1' });
      if (statusFilter) params.set('status', statusFilter);
      const response = await fetch(`/api/admin/users?${params}`, { cache: 'no-store' });
      if (response.status === 401) return void await handleUnauthorized();
      const data = await responseData(response);
      if (response.ok && Array.isArray(data.users)) {
        setUsers(data.users as UserItem[]);
        if (data.summary && typeof data.summary === 'object') {
          setSummary(data.summary as unknown as UserSummary);
        }
      }
      else showToast(typeof data.error === 'string' ? data.error : '加载用户失败', 'error');
    } catch {
      showToast('网络异常，未能刷新用户列表', 'error');
    } finally {
      setLoading(false);
    }
  }

  function refreshUsers() {
    return loadUsers(filter === 'all' ? undefined : filter);
  }

  async function mutateUser(target: UserItem, init: RequestInit) {
    setActionLoading(target.id);
    try {
      const response = await fetch(`/api/admin/users/${target.id}`, init);
      if (response.status === 401) return void await handleUnauthorized();
      const data = await responseData(response);
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : '操作失败');
      await refreshUsers();
      return data;
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作失败', 'error');
      return null;
    } finally {
      setActionLoading(null);
    }
  }

  async function changeStatus(target: UserItem, status: UserStatus) {
    if (target.role !== 'member') {
      setSecureAction({ kind: 'status', target, status });
      return;
    }
    const data = await mutateUser(target, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (data) showToast(status === 'active' ? '审批通过' : '账户状态已更新');
  }

  function openSecureAction(action: SecureAction) {
    setCurrentPassword('');
    setActionReason(
      action.kind === 'reset' && action.target.passwordRecovery
        ? '用户提交密码找回申请，已完成身份核验'
        : '',
    );
    setSecureAction(action);
  }

  async function submitSecureAction() {
    if (!secureAction || !currentPassword) {
      showToast('请输入当前登录账号的密码', 'error');
      return;
    }
    if (actionReason.trim().length < 3) {
      showToast('请填写至少 3 个字的操作原因', 'error');
      return;
    }

    const target = secureAction.target;
    setActionLoading(target.id);
    try {
      const purpose = secureAction.kind === 'reset'
        ? 'admin_password_reset'
        : 'admin_user_management';
      const stepUpResponse = await fetch('/api/auth/step-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: currentPassword, purpose }),
      });
      const stepUpData = await responseData(stepUpResponse);
      if (!stepUpResponse.ok) {
        throw new Error(typeof stepUpData.error === 'string' ? stepUpData.error : '二次认证失败');
      }

      let url = `/api/admin/users/${target.id}`;
      let init: RequestInit;
      if (secureAction.kind === 'reset') {
        url = `/api/admin/users/${target.id}/password-reset`;
        init = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: actionReason.trim(),
            ...(target.passwordRecovery
              ? { recoveryRequestId: target.passwordRecovery.id }
              : {}),
          }),
        };
      } else if (secureAction.kind === 'role') {
        init = {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: secureAction.role, reason: actionReason.trim() }),
        };
      } else if (secureAction.kind === 'status') {
        init = {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: secureAction.status, reason: actionReason.trim() }),
        };
      } else {
        init = { method: 'DELETE' };
      }

      const response = await fetch(url, init);
      if (response.status === 401) return void await handleUnauthorized();
      const data = await responseData(response);
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : '操作失败');

      if (secureAction.kind === 'reset' && typeof data.temporaryPassword === 'string') {
        setTemporaryPassword(data.temporaryPassword);
      } else {
        showToast('安全操作已完成');
      }
      setSecureAction(null);
      setCurrentPassword('');
      setActionReason('');
      await refreshUsers();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作失败', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteMember(target: UserItem) {
    const data = await mutateUser(target, { method: 'DELETE' });
    if (data) {
      showToast('用户已删除');
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-5">
      {secureAction && (
        <Modal onClose={() => !actionLoading && setSecureAction(null)}>
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-[var(--color-primary)]" />
            <h3 className="text-base font-bold text-[var(--color-text)]">确认敏感操作</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-soft)]">
            {secureActionTitle(secureAction)}：{secureAction.target.displayName}（{secureAction.target.username}）
          </p>
          <label className="mt-4 block text-xs font-medium text-[var(--color-text-soft)]">
            当前登录账号密码
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-[var(--color-text-soft)]">
            操作原因
            <textarea
              value={actionReason}
              onChange={(event) => setActionReason(event.target.value)}
              rows={3}
              maxLength={500}
              className="mt-1 w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
            />
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <SecondaryButton onClick={() => setSecureAction(null)}>取消</SecondaryButton>
            <PrimaryButton onClick={() => void submitSecureAction()} disabled={actionLoading === secureAction.target.id}>
              <ShieldCheck size={15} />
              {actionLoading === secureAction.target.id ? '处理中...' : '验证并执行'}
            </PrimaryButton>
          </div>
        </Modal>
      )}

      {temporaryPassword && (
        <Modal onClose={() => setTemporaryPassword('')}>
          <div className="flex items-center gap-2">
            <KeyRound size={20} className="text-[var(--color-primary)]" />
            <h3 className="text-base font-bold text-[var(--color-text)]">一次性临时密码</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-soft)]">
            该密码仅在此处显示一次。用户登录后必须立即设置自己的新密码。
          </p>
          <div className="mt-4 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <code className="min-w-0 flex-1 break-all text-sm text-[var(--color-text)]">{temporaryPassword}</code>
            <button
              type="button"
              title="复制临时密码"
              onClick={() => void navigator.clipboard.writeText(temporaryPassword).then(() => showToast('已复制'))}
              className="shrink-0 p-2 text-[var(--color-primary)]"
            >
              <Copy size={17} />
            </button>
          </div>
          <div className="mt-5 flex justify-end">
            <PrimaryButton onClick={() => setTemporaryPassword('')}>我已妥善记录</PrimaryButton>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal onClose={() => !actionLoading && setDeleteTarget(null)}>
          <div className="flex items-center gap-2">
            <Trash2 size={20} className="text-red-600" />
            <h3 className="text-base font-bold text-[var(--color-text)]">确认删除用户</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-soft)]">
            将永久删除 {deleteTarget.displayName}（{deleteTarget.username}）及其画像、简历、评估和对话数据。此操作不可撤销。
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <SecondaryButton onClick={() => setDeleteTarget(null)}>取消</SecondaryButton>
            <button
              type="button"
              onClick={() => void deleteMember(deleteTarget)}
              disabled={actionLoading === deleteTarget.id}
              className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Trash2 size={15} />
              {actionLoading === deleteTarget.id ? '删除中...' : '确认删除'}
            </button>
          </div>
        </Modal>
      )}

      <header className="page-header">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)]">用户管理</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">审批账户、管理角色并执行可审计的安全操作。</p>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="账户状态筛选">
        {[
          ['all', `全部 · ${summary.all}`],
          ['pending', `待审批 · ${summary.pending}`],
          ['active', `已通过 · ${summary.active}`],
          ['rejected', `已拒绝 · ${summary.rejected}`],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => { setFilter(key); void loadUsers(key === 'all' ? undefined : key); }}
            className={`rounded-[var(--radius-sm)] border px-3 py-1.5 text-xs font-medium ${
              filter === key
                ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-soft)]'
            }`}
          >{label}</button>
        ))}
      </div>

      <div
        data-testid="admin-user-mobile-list"
        className="space-y-3 md:hidden"
      >
        {loading ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-12 text-center text-sm text-[var(--color-muted)]">加载中...</div>
        ) : users.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-12 text-center text-sm text-[var(--color-muted)]">暂无数据</div>
        ) : users.map((user) => {
          const isSelf = user.id === currentUser?.id;
          return (
            <article key={user.id} className="min-w-0 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="break-words font-semibold text-[var(--color-text)]">{user.displayName}</div>
                  <div className="break-all text-xs text-[var(--color-muted)]">{user.username}{isSelf ? ' · 当前账号' : ''}</div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  <Badge>{roleLabel[user.role]}</Badge>
                  <Badge>{statusLabel[user.status]}</Badge>
                </div>
              </div>
              {user.passwordRecovery && (
                <div className="mt-2 text-xs font-medium text-amber-700">
                  密码找回申请 · {formatDate(user.passwordRecovery.requestedAt)}
                </div>
              )}
              <dl className="mt-3 grid min-w-0 grid-cols-1 gap-2 text-xs text-[var(--color-text-soft)] min-[360px]:grid-cols-2">
                <UserDetail label="邮箱" value={user.email || '—'} />
                <UserDetail label="注册时间" value={formatDate(user.createdAt)} />
                <UserDetail label="最近登录" value={user.lastLoginAt ? formatDate(user.lastLoginAt) : '从未登录'} />
              </dl>
              <div className="mt-4 border-t border-[var(--color-divider)] pt-3">
                <UserActions
                  user={user}
                  currentUser={currentUser}
                  actionLoading={actionLoading}
                  changeStatus={changeStatus}
                  openSecureAction={openSecureAction}
                  setDeleteTarget={setDeleteTarget}
                />
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden md:block overflow-x-auto border-y border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr className="bg-[var(--color-bg)] text-left text-xs text-[var(--color-muted)]">
              {['用户', '邮箱', '角色', '状态', '注册时间', '最近登录', '操作'].map((heading) => (
                <th key={heading} className="border-b border-[var(--color-divider)] px-4 py-3 font-semibold">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-[var(--color-muted)]">加载中...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-[var(--color-muted)]">暂无数据</td></tr>
            ) : users.map((user) => {
              const isSelf = user.id === currentUser?.id;
              return (
                <tr key={user.id} className="border-b border-[var(--color-divider)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--color-text)]">{user.displayName}</div>
                    <div className="text-xs text-[var(--color-muted)]">{user.username}{isSelf ? ' · 当前账号' : ''}</div>
                    {user.passwordRecovery && (
                      <div className="mt-1 text-xs font-medium text-amber-700">
                        密码找回申请 · {formatDate(user.passwordRecovery.requestedAt)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-soft)]">{user.email || '—'}</td>
                  <td className="px-4 py-3"><Badge>{roleLabel[user.role]}</Badge></td>
                  <td className="px-4 py-3"><Badge>{statusLabel[user.status]}</Badge></td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-soft)]">{formatDate(user.createdAt)}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-soft)]">{user.lastLoginAt ? formatDate(user.lastLoginAt) : '从未登录'}</td>
                  <td className="px-4 py-3">
                    <UserActions
                      user={user}
                      currentUser={currentUser}
                      actionLoading={actionLoading}
                      changeStatus={changeStatus}
                      openSecureAction={openSecureAction}
                      setDeleteTarget={setDeleteTarget}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className="break-words text-[var(--color-text-soft)]">{value}</dd>
    </div>
  );
}

function UserActions({
  user,
  currentUser,
  actionLoading,
  changeStatus,
  openSecureAction,
  setDeleteTarget,
}: {
  user: UserItem;
  currentUser: CurrentUser | null;
  actionLoading: string | null;
  changeStatus: (target: UserItem, status: UserStatus) => Promise<void>;
  openSecureAction: (action: SecureAction) => void;
  setDeleteTarget: (target: UserItem) => void;
}) {
  const isSelf = user.id === currentUser?.id;
  const privileged = user.role !== 'member';
  const loading = actionLoading === user.id;

  return (
    <div className="flex flex-wrap gap-1.5">
      {user.status !== 'active' && !isSelf && (
        <ActionButton onClick={() => void changeStatus(user, 'active')} loading={loading}>
          <Check size={13} />通过
        </ActionButton>
      )}
      {user.status !== 'rejected' && !isSelf && (
        <ActionButton onClick={() => void changeStatus(user, 'rejected')} loading={loading} danger>
          <X size={13} />拒绝
        </ActionButton>
      )}
      {user.status === 'active' && !isSelf && (
        <ActionButton onClick={() => openSecureAction({ kind: 'reset', target: user })} loading={loading}>
          <KeyRound size={13} />{user.passwordRecovery ? '处理找回' : '重置密码'}
        </ActionButton>
      )}
      {currentUser?.role === 'superadmin' && !isSelf && user.role === 'member' && (
        <>
          <ActionButton onClick={() => openSecureAction({ kind: 'role', target: user, role: 'admin' })} loading={loading}>升为管理员</ActionButton>
          <ActionButton onClick={() => openSecureAction({ kind: 'role', target: user, role: 'superadmin' })} loading={loading}>升为超级管理员</ActionButton>
        </>
      )}
      {currentUser?.role === 'superadmin' && !isSelf && user.role === 'admin' && (
        <>
          <ActionButton onClick={() => openSecureAction({ kind: 'role', target: user, role: 'member' })} loading={loading}>降为成员</ActionButton>
          <ActionButton onClick={() => openSecureAction({ kind: 'role', target: user, role: 'superadmin' })} loading={loading}>升为超级管理员</ActionButton>
        </>
      )}
      {currentUser?.role === 'superadmin' && !isSelf && user.role === 'superadmin' && (
        <ActionButton onClick={() => openSecureAction({ kind: 'role', target: user, role: 'admin' })} loading={loading}>降为管理员</ActionButton>
      )}
      {!isSelf && (
        <ActionButton
          onClick={() => privileged
            ? openSecureAction({ kind: 'delete', target: user })
            : setDeleteTarget(user)}
          loading={loading}
          danger
        >
          <Trash2 size={13} />删除
        </ActionButton>
      )}
    </div>
  );
}

function secureActionTitle(action: SecureAction) {
  if (action.kind === 'reset') {
    return action.target.passwordRecovery
      ? '核验找回申请并生成一次性临时密码'
      : '生成临时密码并强制用户下次登录改密';
  }
  if (action.kind === 'delete') return '永久删除特权账户及其数据';
  if (action.kind === 'status') return `将账户状态改为“${statusLabel[action.status]}”`;
  return `将角色改为“${roleLabel[action.role]}”`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex rounded-full bg-[var(--color-bg)] px-2 py-1 text-xs font-medium text-[var(--color-text-soft)]">{children}</span>;
}

function ActionButton({ children, onClick, loading, danger = false }: {
  children: React.ReactNode;
  onClick: () => void;
  loading: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2 py-1 text-xs font-medium disabled:opacity-50 ${
        danger
          ? 'border-red-200 text-red-700'
          : 'border-[var(--color-border)] text-[var(--color-text-soft)]'
      }`}
    >{loading ? '...' : children}</button>
  );
}

function PrimaryButton({ children, onClick, disabled = false }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return <button type="button" onClick={onClick} disabled={disabled} className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{children}</button>;
}

function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-soft)]">{children}</button>;
}
