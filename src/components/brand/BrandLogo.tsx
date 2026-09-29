type BrandLogoProps = {
  variant?: "full" | "mark";
  size?: "xs" | "sm" | "md" | "lg" | "hero";
  tone?: "auto" | "light" | "dark";
  className?: string;
};

const sizes = {
  xs: { mark: 24, word: "0.98rem", gap: 6 },
  sm: { mark: 32, word: "1.15rem", gap: 8 },
  md: { mark: 42, word: "1.45rem", gap: 10 },
  lg: { mark: 56, word: "1.9rem", gap: 12 },
  hero: { mark: 88, word: "3.4rem", gap: 16 },
} as const;

export default function BrandLogo({
  variant = "full",
  size = "md",
  tone = "auto",
  className = "",
}: BrandLogoProps) {
  const current = sizes[size];

  return (
    <span
      className={`brand-logo brand-logo-${variant} brand-logo-tone-${tone} ${className}`}
      style={{ gap: current.gap }}
      role="img"
      aria-label="纸鸢 Agent"
    >
      <svg
        width={current.mark}
        height={current.mark}
        viewBox="0 0 96 96"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M14 68V25l43 20-17 18z" fill="var(--brand-logo-paper)" stroke="var(--brand-logo-neutral)" strokeWidth="1.5" />
        <path d="M14 25 70 9 42 52 42 35z" fill="var(--brand-logo-coral)" />
        <path d="m14 25 28 10-2 28z" fill="var(--brand-logo-background)" />
        <path d="M14 76c15-12 27-13 39-24 8-7 10-14 17-23" fill="none" stroke="var(--brand-logo-coral)" strokeLinecap="round" strokeWidth="2.5" />
        <circle cx="72" cy="27" r="4" fill="var(--brand-logo-coral)" />
      </svg>
      {variant === "full" && (
        <span className="brand-logo-wordmark" style={{ fontSize: current.word }}>
          <span className="brand-logo-cn">纸鸢</span>
          <span className="brand-logo-en">Agent</span>
        </span>
      )}
    </span>
  );
}
