'use client';

import ParticleCanvas from './ParticleCanvas';

interface AuthHeroProps {
  subtitle: string;
}

export default function AuthHero({ subtitle }: AuthHeroProps) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px',
      overflow: 'hidden',
      minHeight: '100vh',
      borderRight: '1px solid var(--color-border)',
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        opacity: 0.06,
        background: 'repeating-linear-gradient(to bottom, transparent, transparent 27px, oklch(70% 0.01 85) 27px, oklch(70% 0.01 85) 28px)',
      }} />
      <div style={{
        position: 'absolute',
        top: 0,
        left: 56,
        bottom: 0,
        width: 1,
        background: 'oklch(75% 0.04 10 / 0.25)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <div style={inkWash({ top: -100, right: -60, width: 350, height: 350, animation: 'auth-inkPulse1 8s ease-in-out infinite' })} />
      <div style={inkWash({ bottom: -80, left: -40, width: 280, height: 280, opacity: 0.4, animation: 'auth-inkPulse2 10s ease-in-out infinite' })} />
      <div style={inkWash({ top: '40%', left: '20%', width: 200, height: 200, opacity: 0.25, animation: 'auth-inkPulse3 12s ease-in-out infinite' })} />

      <div style={bookmarkStyle({ top: -6, right: 80, width: 30, height: 70, animation: 'auth-bookmarkSway 6s ease-in-out infinite' })} />
      <div style={bookmarkStyle({
        top: -10,
        right: 48,
        width: 26,
        height: 54,
        background: 'linear-gradient(180deg, oklch(90% 0.03 200), oklch(95% 0.02 200))',
        animation: 'auth-bookmarkSway 7s ease-in-out 1s infinite',
      })} />

      {[
        { anim: 'auth-kiteSoar1 14s ease-in-out infinite', top: '28%', left: '4%', w: 48, h: 60, op: 0.3 },
        { anim: 'auth-kiteSoar2 16s ease-in-out 3s infinite', top: '22%', right: '4%', w: 32, h: 40, op: 0.22 },
        { anim: 'auth-kiteSoar3 12s ease-in-out 7s infinite', top: '35%', left: '8%', w: 56, h: 70, op: 0.28 },
        { anim: 'auth-kiteSoar4 18s ease-in-out 5s infinite', top: '30%', right: '8%', w: 38, h: 48, op: 0.25 },
      ].map((kite, index) => (
        <div key={`kite-${index}`} style={{
          position: 'absolute',
          ...(kite.top ? { top: kite.top } : {}),
          ...(kite.left ? { left: kite.left } : {}),
          ...(kite.right ? { right: kite.right } : {}),
          pointerEvents: 'none',
          zIndex: 3,
          animation: kite.anim,
        }}>
          <KiteSvg w={kite.w} h={kite.h} op={kite.op} />
        </div>
      ))}

      <div style={{
        position: 'absolute',
        bottom: '6%',
        right: '3%',
        pointerEvents: 'none',
        zIndex: 3,
        animation: 'auth-kiteRise1 9s ease-in-out infinite',
      }}>
        <KiteSvg w={34} h={42} op={0.22} />
      </div>
      <div style={{
        position: 'absolute',
        bottom: '3%',
        right: '8%',
        pointerEvents: 'none',
        zIndex: 3,
        animation: 'auth-kiteRise2 12s ease-in-out 3s infinite',
      }}>
        <KiteSvg w={44} h={55} op={0.26} />
      </div>

      <ParticleCanvas />

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}>
        <span style={tagStyle({ top: '17%', left: '21%', animation: 'auth-tagEdgeL 9s ease-in-out infinite' })}>AI 评估</span>
        <span style={tagStyle({ top: '18%', right: '19%', animation: 'auth-tagEdgeR 10s ease-in-out 1s infinite' })}>面试教练</span>
        <span style={tagStyle({ top: '45%', left: '18%', animation: 'auth-tagMidL 11s ease-in-out 2s infinite', fontSize: '0.62rem' })}>简历优化</span>
        <span style={tagStyle({ bottom: '26%', left: '23%', animation: 'auth-tagEdgeL 12s ease-in-out 3s infinite' })}>Offer 对比</span>
        <span style={tagStyle({ bottom: '23%', right: '20%', animation: 'auth-tagEdgeR 8s ease-in-out 0.5s infinite', fontSize: '0.62rem' })}>求职画像</span>
      </div>

      <div style={{ position: 'relative', zIndex: 5, textAlign: 'center', maxWidth: 440 }}>
        <div style={{ position: 'relative', marginBottom: 32 }}>
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 100,
            height: 100,
            borderRadius: '50%',
            background: 'radial-gradient(circle, var(--color-primary-muted) 0%, transparent 70%)',
            animation: 'auth-glowPulse 3s ease-in-out infinite',
          }} />
          <svg
            width="80"
            height="80"
            viewBox="0 0 80 80"
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="2"
            style={{
              animation: 'auth-bookFloat 4s ease-in-out infinite',
              filter: 'drop-shadow(0 4px 20px oklch(75% 0.12 75 / 0.2))',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <rect x="16" y="10" width="22" height="60" rx="3" fill="none" />
            <rect x="42" y="10" width="22" height="60" rx="3" fill="none" />
            <line x1="40" y1="14" x2="40" y2="66" strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />
            <line x1="20" y1="28" x2="36" y2="28" strokeWidth="1" opacity="0.5" />
            <line x1="20" y1="36" x2="36" y2="36" strokeWidth="1" opacity="0.5" />
            <line x1="20" y1="44" x2="32" y2="44" strokeWidth="1" opacity="0.5" />
            <line x1="46" y1="32" x2="60" y2="32" strokeWidth="1" opacity="0.5" />
            <line x1="46" y1="40" x2="62" y2="40" strokeWidth="1" opacity="0.5" />
            <line x1="46" y1="48" x2="56" y2="48" strokeWidth="1" opacity="0.5" />
          </svg>
        </div>

        <div style={{
          fontSize: '0.65rem',
          fontWeight: 600,
          color: 'var(--color-muted)',
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}>
          AI &times; Career Journal
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '3.75rem',
          fontWeight: 700,
          color: 'var(--color-text)',
          letterSpacing: '0.04em',
          lineHeight: 1.1,
          marginBottom: 6,
        }}>
          筝筝<span style={{ color: 'var(--color-primary)' }}>纸鸢</span>
        </h1>

        <p style={{
          fontSize: '1rem',
          color: 'var(--color-text-soft)',
          opacity: 0.85,
          position: 'relative',
          zIndex: 1,
        }}>
          {subtitle}
        </p>
      </div>

      <div style={{
        position: 'relative',
        zIndex: 5,
        display: 'flex',
        gap: 40,
        marginTop: 48,
      }}>
        {[
          ['42', '协作报告'],
          ['5', '本周活跃'],
          ['15', '方向覆盖'],
        ].map(([value, label]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.5rem',
              fontWeight: 700,
              color: 'var(--color-primary)',
            }}>{value}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--color-muted)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function inkWash(style: React.CSSProperties): React.CSSProperties {
  return {
    position: 'absolute',
    borderRadius: '50%',
    pointerEvents: 'none',
    zIndex: 0,
    background: 'radial-gradient(circle, var(--color-primary-muted) 0%, transparent 70%)',
    opacity: 0.5,
    ...style,
  };
}

function bookmarkStyle(style: React.CSSProperties): React.CSSProperties {
  return {
    position: 'absolute',
    borderRadius: '0 0 4px 4px',
    pointerEvents: 'none',
    zIndex: 2,
    background: 'linear-gradient(180deg, var(--color-primary-soft), var(--color-primary-muted))',
    boxShadow: '0 1px 2px oklch(50% 0.01 85 / 0.04)',
    ...style,
  };
}

function tagStyle(style: React.CSSProperties): React.CSSProperties {
  return {
    position: 'absolute',
    fontSize: '0.68rem',
    fontWeight: 500,
    color: 'var(--color-primary)',
    padding: '4px 12px',
    borderRadius: 999,
    background: 'var(--color-primary-muted)',
    border: '1px solid var(--color-primary-soft)',
    whiteSpace: 'nowrap',
    ...style,
  };
}

function KiteSvg({ w, h, op }: { w: number; h: number; op: number }) {
  return (
    <svg width={w} height={h} viewBox="0 0 48 60" fill="none" style={{ opacity: op }}>
      <polygon points="24,4 42,30 24,56 6,30" fill="none" stroke="var(--color-primary)" strokeWidth="1.2" />
      <line x1="24" y1="4" x2="24" y2="30" stroke="var(--color-primary)" strokeWidth="0.5" />
      <line x1="6" y1="30" x2="42" y2="30" stroke="var(--color-primary)" strokeWidth="0.5" />
      <path d="M24,56 Q28,62 22,70 Q18,78 24,86" fill="none" stroke="var(--color-primary)" strokeWidth="0.8" />
      <circle cx="22" cy="70" r="2" fill="none" stroke="var(--color-primary)" strokeWidth="0.6" />
      <circle cx="24" cy="82" r="1.5" fill="none" stroke="var(--color-primary)" strokeWidth="0.5" />
    </svg>
  );
}
