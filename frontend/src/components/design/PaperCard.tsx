"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface PaperCardProps {
  children: ReactNode;
  className?: string;
  hover?: "lift" | "none";
  padding?: "sm" | "md" | "lg";
  as?: "div" | "article" | "section";
}

export default function PaperCard({
  children,
  className = "",
  hover = "none",
  padding = "md",
  as: Component = "div",
}: PaperCardProps) {
  const paddings = {
    sm: "p-[var(--space-card-pad)]",
    md: "p-[var(--space-card-pad)]",
    lg: "p-[var(--space-section)]",
  };

  const hoverClass =
    hover === "lift"
      ? "cursor-pointer transition-all duration-[var(--duration-normal)] ease-[var(--ease-out-expo)] hover:-translate-y-0.5 hover:bg-[var(--color-primary-soft)]"
      : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.19, 1, 0.22, 1] }}
    >
      <Component
        className={`bg-[var(--color-surface)] border border-[var(--color-border)] ${paddings[padding]} ${hoverClass} ${className}`}
        style={{ borderRadius: "var(--radius-lg)" }}
      >
        {children}
      </Component>
    </motion.div>
  );
}
