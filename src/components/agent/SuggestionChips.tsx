"use client";

import { ClipboardList, BarChart3, Lightbulb, FileText, FileDown, Compass, MessageCircle } from "lucide-react";

export interface SuggestionChip {
  icon: React.ReactNode;
  label: string;
  prompt: string;
}

const DEFAULT_SUGGESTIONS: SuggestionChip[] = [
  { icon: <Compass size={16} />, label: "自我定位", prompt: "帮我做自我定位" },
  { icon: <BarChart3 size={16} />, label: "评估JD", prompt: "帮我评估一个JD: " },
  { icon: <FileText size={16} />, label: "生成简历", prompt: "根据我的画像生成一份简历" },
  { icon: <Lightbulb size={16} />, label: "推荐岗位", prompt: "根据我的画像推荐几个适合的岗位" },
  { icon: <ClipboardList size={16} />, label: "查投递", prompt: "帮我查一下最近的投递记录" },
  { icon: <MessageCircle size={16} />, label: "模拟面试", prompt: "帮我做一次模拟面试练习" },
  { icon: <FileDown size={16} />, label: "导出报告", prompt: "帮我生成一份求职进展报告并导出" },
];

interface SuggestionChipsProps {
  suggestions?: SuggestionChip[];
  disabled?: boolean;
  onSelect: (prompt: string, label: string) => void;
}

export default function SuggestionChips({
  suggestions = DEFAULT_SUGGESTIONS,
  disabled = false,
  onSelect,
}: SuggestionChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((chip) => (
        <button
          key={chip.label}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(chip.prompt, chip.label)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text-soft)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--color-border)] disabled:hover:text-[var(--color-text-soft)] disabled:hover:bg-[var(--color-surface)]"
        >
          {chip.icon}
          <span>{chip.label}</span>
        </button>
      ))}
    </div>
  );
}

export { DEFAULT_SUGGESTIONS };
