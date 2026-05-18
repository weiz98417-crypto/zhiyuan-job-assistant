'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthHero from '@/components/auth/AuthHero';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!username.trim()) { setError('请输入用户名'); return; }
    if (!password.trim()) { setError('请输入密码'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '登录失败'); setLoading(false); return; }
      router.push('/');
      router.refresh();
    } catch {
      setError('网络错误，请稍后重试');
      setLoading(false);
    }
  }

  const inputStyle = (isError: boolean): React.CSSProperties => ({
    width: '100%', padding: '11px 14px', fontSize: '0.9rem',
    color: 'var(--color-text)', background: 'var(--color-surface)',
    border: isError ? '1.5px solid #A85454' : '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', outline: 'none',
    fontFamily: 'inherit',
    transition: 'all 0.2s cubic-bezier(0.19, 1, 0.22, 1)',
  });

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: '100vh',
      fontFamily: 'var(--font-body)',
    }}>
      {/* Left: Hero with particles, kites, ink washes */}
      <AuthHero subtitle="翻开这一页，写你的下一个篇章" />

      {/* Right: Form */}
      <div style={{
        background: 'var(--color-bg)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 48,
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ marginBottom: 32 }}>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: '1.6rem',
              fontWeight: 700, color: 'var(--color-text)', marginBottom: 4,
            }}>欢迎回来</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-soft)' }}>
              登录你的求职手帳
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                padding: '12px 16px', marginBottom: 20,
                borderRadius: 'var(--radius-sm)',
                background: '#FDF2F2', border: '1px solid #F5C6C6',
                borderLeft: '3px solid #A85454',
                fontSize: '0.82rem', color: '#A85454',
                fontWeight: 500,
              }}>{error}</div>
            )}

            <div style={{ marginBottom: 18 }}>
              <label style={{
                display: 'block', fontSize: '0.8rem', fontWeight: 500,
                color: 'var(--color-text)', marginBottom: 7,
              }}>用户名</label>
              <input
                type="text" value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="输入用户名"
                autoComplete="username"
                style={inputStyle(!!error)}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-muted)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = error ? '#A85454' : 'var(--color-border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{
                display: 'block', fontSize: '0.8rem', fontWeight: 500,
                color: 'var(--color-text)', marginBottom: 7,
              }}>密码</label>
              <input
                type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码"
                autoComplete="current-password"
                style={inputStyle(!!error)}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-muted)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = error ? '#A85454' : 'var(--color-border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '13px 24px',
                background: 'var(--color-primary)', color: '#fff',
                border: 'none', borderRadius: 'var(--radius-sm)',
                fontSize: '0.92rem', fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                fontFamily: 'inherit', letterSpacing: '0.04em',
                boxShadow: '0 1px 2px oklch(50% 0.01 85 / 0.04)',
                transition: 'all 0.2s cubic-bezier(0.19, 1, 0.22, 1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = 'var(--color-primary-hover)';
                  e.currentTarget.style.boxShadow = '0 2px 8px oklch(50% 0.01 85 / 0.06)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--color-primary)';
                e.currentTarget.style.boxShadow = '0 1px 2px oklch(50% 0.01 85 / 0.04)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              {loading ? (
                <span style={{
                  width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff', borderRadius: '50%',
                  animation: 'auth-spin 0.6s linear infinite', display: 'inline-block',
                }} />
              ) : null}
              {loading ? '登录中...' : '登 录'}
            </button>

            <div style={{
              textAlign: 'center', marginTop: 20, fontSize: '0.8rem',
              color: 'var(--color-muted)',
            }}>
              还没有账户？{' '}
              <a href="/register" style={{
                color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500,
              }}>立即注册</a>
            </div>
          </form>
        </div>
      </div>

      {/* Keyframe for spinner */}
    </div>
  );
}
