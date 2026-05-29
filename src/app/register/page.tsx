'use client';

import { useState } from 'react';
import AuthHero from '@/components/auth/AuthHero';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setFieldErrors({});

    const fe: Record<string, boolean> = {};
    if (!username.trim()) fe.username = true;
    if (!displayName.trim()) fe.displayName = true;
    if (!password.trim() || password.length < 6) fe.password = true;

    if (Object.keys(fe).length > 0) {
      setFieldErrors(fe);
      setError('请填写所有必填字段（密码至少6位）');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          displayName: displayName.trim(),
          email: email.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '注册失败'); setLoading(false); return; }
      setSuccess(true);
      setLoading(false);
    } catch {
      setError('网络错误，请稍后重试');
      setLoading(false);
    }
  }

  const inputStyle = (field: string): React.CSSProperties => ({
    width: '100%', padding: '11px 14px', fontSize: '0.9rem',
    color: 'var(--color-text)', background: 'var(--color-surface)',
    border: fieldErrors[field]
      ? '1.5px solid #A85454'
      : '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', outline: 'none',
    fontFamily: 'inherit',
    transition: 'all 0.2s cubic-bezier(0.19, 1, 0.22, 1)',
  });

  const fields = [
    { key: 'username', label: '用户名', value: username, setter: setUsername,
      placeholder: '字母开头，4-20位', autoComplete: 'username', type: 'text' },
    { key: 'displayName', label: '显示名', value: displayName, setter: setDisplayName,
      placeholder: '你的真实姓名或昵称', autoComplete: 'name', type: 'text' },
    { key: 'password', label: '密码', value: password, setter: setPassword,
      placeholder: '至少 6 位', autoComplete: 'new-password', type: 'password' },
    { key: 'email', label: '邮箱', value: email, setter: setEmail,
      placeholder: 'name@company.com', autoComplete: 'email', type: 'email', optional: true },
  ] as const;

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: '100vh',
      fontFamily: 'var(--font-body)',
    }}>
      {/* Left: Hero (same as login) */}
      <AuthHero subtitle="开始你的求职手帳" />

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
            }}>创建账户</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-soft)' }}>
              加入团队，开始协作
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {success ? (
              <div style={{
                padding: '14px 16px', marginBottom: 16,
                borderRadius: 'var(--radius-sm)',
                background: '#EFF8F2', border: '1px solid #B7E4C7',
                borderLeft: '3px solid var(--color-success)',
              }}>
                <p style={{
                  fontSize: '0.85rem', color: 'var(--color-success)', fontWeight: 500, marginBottom: 12,
                }}>
                  注册成功！等待管理员审批后即可登录。
                </p>
                <a href="/login" style={{
                  color: 'var(--color-primary)', fontSize: '0.82rem',
                  fontWeight: 500, textDecoration: 'none',
                }}>&larr; 返回登录</a>
              </div>
            ) : (
              <>
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

                {fields.map((f, i) => (
                  <div key={f.key} style={{ marginBottom: i < fields.length - 1 ? 16 : 24 }}>
                    <label style={{
                      display: 'block', fontSize: '0.8rem', fontWeight: 500,
                      color: 'var(--color-text)', marginBottom: 7,
                    }}>
                      {f.label}
                      {'optional' in f && f.optional && (
                        <span style={{ color: 'var(--color-muted)', fontWeight: 400, fontSize: '0.7rem' }}> — 可选</span>
                      )}
                    </label>
                    <input
                      type={f.type}
                      value={f.value}
                      onChange={(e) => f.setter(e.target.value)}
                      placeholder={f.placeholder}
                      autoComplete={f.autoComplete}
                      style={inputStyle(f.key)}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = fieldErrors[f.key] ? '#A85454' : 'var(--color-primary)';
                        e.currentTarget.style.boxShadow = fieldErrors[f.key]
                          ? '0 0 0 3px #FDF2F2'
                          : '0 0 0 3px var(--color-primary-muted)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = fieldErrors[f.key] ? '#A85454' : 'var(--color-border)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                ))}

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
                  {loading ? '注册中...' : '注 册'}
                </button>

                <div style={{
                  textAlign: 'center', marginTop: 20, fontSize: '0.8rem',
                  color: 'var(--color-muted)',
                }}>
                  已有账户？{' '}
                  <a href="/login" style={{
                    color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500,
                  }}>去登录</a>
                </div>
              </>
            )}
          </form>
        </div>
      </div>

      {/* Keyframe for spinner */}
    </div>
  );
}
