'use client';

import { useState } from 'react';
import { ArrowLeft, KeyRound } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [account, setAccount] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/password/recovery-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account: account.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error || '提交失败，请稍后重试');
        return;
      }
      setMessage(body.message || '密码找回申请已提交。');
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6 py-12">
      <div className="w-full max-w-[420px]">
        <header className="mb-10 text-center">
          <p className="text-[11px] font-semibold uppercase text-[var(--color-muted)]">
            AI &times; Career Journal
          </p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)]">
            筝筝<span className="text-[var(--color-primary)]">纸鸢</span>
          </p>
        </header>

        <section>
          <a
            href="/login"
            className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary)] no-underline"
          >
            <ArrowLeft size={16} />返回登录
          </a>

          <div className="mb-8 flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
              <KeyRound size={19} />
            </div>
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)]">
                找回密码
              </h1>
              <p className="mt-1 text-sm leading-6 text-[var(--color-text-soft)]">
                提交后请联系管理员完成身份核验。管理员会提供一次性临时密码。
              </p>
            </div>
          </div>

          {message ? (
            <div className="border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
              {message}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <label className="block text-sm font-medium text-[var(--color-text)]">
                用户名或邮箱
                <input
                  required
                  autoFocus
                  type="text"
                  autoComplete="username"
                  value={account}
                  onChange={(event) => setAccount(event.target.value)}
                  placeholder="输入注册用户名或邮箱"
                  className="mt-2 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-muted)]"
                />
              </label>

              {error && (
                <p className="border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? '提交中...' : '提交找回申请'}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
