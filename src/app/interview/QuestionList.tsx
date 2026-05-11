"use client";

import { motion } from "framer-motion";
import { Sparkles, AlertTriangle, CheckCircle2, Star, ArrowRight } from "lucide-react";
import { PaperCard, WarmButton } from "@/components/design";
import type { InterviewQuestion } from "@/types";

const CATEGORY_LABELS: Record<string, string> = {
  behavioral: "行为面试",
  technical: "技术/专业",
  "case-study": "案例分析",
  culture: "文化匹配",
};

const CATEGORY_STYLES: Record<string, string> = {
  behavioral: "bg-blue-100 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400",
  technical: "bg-purple-100 text-purple-700 dark:bg-purple-950/20 dark:text-purple-400",
  "case-study": "bg-amber-100 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400",
  culture: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400",
};

interface PracticeInfo {
  practiced: boolean;
  score?: number;
}

interface QuestionListProps {
  questions: InterviewQuestion[];
  practicedMap: Record<string, PracticeInfo>;
  onPractice: (question: InterviewQuestion) => void;
  onRegenerate: () => void;
}

export default function QuestionList({
  questions,
  practicedMap,
  onPractice,
  onRegenerate,
}: QuestionListProps) {
  const totalCount = questions.length;
  const practicedCount = Object.values(practicedMap).filter((p) => p.practiced).length;

  // Count by category
  const catStats: Record<string, { total: number; done: number }> = {};
  for (const q of questions) {
    if (!catStats[q.category]) catStats[q.category] = { total: 0, done: 0 };
    catStats[q.category].total++;
    if (practicedMap[q.question]?.practiced) catStats[q.category].done++;
  }

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] text-lg">
            面试题目
          </h3>
          <span className="text-sm text-[var(--color-muted)]">
            已练习 {practicedCount}/{totalCount} 题
          </span>
        </div>
        <WarmButton variant="ghost" size="sm" onClick={onRegenerate}>
          <Sparkles size={12} className="mr-1" />
          重新生成
        </WarmButton>
      </div>

      {/* Progress by category */}
      <div className="flex gap-3 flex-wrap text-xs text-[var(--color-muted)]">
        {Object.entries(catStats).map(([cat, stats]) => (
          <span key={cat} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${stats.done === stats.total ? "bg-emerald-400" : "bg-[var(--color-divider)]"}`} />
            {CATEGORY_LABELS[cat] || cat} {stats.done}/{stats.total}
          </span>
        ))}
      </div>

      {/* Question cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {questions.map((q, i) => {
          const info = practicedMap[q.question];
          const isPracticed = info?.practiced;
          const isWeakness = q.source === "weakness";

          return (
            <motion.div
              key={`${q.category}-${i}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <PaperCard
                padding="md"
                hover={isPracticed ? undefined : "lift"}
                className={`relative ${isWeakness ? "border-l-2 border-l-amber-400" : ""}`}
              >
                {/* Status badge */}
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      CATEGORY_STYLES[q.category] || "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {CATEGORY_LABELS[q.category] || q.category}
                  </span>
                  {isPracticed ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-600">
                      <CheckCircle2 size={12} />
                      已练习
                      {info.score != null && <span className="font-medium">{info.score.toFixed(1)}</span>}
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--color-muted)]">待练习</span>
                  )}
                </div>

                {/* Question */}
                <p className="text-sm font-medium text-[var(--color-text)] mb-2 line-clamp-3">
                  Q{i + 1}. {q.question}
                </p>

                {/* Context & hint */}
                <p className="text-xs text-[var(--color-muted)] line-clamp-1 mb-1">
                  {q.context}
                </p>

                {/* Weakness note */}
                {isWeakness && q.weaknessNote && (
                  <div className="flex items-start gap-1 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-2 py-1 rounded mb-2">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    <span className="line-clamp-2">{q.weaknessNote}</span>
                  </div>
                )}

                {/* Action button */}
                <button
                  onClick={() => onPractice(q)}
                  className={`mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-all ${
                    isPracticed
                      ? "bg-[var(--color-primary-muted)] text-[var(--color-text-soft)] hover:bg-[var(--color-divider)]"
                      : "bg-[var(--color-primary)] text-white hover:opacity-90"
                  }`}
                >
                  {isPracticed ? (
                    <>
                      <Star size={14} />
                      重新练习
                    </>
                  ) : (
                    <>
                      练习此题
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </PaperCard>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
