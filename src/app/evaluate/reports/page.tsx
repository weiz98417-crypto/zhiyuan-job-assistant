"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  FileText,
  ExternalLink,
  Trash2,
  X,
  Filter,
  ArrowUpDown,
} from "lucide-react";
import { WarmButton, PaperCard, ScoreBadge } from "@/components/design";
import { StaggerList, StaggerItem } from "@/components/design/PageTransition";
import ReportBlocks from "@/components/ReportBlocks";
import db from "@/lib/db";
import { clearJDReportId } from "@/lib/jd-storage";
import type { EvaluationReport } from "@/types";

type SortMode = "date-desc" | "date-asc" | "score-desc" | "score-asc";

const SORT_LABELS: Record<SortMode, string> = {
  "date-desc": "最新",
  "date-asc": "最早",
  "score-desc": "评分高→低",
  "score-asc": "评分低→高",
};

const SCORE_FILTERS = [
  { label: "4.5+", min: 4.5 },
  { label: "4.0+", min: 4.0 },
  { label: "3.5+", min: 3.5 },
  { label: "<3.5", min: 0, max: 3.5 },
];

const TIME_FILTERS = [
  { label: "最近 7 天", days: 7 },
  { label: "最近 30 天", days: 30 },
  { label: "全部", days: 0 },
];

function scoreColor(score: number): string {
  if (score >= 4.5) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 4.0) return "text-blue-600 dark:text-blue-400";
  if (score >= 3.5) return "text-yellow-600 dark:text-yellow-400";
  return "text-gray-400";
}

export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<EvaluationReport[]>([]);
  const [search, setSearch] = useState("");
  const [scoreMin, setScoreMin] = useState<number | null>(null);
  const [scoreMax, setScoreMax] = useState<number | null>(null);
  const [timeDays, setTimeDays] = useState<number>(0);
  const [sort, setSort] = useState<SortMode>("date-desc");
  const [selectedReport, setSelectedReport] = useState<EvaluationReport | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<EvaluationReport | null>(null);

  const loadReports = useCallback(async () => {
    try {
      const res = await fetch("/api/data/reports");
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        // Map SQLite snake_case to Dexie camelCase
        const mapped = json.data.map((r: Record<string, unknown>) => ({
          id: r.id,
          reportNum: r.report_num,
          date: r.date,
          company: r.company,
          role: r.role,
          archetype: r.archetype,
          overallScore: r.overall_score,
          legitimacy: r.legitimacy,
          blocks: typeof r.blocks_json === "string" ? JSON.parse(r.blocks_json) : (r.blocks_json || {}),
          keywords: typeof r.keywords_json === "string" ? JSON.parse(r.keywords_json) : (r.keywords_json || []),
          scores: {},
          createdAt: r.created_at ? new Date(r.created_at as string) : new Date(),
        }));
        setReports(mapped as EvaluationReport[]);
        return;
      }
    } catch { /* fallback to DexieDB */ }
    const data = await db.reports.orderBy("createdAt").reverse().toArray();
    setReports(data);
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const filtered = useMemo(() => {
    let result = reports;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (r) =>
          r.company.toLowerCase().includes(q) ||
          r.role.toLowerCase().includes(q) ||
          r.keywords.some((k) => k.toLowerCase().includes(q))
      );
    }
    if (scoreMin != null) {
      result = result.filter((r) => r.overallScore >= scoreMin);
    }
    if (scoreMax != null) {
      result = result.filter((r) => r.overallScore < scoreMax);
    }
    if (timeDays > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - timeDays);
      result = result.filter((r) => new Date(r.date) >= cutoff);
    }
    switch (sort) {
      case "date-desc":
        result.sort((a, b) => b.date.localeCompare(a.date));
        break;
      case "date-asc":
        result.sort((a, b) => a.date.localeCompare(b.date));
        break;
      case "score-desc":
        result.sort((a, b) => b.overallScore - a.overallScore);
        break;
      case "score-asc":
        result.sort((a, b) => a.overallScore - b.overallScore);
        break;
    }
    return result;
  }, [reports, search, scoreMin, scoreMax, timeDays, sort]);

  const handleDelete = async () => {
    if (!deleteConfirm || deleteConfirm.id == null) return;
    const reportId = deleteConfirm.id;
    await db.reports.delete(reportId);

    // Cascade: unset reportId on associated JDs
    const linkedJds = await db.jds.where("reportId").equals(deleteConfirm.reportNum).toArray();
    for (const jd of linkedJds) {
      if (jd.id != null) await clearJDReportId(jd.id);
    }

    setDeleteConfirm(null);
    setSelectedReport(null);
    loadReports();
  };

  const hasFilters = scoreMin != null || scoreMax != null || timeDays > 0;

  return (
    <div className="">
      {/* Header */}
      <div className="mb-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)]">
          评估报告
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          浏览和管理所有评估历史
        </p>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索公司、职位、关键词..."
            className="w-full pl-9 pr-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>
      </div>

      {/* Filter + Sort row */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <span className="text-xs text-[var(--color-muted)] flex items-center gap-1">
          <Filter size={12} /> 评分：
        </span>
        {SCORE_FILTERS.map((f) => {
          const active = scoreMin === f.min && (scoreMax ?? null) === (f.max ?? null);
          return (
            <button
              key={f.label}
              onClick={() => {
                if (active) { setScoreMin(null); setScoreMax(null); }
                else { setScoreMin(f.min); setScoreMax(f.max ?? null); }
              }}
              className={`text-xs px-2 py-1 rounded-full transition-colors ${
                active
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-[var(--color-primary-muted)] text-[var(--color-text-soft)] hover:bg-[var(--color-divider)]"
              }`}
            >
              {f.label}
            </button>
          );
        })}
        <span className="text-[var(--color-divider)]">|</span>
        <span className="text-xs text-[var(--color-muted)] flex items-center gap-1">
          时间：
        </span>
        {TIME_FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setTimeDays(timeDays === f.days ? 0 : f.days)}
            className={`text-xs px-2 py-1 rounded-full transition-colors ${
              timeDays === f.days
                ? "bg-[var(--color-primary)] text-white"
                : "bg-[var(--color-primary-muted)] text-[var(--color-text-soft)] hover:bg-[var(--color-divider)]"
            }`}
          >
            {f.label}
          </button>
        ))}
        {hasFilters && (
          <button
            onClick={() => { setScoreMin(null); setScoreMax(null); setTimeDays(0); }}
            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] underline"
          >
            清除筛选
          </button>
        )}
      </div>

      {/* Sort toggle */}
      <div className="flex items-center gap-1 mb-4">
        <ArrowUpDown size={12} className="text-[var(--color-muted)]" />
        {(["date-desc", "score-desc", "date-asc", "score-asc"] as SortMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setSort(mode)}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              sort === mode
                ? "bg-[var(--color-primary-muted)] text-[var(--color-primary)] font-medium"
                : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {SORT_LABELS[mode]}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-20"
        >
          <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-primary-muted)] flex items-center justify-center mb-4">
            {search || hasFilters ? (
              <Search size={28} className="text-[var(--color-muted)]" />
            ) : (
              <FileText size={28} className="text-[var(--color-muted)]" />
            )}
          </div>
          <p className="text-[var(--color-text)] font-medium mb-2">
            {search || hasFilters
              ? "没有找到匹配的报告"
              : "还没有评估报告"}
          </p>
          <p className="text-sm text-[var(--color-muted)] mb-4">
            {search || hasFilters
              ? "试试其他关键词或清除筛选"
              : "去评估一个职位，生成第一份报告"}
          </p>
          {!search && !hasFilters && (
            <WarmButton variant="soft" size="sm" onClick={() => router.push("/evaluate")}>
              去评估
            </WarmButton>
          )}
        </motion.div>
      )}

      {/* Report Card Grid */}
      <StaggerList className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((report) => (
          <StaggerItem key={report.id}>
            <div onClick={() => setSelectedReport(report)} className="cursor-pointer">
              <PaperCard hover="lift">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[var(--color-text)] truncate">
                      {report.company}
                    </h3>
                    <p className="text-sm text-[var(--color-text-soft)] truncate mt-0.5">
                      {report.role}
                    </p>
                  </div>
                  <ScoreBadge score={report.overallScore} size="sm" />
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-primary-muted)] text-[var(--color-text-soft)]">
                    {report.archetype}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-[var(--color-muted)]">
                  <span>{report.date}</span>
                  <div className="flex items-center gap-1">
                    {report.legitimacy && (
                      <span className={`px-1 py-0.5 rounded ${
                        report.legitimacy.includes("T1") || report.legitimacy.includes("T2")
                          ? "text-emerald-500"
                          : "text-yellow-500"
                      }`}>
                        {report.legitimacy}
                      </span>
                    )}
                  </div>
                </div>
              </PaperCard>
            </div>
          </StaggerItem>
        ))}
      </StaggerList>

      {/* Detail Sheet */}
      <AnimatePresence>
        {selectedReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setSelectedReport(null)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
              className="fixed right-0 top-0 bottom-0 w-full max-w-lg xl:max-w-2xl bg-[var(--color-surface)] border-l border-[var(--color-border)] overflow-y-auto z-50"
            >
              <div className="p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-[var(--color-muted)]">
                      {selectedReport.date} · {selectedReport.archetype}
                    </p>
                    <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--color-text)]">
                      {selectedReport.company} — {selectedReport.role}
                    </h3>
                    <div className="flex items-center gap-3 mt-1">
                      <ScoreBadge score={selectedReport.overallScore} size="md" />
                      <span className="text-xs text-[var(--color-muted)]">
                        {selectedReport.legitimacy}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedReport(null)}
                    className="p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-primary-muted)] text-[var(--color-muted)]"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* A-G Blocks */}
                <ReportBlocks report={selectedReport} />

                {/* Actions */}
                <div className="flex items-center gap-2 pt-6 mt-4 border-t border-[var(--color-divider)]">
                  <WarmButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirm(selectedReport)}
                  >
                    <Trash2 size={12} className="mr-1" />
                    删除报告
                  </WarmButton>
                  <WarmButton
                    variant="soft"
                    size="sm"
                    onClick={() => {
                      setSelectedReport(null);
                      router.push("/evaluate/jds");
                    }}
                  >
                    <ExternalLink size={12} className="mr-1" />
                    查看 JD 库
                  </WarmButton>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-6 max-w-sm mx-4"
            >
              <h4 className="font-semibold text-[var(--color-text)] mb-2">确认删除</h4>
              <p className="text-sm text-[var(--color-text-soft)] mb-4">
                确定删除该评估报告？关联的 JD 记录不受影响，但会解除关联。
              </p>
              <div className="flex items-center gap-2 justify-end">
                <WarmButton variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)}>
                  取消
                </WarmButton>
                <WarmButton variant="primary" size="sm" onClick={handleDelete}>
                  确认删除
                </WarmButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
