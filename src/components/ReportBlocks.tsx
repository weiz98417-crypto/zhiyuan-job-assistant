"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PaperCard, ScoreBadge } from "@/components/design";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import type { EvaluationReport } from "@/types";

const BLOCK_LABELS: Record<string, string> = {
  a: "A · 职位概览",
  b: "B · 简历匹配",
  c: "C · 职级与策略",
  d: "D · 薪资与市场",
  e: "E · 定制化方案",
  f: "F · 面试准备",
  g: "G · 职位合法性",
};

interface ReportBlocksProps {
  report: EvaluationReport;
  expandedByDefault?: boolean;
}

export default function ReportBlocks({ report, expandedByDefault = true }: ReportBlocksProps) {
  const defaultExpanded = new Set(["a", "b", "c", "d", "e", "f", "g"]);
  const [expanded, setExpanded] = useState<Set<string>>(
    expandedByDefault ? defaultExpanded : new Set()
  );

  const toggleBlock = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpanded(next);
  };

  const keys = (["a", "b", "c", "d", "e", "f", "g"] as const).filter(
    (k) => report.blocks[k]
  );

  return (
    <div className="space-y-3">
      {keys.map((key) => {
        const block = report.blocks[key];
        const score = report.scores[key as keyof typeof report.scores];
        const isExpanded = expanded.has(key);

        return (
          <PaperCard key={key} padding="md">
            <button
              onClick={() => toggleBlock(key)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <span className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)]">
                  {BLOCK_LABELS[key]}
                </span>
                {typeof score === "number" && score > 0 && (
                  <ScoreBadge score={score} size="sm" />
                )}
                {key === "b" && typeof score === "number" && score === 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-[var(--color-muted)] dark:bg-gray-800">
                    无简历
                  </span>
                )}
              </div>
              {isExpanded ? (
                <ChevronUp size={16} className="text-[var(--color-muted)]" />
              ) : (
                <ChevronDown size={16} className="text-[var(--color-muted)]" />
              )}
            </button>
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 pt-3 border-t border-[var(--color-divider)] text-sm text-[var(--color-text-soft)] leading-relaxed">
                    <MarkdownRenderer content={block} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </PaperCard>
        );
      })}
    </div>
  );
}
