"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Search,
  Trash2,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  FileText,
  Tag,
  FilePlus,
} from "lucide-react";
import { PaperCard, WarmButton } from "@/components/design";
import type { PracticeRecord, StarStory } from "@/types";

const CATEGORY_LABELS: Record<string, string> = {
  behavioral: "行为面试",
  technical: "技术/专业",
  "case-study": "案例分析",
  culture: "文化匹配",
};

interface PracticeRecordsProps {
  records: PracticeRecord[];
  stories: StarStory[];
  onRePractice?: (record: PracticeRecord) => void;
  onDeleteRecord: (id: number) => void;
  onConvertToStory?: (record: PracticeRecord) => void;
  onViewStory: (story: StarStory) => void;
  onDeleteStory: (id: number) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

type CombinedItem =
  | { type: "record"; data: PracticeRecord }
  | { type: "story"; data: StarStory };

export default function PracticeRecords({
  records,
  stories,
  onRePractice,
  onDeleteRecord,
  onConvertToStory,
  onViewStory,
  onDeleteStory,
  collapsed = false,
  onToggleCollapse,
}: PracticeRecordsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterSource, setFilterSource] = useState<"all" | "practice" | "manual">("all");

  // Merge and sort items
  const combined: CombinedItem[] = [
    ...records.map((r) => ({ type: "record" as const, data: r })),
    ...stories.map((s) => ({ type: "story" as const, data: s })),
  ].sort((a, b) => {
    const aDate = a.type === "record" ? a.data.createdAt : a.data.createdAt;
    const bDate = b.type === "record" ? b.data.createdAt : b.data.createdAt;
    const aTime = aDate instanceof Date ? aDate.getTime() : 0;
    const bTime = bDate instanceof Date ? bDate.getTime() : 0;
    return bTime - aTime;
  });

  const filtered = combined.filter((item) => {
    // Source filter
    if (filterSource === "practice" && item.type !== "record") return false;
    if (filterSource === "manual" && item.type !== "story") return false;

    // Search filter
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (item.type === "record") {
      const r = item.data;
      return (
        r.question.toLowerCase().includes(q) ||
        r.answer.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q)) ||
        (r.jdCompany ?? "").toLowerCase().includes(q)
      );
    }
    const s = item.data;
    return (
      s.title.toLowerCase().includes(q) ||
      s.situation.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  const header = (
    <div className="flex items-center justify-between">
      <button
        onClick={onToggleCollapse}
        className="flex items-center gap-2 text-[var(--color-text)] hover:text-[var(--color-primary)] transition-colors"
      >
        <BookOpen size={16} />
        <h3 className="font-[family-name:var(--font-display)] font-bold">
          已练列表
        </h3>
        <span className="text-sm text-[var(--color-muted)]">
          ({records.length} 练习 / {stories.length} 故事)
        </span>
        {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
    </div>
  );

  if (collapsed) {
    return (
      <PaperCard padding="sm">
        {header}
      </PaperCard>
    );
  }

  return (
    <PaperCard padding="md">
      <div className="space-y-4">
        {header}

        {/* Search and filter bar */}
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-1.5">
            <Search size={14} className="text-[var(--color-muted)] shrink-0" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索练习记录或故事..."
              className="flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none"
            />
          </div>
          <div className="flex gap-1">
            {([
              { key: "all", label: "全部" },
              { key: "practice", label: "练习记录" },
              { key: "manual", label: "手动故事" },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setFilterSource(opt.key)}
                className={`text-xs px-2.5 py-1 rounded-[var(--radius-sm)] transition-colors ${
                  filterSource === opt.key
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-divider)] text-[var(--color-text-soft)] hover:bg-[var(--color-primary-muted)]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Items list */}
        {filtered.length === 0 ? (
          <div className="text-center py-10">
            <BookOpen size={28} className="mx-auto text-[var(--color-muted)] mb-3" />
            <p className="text-sm text-[var(--color-muted)]">
              {searchQuery
                ? "没有匹配的结果"
                : "还没有练习记录或故事。完成练习后会自动出现在这里"}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[480px] overflow-y-auto">
            {filtered.map((item) => {
              if (item.type === "record") {
                const r = item.data;
                const itemId = `record-${r.id ?? r.question}`;
                const isExpanded = expandedId === itemId;
                return (
                  <div
                    key={itemId}
                    className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden"
                  >
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : itemId)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedId(isExpanded ? null : itemId); } }}
                      role="button"
                      tabIndex={0}
                      className="w-full text-left p-3 flex items-start justify-between gap-3 hover:bg-[var(--color-primary-muted)] transition-colors cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-[var(--color-primary-muted)] text-[var(--color-text-soft)]">
                            <MessageSquare size={10} />
                            练习
                          </span>
                          {r.questionCategory && (
                            <span className="text-xs text-[var(--color-muted)]">
                              {CATEGORY_LABELS[r.questionCategory] || r.questionCategory}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[var(--color-text)] line-clamp-1">
                          {r.question}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-[var(--color-muted)]">
                          {r.score != null && (
                            <span className="font-medium text-[var(--color-primary)]">
                              {r.score.toFixed(1)} 分
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {r.createdAt instanceof Date
                              ? r.createdAt.toLocaleDateString("zh-CN")
                              : new Date(r.createdAt).toLocaleDateString("zh-CN")}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {onRePractice && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRePractice(r);
                            }}
                            className="p-1 text-[var(--color-muted)] hover:text-[var(--color-primary)] transition-colors"
                            title="重新练习"
                          >
                            <RefreshCw size={14} />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (r.id != null) onDeleteRecord(r.id);
                          }}
                          className="p-1 text-[var(--color-muted)] hover:text-red-400 transition-colors"
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 border-t border-[var(--color-divider)] pt-3">
                            <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap leading-relaxed">
                              {r.answer || "(无回答内容)"}
                            </p>
                            {(r.jdCompany || r.jdRole) && (
                              <p className="text-xs text-[var(--color-muted)] mt-2">
                                关联：{r.jdCompany}{r.jdRole ? ` — ${r.jdRole}` : ""}
                              </p>
                            )}
                            {r.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {r.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-primary-muted)] text-[var(--color-text-soft)]"
                                  >
                                    <Tag size={10} className="mr-1 inline" />
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            {onConvertToStory && (
                              <div className="mt-3">
                                <WarmButton
                                  variant="soft"
                                  size="sm"
                                  onClick={() => onConvertToStory(r)}
                                >
                                  <FilePlus size={14} className="mr-1" />
                                  转为 STAR 故事
                                </WarmButton>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              }

              // Manual STAR story
              const s = item.data;
              const itemId = `story-${s.id ?? s.title}`;
              const isExpanded = expandedId === itemId;
              return (
                <div
                  key={itemId}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden"
                >
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : itemId)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedId(isExpanded ? null : itemId); } }}
                    role="button"
                    tabIndex={0}
                    className="w-full text-left p-3 flex items-start justify-between gap-3 hover:bg-[var(--color-primary-muted)] transition-colors cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-[var(--color-divider)] text-[var(--color-text-soft)]">
                          <FileText size={10} />
                          手动
                        </span>
                      </div>
                      <p className="text-sm font-medium text-[var(--color-text)] line-clamp-1">
                        {s.title}
                      </p>
                      <p className="text-xs text-[var(--color-muted)] line-clamp-1 mt-0.5">
                        {s.situation}
                      </p>
                      {s.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {s.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="text-xs text-[var(--color-muted)]">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewStory(s);
                        }}
                        className="p-1 text-[var(--color-muted)] hover:text-[var(--color-primary)] transition-colors"
                        title="查看详情"
                      >
                        <RefreshCw size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (s.id != null) onDeleteStory(s.id);
                        }}
                        className="p-1 text-[var(--color-muted)] hover:text-red-400 transition-colors"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 pb-3 border-t border-[var(--color-divider)] pt-3 space-y-2">
                          {([
                            { key: "situation", label: "情境" },
                            { key: "task", label: "任务" },
                            { key: "action", label: "行动" },
                            { key: "result", label: "结果" },
                            { key: "reflection", label: "反思" },
                          ] as { key: keyof StarStory; label: string }[]).map(({ key, label }) => {
                            const val = s[key];
                            if (typeof val !== "string" || !val.trim()) return null;
                            return (
                              <div key={key}>
                                <p className="text-xs font-medium text-[var(--color-primary)] mb-0.5">
                                  {label}
                                </p>
                                <p className="text-sm text-[var(--color-text)]">{val}</p>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PaperCard>
  );
}
