import type { ReactNode } from "react";

interface HandwritingTitleProps {
  as?: "h1" | "h2" | "h3" | "p";
  children: ReactNode;
  className?: string;
}

/** Display text with handwriting font — the "red pen annotation" voice */
export default function HandwritingTitle({
  as = "h2",
  children,
  className = "",
}: HandwritingTitleProps) {
  const Tag = as;
  const sizes: Record<string, string> = {
    h1: "text-[clamp(2rem,5vw,3.5rem)] leading-tight",
    h2: "text-[1.5rem] leading-[1.3]",
    h3: "text-[1.125rem] leading-[1.4]",
    p: "text-[1rem] leading-[1.6]",
  };

  return (
    <Tag
      className={`font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] ${sizes[as]} ${className}`}
    >
      {children}
    </Tag>
  );
}
