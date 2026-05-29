"use client";

import { motion } from "framer-motion";
import { Sparkles, AlertTriangle, Eye, XCircle } from "lucide-react";
import { PaperCard } from "@/components/design";
import Link from "next/link";
import type { RecommendResult } from "@/lib/recommend";

interface RecommendCardProps {
  recommendation: RecommendResult;
  index: number;
  onDismiss: (jdId: number) => void;
  onView?: (jdId: number) => void;
}

export default function RecommendCard({ recommendation, index, onDismiss, onView }: RecommendCardProps) {
  const { jdId, company, role, matchScore, reasons, riskNote, reportId } = recommendation;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.3 }}
      exit={{ opacity: 0, scale: 0.95 }}
      layout
    >
      <PaperCard padding="md" hover="lift">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--color-text)] truncate">
                {company} — {role}
              </p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                评估编号 #{reportId}
              </p>
            </div>
            <div className="flex items-center gap-2 ml-3">
              <span className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-primary)]">
                {matchScore}
              </span>
              <span className="text-xs text-[var(--color-muted)]">分</span>
            </div>
          </div>

          {/* Reasons */}
          {reasons.length > 0 && (
            <ul className="space-y-1">
              {reasons.map((r, i) => (
                <li key={i} className="text-xs text-[var(--color-text-soft)] flex items-start gap-1.5">
                  <Sparkles size={10} className="text-[var(--color-primary)] mt-0.5 shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          )}

          {/* Risk note */}
          {riskNote && (
            <div className="flex items-start gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-[var(--radius-sm)] px-2.5 py-2">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              {riskNote}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Link
              href={`/evaluate/reports?report=${reportId}`}
              onClick={() => onView?.(jdId)}
              className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
            >
              <Eye size={12} />
              查看评估
            </Link>
            <button
              onClick={() => onDismiss(jdId)}
              className="flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text-soft)] transition-colors ml-auto"
            >
              <XCircle size={12} />
              不感兴趣
            </button>
          </div>
        </div>
      </PaperCard>
    </motion.div>
  );
}
