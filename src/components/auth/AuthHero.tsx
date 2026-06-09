'use client';

interface AuthHeroProps {
  subtitle: string;
}

const stats = [
  ['A-G', 'JD 评估'],
  ['44', 'Agent 工具'],
  ['pgvector', '长期记忆'],
];

export default function AuthHero({ subtitle }: AuthHeroProps) {
  return (
    <section style={{
      position: 'relative',
      minHeight: '100vh',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 48,
      background: 'linear-gradient(135deg, var(--color-surface), var(--color-bg))',
      borderRight: '1px solid var(--color-border)',
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: 0.08,
        background: 'repeating-linear-gradient(to bottom, transparent, transparent 27px, var(--color-text) 28px)',
      }} />
      <div style={{
        position: 'absolute',
        top: 64,
        left: 64,
        right: 64,
        bottom: 64,
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 460, textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          marginBottom: 24,
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--color-muted)',
          fontSize: '0.75rem',
          fontWeight: 600,
          background: 'var(--color-bg)',
        }}>
          AI Career Operating System
        </div>
        <h1 style={{
          margin: 0,
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2.5rem, 5vw, 4rem)',
          lineHeight: 1.08,
          fontWeight: 750,
          color: 'var(--color-text)',
          letterSpacing: 0,
        }}>
          筝筝<span style={{ color: 'var(--color-primary)' }}>纸鸢</span>
        </h1>
        <p style={{
          margin: '18px auto 0',
          maxWidth: 360,
          color: 'var(--color-text-soft)',
          fontSize: '1rem',
          lineHeight: 1.7,
        }}>
          {subtitle}
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 12,
          marginTop: 44,
        }}>
          {stats.map(([value, label]) => (
            <div key={label} style={{
              padding: '14px 10px',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-bg)',
            }}>
              <div style={{
                color: 'var(--color-primary)',
                fontWeight: 750,
                fontSize: value.length > 4 ? '0.95rem' : '1.25rem',
                lineHeight: 1.2,
              }}>
                {value}
              </div>
              <div style={{ marginTop: 4, color: 'var(--color-muted)', fontSize: '0.72rem' }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
