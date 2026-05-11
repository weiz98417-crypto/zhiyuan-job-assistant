"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Loader2, Check, X, RefreshCw, Target, BookOpen, Zap, GitBranch, Hash, Key } from "lucide-react";
import { WarmButton } from "@/components/design";
import type { OptimizeVariant, Operation, AskQuestion } from "@/types";
import { OPERATION_LABELS, EFFORT_LABELS } from "@/types";

interface ReferenceOption {
  id: number;
  name: string;
}

interface OptimizePanelProps {
  sectionId: string;
  sectionContent: string;
  fullCV: Record<string, string>;
  targetJD?: { role: string; company: string; keywords: string[] };
  referenceResumes?: ReferenceOption[];
  roleDirection?: string;
  onSelect: (content: string) => void;
  onClose: () => void;
}

const OPERATION_OPTIONS: { value: Operation; icon: typeof Zap; color: string }[] = [
  { value: "full", icon: Zap, color: "text-violet-500" },
  { value: "star", icon: GitBranch, color: "text-emerald-500" },
  { value: "quantify", icon: Hash, color: "text-amber-500" },
  { value: "keywords", icon: Key, color: "text-blue-500" },
];

const VARIANT_COLORS: Record<string, string> = {
  "定向": "border-l-blue-400 bg-blue-50/50 dark:bg-blue-950/10",
  "通用": "border-l-gray-400 bg-gray-50/50 dark:bg-gray-950/10",
};

export default function OptimizePanel({
  sectionContent,
  sectionId,
  fullCV,
  targetJD,
  referenceResumes,
  roleDirection,
  onSelect,
  onClose,
}: OptimizePanelProps) {
  const [intent, setIntent] = useState("");
  const [operation, setOperation] = useState<Operation>("full");
  const [effort, setEffort] = useState(3);
  const [enablePlaceholders, setEnablePlaceholders] = useState(true);
  const [enableQuestions, setEnableQuestions] = useState(false);
  const [variants, setVariants] = useState<OptimizeVariant[] | null>(null);
  const [selectedRefIds, setSelectedRefIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ask questions flow
  const [askingQuestions, setAskingQuestions] = useState(false);
  const [questions, setQuestions] = useState<AskQuestion[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({});
  const acceptedRef = useRef(false);

  // Auto-select first 3 reference resumes on first load
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (!autoSelectedRef.current && referenceResumes && referenceResumes.length > 0) {
      autoSelectedRef.current = true;
      setSelectedRefIds(referenceResumes.slice(0, 3).map(r => r.id));
    }
  }, [referenceResumes]);

  const recordPreference = async (action: "accept" | "reject", variantType?: string, original?: string, optimized?: string) => {
    try {
      await fetch("/api/cv/record-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_id: sectionId,
          variant_type: variantType || "",
          action,
          operation,
          original_text: original,
          optimized_text: optimized,
        }),
      });
    } catch { /* best effort */ }
  };

  const fetchQuestions = async () => {
    setAskingQuestions(true);
    setError(null);
    try {
      const res = await fetch("/api/cv/optimize-section/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionContent,
          sectionId,
          operation,
          effort,
          targetJD: targetJD || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "追问生成失败");
      }

      const data = await res.json();
      if (!data.success || !data.data?.questions?.length) {
        // Fallback: just generate directly
        await generateVariants();
        return;
      }

      setQuestions(data.data.questions);
    } catch {
      // Fallback to direct generation
      await generateVariants();
    } finally {
      setAskingQuestions(false);
    }
  };

  const handleGenerate = async () => {
    // Open questions mode
    if (enableQuestions && effort >= 4) {
      await fetchQuestions();
      return;
    }
    await generateVariants();
  };

  const generateVariants = async (answers?: { question: string; answer: string }[]) => {
    setLoading(true);
    setError(null);
    setVariants(null);
    setQuestions([]);
    setQuestionAnswers({});

    // Fetch profile from server-side API
    let userProfile;
    try {
      const res = await fetch("/api/data/profile");
      const data = await res.json();
      if (data.success && data.data) {
        const goals = data.data.goals || {};
        userProfile = {
          headline: goals.headline || data.data.data?.headline || "",
          superpowers: goals.superpowers || data.data.data?.superpowers || [],
          targetRoles: (goals.targetRoles || []).map(
            (r: { role?: string; name?: string }) => ({ name: r.role || r.name || "", fit: "primary" })
          ),
        };
      }
    } catch { /* ignore */ }

    try {
      const res = await fetch("/api/cv/optimize-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId,
          sectionContent,
          fullCV,
          intent: intent.trim() || undefined,
          operation,
          effort,
          enablePlaceholders,
          enableQuestions,
          roleDirection: roleDirection || "auto",
          questionAnswers: answers,
          targetJD: targetJD || undefined,
          userProfile,
          referenceIds: selectedRefIds.length > 0 ? selectedRefIds : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "优化失败");
      }

      const data = await res.json();
      if (!data.success || !data.data?.variants?.length) {
        throw new Error(data.error || "AI 未返回有效方案");
      }

      setVariants(data.data.variants);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "未知错误";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitQuestions = () => {
    const answers = questions
      .filter(q => questionAnswers[q.id]?.trim())
      .map(q => ({ question: q.question, answer: questionAnswers[q.id].trim() }));
    generateVariants(answers);
  };

  const hasJD = targetJD && targetJD.role;
  const hasRef = referenceResumes && referenceResumes.length > 0;
  const effortInfo = EFFORT_LABELS[effort] || EFFORT_LABELS[3];

  // Showing questions UI
  if (questions.length > 0 && !loading && !variants) {
    return (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.19, 1, 0.22, 1] }}
        className="overflow-hidden"
      >
        <div className="mt-3 pt-4 border-t border-[var(--color-divider)] space-y-4">
          <div className="p-3 rounded-[var(--radius-sm)] bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-800">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-3">
              📋 为了让优化效果更好，我想了解更多：
            </p>
            <div className="space-y-3">
              {questions.map((q) => (
                <div key={q.id}>
                  <p className="text-xs font-medium text-[var(--color-text-soft)] mb-1.5">
                    {q.id}. {q.question}
                  </p>
                  {q.type === "radio" && q.options ? (
                    <div className="flex flex-wrap gap-1.5">
                      {q.options.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => setQuestionAnswers(prev => ({ ...prev, [q.id]: opt }))}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            questionAnswers[q.id] === opt
                              ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                              : "bg-[var(--color-bg)] border-[var(--color-border)] text-[var(--color-text-soft)] hover:border-[var(--color-primary)]"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={questionAnswers[q.id] || ""}
                      onChange={(e) => setQuestionAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder="输入你的回答..."
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)]"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-amber-200 dark:border-amber-800">
              <WarmButton
                variant="ghost"
                size="sm"
                onClick={() => generateVariants()}
              >
                跳过追问，直接生成
              </WarmButton>
              <WarmButton
                variant="primary"
                size="sm"
                onClick={handleSubmitQuestions}
              >
                提交并生成方案
              </WarmButton>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.19, 1, 0.22, 1] }}
      className="overflow-hidden"
    >
      <div className="mt-3 pt-4 border-t border-[var(--color-divider)] space-y-4">
        {/* Intent input */}
        <div>
          <label className="text-xs font-medium text-[var(--color-text-soft)] mb-1.5 block">
            优化意图（可选）
          </label>
          <input
            type="text"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="如：偏管理方向、强调数据成果、加上STAR结构..."
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>

        {/* Operation buttons */}
        <div>
          <label className="text-xs font-medium text-[var(--color-text-soft)] mb-1.5 block">
            优化方向
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {OPERATION_OPTIONS.map(({ value, icon: Icon, color }) => (
              <button
                key={value}
                onClick={() => {
                  setOperation(value);
                  // Reset questions when switching operation
                  setQuestions([]);
                }}
                className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-[var(--radius-sm)] text-xs transition-all ${
                  operation === value
                    ? "bg-[var(--color-primary)] text-white shadow-sm"
                    : "bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-soft)] hover:border-[var(--color-primary)]"
                }`}
              >
                <Icon size={16} className={operation === value ? "text-white" : color} />
                {OPERATION_LABELS[value]?.shortLabel || value}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-[var(--color-muted)] mt-1">
            {OPERATION_LABELS[operation]?.desc}
          </p>
        </div>

        {/* Effort selector */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-[var(--color-text-soft)]">
              改写强度
            </label>
            <span className="text-xs text-[var(--color-muted)]">
              {effort}/5 · {effortInfo.label}
            </span>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                key={level}
                onClick={() => setEffort(level)}
                className={`flex-1 py-1.5 text-xs rounded-[var(--radius-sm)] transition-all ${
                  effort === level
                    ? "bg-[var(--color-primary)] text-white font-medium shadow-sm"
                    : "bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-soft)] hover:border-[var(--color-primary)]"
                }`}
              >
                {EFFORT_LABELS[level]?.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-[var(--color-muted)] mt-1">
            {effortInfo.desc}
          </p>
        </div>

        {/* Option switches */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-xs text-[var(--color-text-soft)] cursor-pointer">
            <input
              type="checkbox"
              checked={enablePlaceholders}
              onChange={(e) => setEnablePlaceholders(e.target.checked)}
              className="accent-[var(--color-primary)]"
            />
            允许 AI 推断量化数据（用 <span className="bg-amber-200 dark:bg-amber-800 px-1 rounded text-[10px]">[XX]</span> 占位，由我确认）
          </label>
          <label
            className={`flex items-center gap-2 text-xs cursor-pointer ${effort < 4 ? "opacity-40" : ""}`}
            title={effort < 4 ? "Effort 4（大刀）或 5（重写）时可用" : undefined}
          >
            <input
              type="checkbox"
              checked={enableQuestions}
              onChange={(e) => effort >= 4 && setEnableQuestions(e.target.checked)}
              disabled={effort < 4}
              className="accent-[var(--color-primary)]"
            />
            <span className="text-[var(--color-text-soft)]">先追问再优化（AI 先问我几个问题）</span>
            {effort < 4 && (
              <span className="text-[10px] text-[var(--color-muted)]">Effort 4+ 可用</span>
            )}
          </label>
        </div>

        {/* Context cards */}
        <div className="space-y-1.5">
          {hasJD ? (
            <div className="flex items-start gap-2 p-2 rounded-[var(--radius-sm)] bg-blue-50/50 dark:bg-blue-950/10 border border-blue-200 dark:border-blue-800">
              <Target size={14} className="text-blue-500 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs text-[var(--color-text)]">
                  <span className="font-medium">{targetJD!.company}</span> — {targetJD!.role}
                </span>
                <span className="text-[10px] text-[var(--color-muted)] block">
                  影响：优先强化 {targetJD!.keywords?.slice(0, 4).join("、") || "JD 关键词"}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-2 rounded-[var(--radius-sm)] bg-[var(--color-divider)]">
              <Target size={14} className="text-[var(--color-muted)] shrink-0" />
              <span className="text-xs text-[var(--color-muted)]">未选择目标 JD，将进行通用优化</span>
            </div>
          )}

          {hasRef && selectedRefIds.length > 0 ? (
            <div className="flex items-start gap-2 p-2 rounded-[var(--radius-sm)] bg-violet-50/50 dark:bg-violet-950/10 border border-violet-200 dark:border-violet-800">
              <BookOpen size={14} className="text-violet-500 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs text-[var(--color-text)]">
                  参考 {selectedRefIds.length} 份优秀简历的笔法
                </span>
                <span className="text-[10px] text-[var(--color-muted)] block">
                  影响：句式节奏、动词选择、量化密度
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {/* Reference resume selection */}
        {referenceResumes && referenceResumes.length > 0 && (
          <div>
            <label className="text-xs font-medium text-[var(--color-text-soft)] mb-1 flex items-center gap-1">
              <BookOpen size={12} />
              参考笔法（可选，多选）
            </label>
            <div className="space-y-0.5 max-h-20 overflow-y-auto">
              {referenceResumes.map((ref) => (
                <label
                  key={ref.id}
                  className="flex items-center gap-2 text-[10px] text-[var(--color-text-soft)] cursor-pointer hover:bg-[var(--color-divider)] rounded px-1 py-0.5"
                >
                  <input
                    type="checkbox"
                    checked={selectedRefIds.includes(ref.id)}
                    onChange={() => {
                      setSelectedRefIds(prev =>
                        prev.includes(ref.id) ? prev.filter(id => id !== ref.id) : [...prev, ref.id]
                      );
                    }}
                    className="accent-[var(--color-primary)]"
                  />
                  {ref.name}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Generate button */}
        {!variants && (
          <WarmButton
            variant="soft"
            size="sm"
            onClick={handleGenerate}
            disabled={loading || askingQuestions}
            className="w-full"
          >
            {loading || askingQuestions ? (
              <>
                <Loader2 size={14} className="mr-1.5 animate-spin" />
                {askingQuestions ? "生成追问中..." : "AI 优化中..."}
              </>
            ) : (
              <>
                <Sparkles size={14} className="mr-1.5" />
                {enableQuestions && effort >= 4 ? "先追问，再生成方案" : "生成方案"}
              </>
            )}
          </WarmButton>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 rounded-[var(--radius-sm)] bg-red-50 dark:bg-red-950/20 text-sm text-red-600 dark:text-red-400">
            <p>{error}</p>
            <button
              onClick={handleGenerate}
              className="mt-1 text-xs underline hover:no-underline"
            >
              重试
            </button>
          </div>
        )}

        {/* Variants */}
        <AnimatePresence>
          {variants && variants.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
            >
              {variants.map((v) => {
                const isDirected = v.label === "定向" || v.label.includes("定向");
                const colorClass = isDirected ? VARIANT_COLORS["定向"] : VARIANT_COLORS["通用"];
                return (
                  <motion.div
                    key={v.label}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`p-3 rounded-[var(--radius-sm)] border-l-2 ${colorClass}`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        isDirected
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400"
                      }`}>
                        方案 · {v.label}{isDirected && hasJD ? `（针对${targetJD!.role}）` : ""}
                      </span>
                      <span className="text-xs text-[var(--color-muted)]">{v.approach}</span>
                      {(v.placeholderCount ?? 0) > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          {v.placeholderCount} 处建议
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap leading-relaxed mb-2">
                      {v.content}
                    </p>
                    <WarmButton
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        acceptedRef.current = true;
                        recordPreference("accept", v.label, sectionContent, v.content);
                        onSelect(v.content);
                      }}
                    >
                      <Check size={12} className="mr-1" />
                      选用此方案
                    </WarmButton>
                  </motion.div>
                );
              })}

              {/* Footer actions */}
              <div className="flex items-center gap-2 pt-1">
                <WarmButton variant="ghost" size="sm" onClick={() => {
                  if (!acceptedRef.current && variants && variants.length > 0) {
                    const lastVariant = variants[variants.length - 1];
                    recordPreference("reject", lastVariant.label, sectionContent, lastVariant.content);
                  }
                  onClose();
                }}>
                  <X size={12} className="mr-1" />
                  放弃，保留原文
                </WarmButton>
                <WarmButton
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setVariants(null);
                    setError(null);
                    setQuestions([]);
                    setQuestionAnswers({});
                  }}
                >
                  <RefreshCw size={12} className="mr-1" />
                  调整参数重新生成
                </WarmButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
