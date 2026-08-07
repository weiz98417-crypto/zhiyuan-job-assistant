'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmation) {
      setError('两次输入的新密码不一致');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/password/change', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error || '密码修改失败');
        return;
      }
      window.location.assign('/login');
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-6">
      <section className="w-full max-w-md border border-[var(--color-border)] bg-[var(--color-surface)] p-8 rounded-[var(--radius-sm)]">
        <div className="flex items-center gap-3 mb-6">
          <KeyRound size={22} />
          <h1 className="text-xl font-semibold">设置新密码</h1>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <PasswordField label="当前或临时密码" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
          <PasswordField label="新密码" value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
          <PasswordField label="确认新密码" value={confirmation} onChange={setConfirmation} autoComplete="new-password" />
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-3 bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] disabled:opacity-50"
          >
            {submitting ? '提交中...' : '修改密码并重新登录'}
          </button>
        </form>
      </section>
    </main>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="block text-sm">
      <span className="block mb-1.5">{label}</span>
      <input
        required
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        className="w-full p-3 border border-[var(--color-border)] bg-[var(--color-bg)] rounded-[var(--radius-sm)]"
      />
    </label>
  );
}
