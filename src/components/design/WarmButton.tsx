"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";

interface WarmButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: "primary" | "soft" | "ghost";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
  className?: string;
}

export default function WarmButton({
  variant = "primary",
  size = "md",
  children,
  className = "",
  disabled = false,
  onClick,
  type = "button",
  ...buttonProps
}: WarmButtonProps) {
  const base =
    "inline-flex items-center justify-center font-[family-name:var(--font-body)] font-medium transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:opacity-40 disabled:cursor-not-allowed";

  const variants = {
    primary:
      "bg-[var(--color-primary)] text-[var(--color-surface-raised)] hover:bg-[var(--color-primary-hover)] active:scale-[0.98]",
    soft: "bg-[var(--color-primary-muted)] text-[var(--color-text)] hover:bg-[var(--color-primary-soft)] active:scale-[0.98]",
    ghost:
      "bg-transparent text-[var(--color-text-soft)] hover:bg-[var(--color-primary-muted)] hover:text-[var(--color-text)] active:scale-[0.98]",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm rounded-[var(--radius-sm)]",
    md: "px-5 py-2.5 text-base rounded-[var(--radius-md)]",
    lg: "px-7 py-3.5 text-lg rounded-[var(--radius-lg)]",
  };

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      onClick={onClick}
      type={type}
      {...buttonProps}
    >
      {children}
    </motion.button>
  );
}
