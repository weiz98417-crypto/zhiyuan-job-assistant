interface ScoreBadgeProps {
  score: number;
  maxScore?: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export default function ScoreBadge({
  score,
  maxScore = 5,
  size = "md",
  showLabel = true,
}: ScoreBadgeProps) {
  // Color warmth scales with score — warmer = better match
  const warmth =
    score >= 4.5
      ? "bg-[var(--color-primary)] text-[var(--color-surface-raised)]"
      : score >= 4.0
        ? "bg-[var(--color-primary-soft)] text-[var(--color-text)]"
        : score >= 3.5
          ? "bg-[var(--color-primary-muted)] text-[var(--color-text)]"
          : "bg-[var(--color-divider)] text-[var(--color-muted)]";

  const sizes = {
    sm: "text-sm px-2 py-0.5 rounded-[var(--radius-sm)]",
    md: "text-2xl px-4 py-2 rounded-[var(--radius-md)]",
    lg: "text-4xl px-6 py-3 rounded-[var(--radius-lg)]",
  };

  const displayScore = score > 0 ? score.toFixed(1) : "—";

  return (
    <span className={`inline-flex items-baseline gap-1 font-[family-name:var(--font-display)] font-bold ${warmth} ${sizes[size]}`}>
      <span>{displayScore}</span>
      {showLabel && (
        <span className="font-[family-name:var(--font-body)] font-normal opacity-70 text-[0.5em]">
          /{maxScore}
        </span>
      )}
    </span>
  );
}
