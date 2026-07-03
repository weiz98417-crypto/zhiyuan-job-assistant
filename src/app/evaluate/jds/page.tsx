"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Clipboard,
  Image,
  Link,
  FileText,
  ExternalLink,
  Trash2,
  Pencil,
  X,
  Bookmark,
  Filter,
  Sparkles,
  ArrowRight,
  Download,
} from "lucide-react";
import { WarmButton, PaperCard } from "@/components/design";
import { StaggerList, StaggerItem } from "@/components/design/PageTransition";
import {
  deleteJD,
  updateJD,
} from "@/lib/jd-storage";
import type { JDRecord, JDSourceType } from "@/types";

const SOURCE_ICONS: Record<JDSourceType, typeof Clipboard> = {
  paste: Clipboard,
  ocr: Image,
  url: Link,
  agent: Clipboard,
  discovery: Search,
};

const SOURCE_LABELS: Record<JDSourceType, string> = {
  paste: "粘贴",
  ocr: "OCR 识别",
  url: "链接",
  agent: "Agent",
  discovery: "岗位发现",
};

function truncateBody(body: string, maxLen = 200): string {
  if (body.length <= maxLen) return body;
  return body.slice(0, maxLen) + "...";
}

export default function JDLibraryPage() {
  const router = useRouter();
  const [jds, setJDs] = useState<JDRecord[]>([]);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<JDSourceType | null>(null);
  const [reportFilter, setReportFilter] = useState<"hasReport" | "noReport" | null>(null);
  const [selectedJD, setSelectedJD] = useState<JDRecord | null>(null);
  const [editingJD, setEditingJD] = useState<JDRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<JDRecord | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadJDs = useCallback(async () => {
    try {
      setLoadError(false);
      const res = await fetch("/api/data/jds", { cache: "no-store" });
      if (!res.ok) throw new Error("server load failed");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setJDs(json.data);
        return;
      }
      throw new Error("server response failed");
    } catch {
      setLoadError(true);
      setJDs([]);
    }
  }, []);

  useEffect(() => {
    loadJDs();
  }, [loadJDs]);

  const filtered = useMemo(() => {
    let result = jds;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((jd) =>
        jd.company.toLowerCase().includes(q) ||
        jd.role.toLowerCase().includes(q) ||
        jd.body.toLowerCase().includes(q) ||
        jd.keywords.some((kw) => kw.toLowerCase().includes(q))
      );
    }
    if (sourceFilter) {
      result = result.filter((jd) => jd.sourceType === sourceFilter);
    }
    if (reportFilter === "hasReport") {
      result = result.filter((jd) => jd.reportId != null);
    } else if (reportFilter === "noReport") {
      result = result.filter((jd) => jd.reportId == null);
    }
    return result;
  }, [jds, search, sourceFilter, reportFilter]);

  const handleDelete = async () => {
    if (!deleteConfirm || deleteConfirm.id == null) return;
    try {
      const res = await fetch(`/api/data/jds?id=${deleteConfirm.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("server delete failed");
      await deleteJD(deleteConfirm.id).catch(() => {});
    } catch {
      setLoadError(true);
      return;
    }
    setDeleteConfirm(null);
    setSelectedJD(null);
    loadJDs();
  };

  const handleSaveEdit = async () => {
    if (!editingJD || editingJD.id == null) return;
    const res = await fetch("/api/data/jds", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingJD.id,
        company: editingJD.company,
        role: editingJD.role,
        body: editingJD.body,
      }),
    });
    if (!res.ok) {
      setLoadError(true);
      return;
    }
    await updateJD(editingJD.id, {
      company: editingJD.company,
      role: editingJD.role,
      body: editingJD.body,
    }).catch(() => {});
    setEditingJD(null);
    setSelectedJD(null);
    loadJDs();
  };

  const hasFilters = sourceFilter || reportFilter;

  if (loadError) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-text-soft)]">
        服务器数据加载失败，请稍后重试。
      </div>
    );
  }

  return (
    <div className="">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)]">
            JD 库
          </h2>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            管理所有录入的职位描述
          </p>
        </div>
        <WarmButton variant="primary" size="sm" onClick={() => router.push("/evaluate")}>
          <Sparkles size={14} className="mr-1.5" />
          快速评估
          <ArrowRight size={14} className="ml-1" />
        </WarmButton>
      </div>

      {/* Search + Filters */}
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

      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <span className="text-xs text-[var(--color-muted)] flex items-center gap-1">
          <Filter size={12} /> 筛选：
        </span>
        {(["paste", "ocr", "url", "agent", "discovery"] as JDSourceType[]).map((type) => (
          <button
            key={type}
            onClick={() => setSourceFilter(sourceFilter === type ? null : type)}
            className={`text-xs px-2 py-1 rounded-full transition-colors ${
              sourceFilter === type
                ? "bg-[var(--color-primary)] text-white"
                : "bg-[var(--color-primary-muted)] text-[var(--color-text-soft)] hover:bg-[var(--color-divider)]"
            }`}
          >
            {SOURCE_LABELS[type]}
          </button>
        ))}
        <span className="text-[var(--color-divider)]">|</span>
        <button
          onClick={() => setReportFilter(reportFilter === "hasReport" ? null : "hasReport")}
          className={`text-xs px-2 py-1 rounded-full transition-colors ${
            reportFilter === "hasReport"
              ? "bg-[var(--color-primary)] text-white"
              : "bg-[var(--color-primary-muted)] text-[var(--color-text-soft)] hover:bg-[var(--color-divider)]"
          }`}
        >
          有报告
        </button>
        <button
          onClick={() => setReportFilter(reportFilter === "noReport" ? null : "noReport")}
          className={`text-xs px-2 py-1 rounded-full transition-colors ${
            reportFilter === "noReport"
              ? "bg-[var(--color-primary)] text-white"
              : "bg-[var(--color-primary-muted)] text-[var(--color-text-soft)] hover:bg-[var(--color-divider)]"
          }`}
        >
          无报告
        </button>
        {hasFilters && (
          <button
            onClick={() => { setSourceFilter(null); setReportFilter(null); }}
            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] underline"
          >
            清除筛选
          </button>
        )}
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
              <Bookmark size={28} className="text-[var(--color-muted)]" />
            )}
          </div>
          <p className="text-[var(--color-text)] font-medium mb-2">
            {search || hasFilters
              ? "没有找到匹配的 JD"
              : "还没有 JD 记录"}
          </p>
          <p className="text-sm text-[var(--color-muted)] mb-4">
            {search || hasFilters
              ? "试试其他关键词或清除筛选"
              : "去评估一个职位，然后保存到 JD 库"}
          </p>
          {!search && !hasFilters && (
            <WarmButton variant="soft" size="sm" onClick={() => router.push("/evaluate")}>
              去评估
            </WarmButton>
          )}
        </motion.div>
      )}

      {/* JD Card Grid */}
      <StaggerList className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((jd) => {
          const SourceIcon = SOURCE_ICONS[jd.sourceType];
          return (
            <StaggerItem key={jd.id}>
              <div onClick={() => setSelectedJD(jd)} className="cursor-pointer">
                <PaperCard hover="lift">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[var(--color-text)] truncate">
                      {jd.company || "未知公司"}
                    </h3>
                    <p className="text-sm text-[var(--color-text-soft)] truncate mt-0.5">
                      {jd.role || "未知职位"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm(jd);
                      }}
                      className="p-1 rounded-[var(--radius-sm)] text-[var(--color-muted)] hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20"
                      title="删除 JD"
                    >
                      <Trash2 size={13} />
                    </button>
                    {jd.reportId != null && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400">
                        已评估
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-[var(--color-muted)] leading-relaxed line-clamp-3 mb-2">
                  {truncateBody(jd.body)}
                </p>
                <div className="flex items-center justify-between text-[10px] text-[var(--color-muted)]">
                  <span className="flex items-center gap-1">
                    <SourceIcon size={10} />
                    {SOURCE_LABELS[jd.sourceType]}
                  </span>
                  <span>{new Date(jd.createdAt).toLocaleDateString("zh-CN")}</span>
                </div>
              </PaperCard>
              </div>
            </StaggerItem>
          );
        })}
      </StaggerList>

      {/* Detail / Edit Sheet */}
      <AnimatePresence>
        {selectedJD && !editingJD && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setSelectedJD(null)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
              className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-[var(--color-surface)] border-l border-[var(--color-border)] overflow-y-auto z-50"
            >
              <div className="p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--color-text)]">
                    JD 详情
                  </h3>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setDeleteConfirm(selectedJD)}
                      className="p-1.5 rounded-[var(--radius-sm)] hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20 text-[var(--color-muted)]"
                      title="删除 JD"
                    >
                      <Trash2 size={17} />
                    </button>
                    <button
                      onClick={() => setSelectedJD(null)}
                      className="p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-primary-muted)] text-[var(--color-muted)]"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Source badge + date */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-primary-muted)] text-[var(--color-text-soft)] flex items-center gap-1">
                    {(() => {
                      const SourceIcon = SOURCE_ICONS[selectedJD.sourceType];
                      return <SourceIcon size={10} />;
                    })()}
                    {SOURCE_LABELS[selectedJD.sourceType]}
                  </span>
                  {selectedJD.sourceUrl && (
                    <a
                      href={selectedJD.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                    >
                      <ExternalLink size={10} /> 来源链接
                    </a>
                  )}
                  {selectedJD.reportId != null && (
                    <a
                      href={`/api/reports/${selectedJD.reportId}/pdf`}
                      download
                      className="text-xs px-2 py-0.5 rounded bg-[var(--color-primary)] text-white hover:opacity-90 flex items-center gap-1"
                    >
                      <Download size={10} /> 下载 PDF
                    </a>
                  )}
                  {selectedJD.reportId != null && (
                    <button
                      onClick={() => {
                        setSelectedJD(null);
                        router.push("/evaluate/reports");
                      }}
                      className="text-xs px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      <ExternalLink size={10} /> 查看评估报告
                    </button>
                  )}
                </div>

                {/* Fields */}
                <div className="space-y-3 mb-6">
                  <div>
                    <label className="text-[10px] font-medium text-[var(--color-muted)] uppercase">公司</label>
                    <p className="text-sm text-[var(--color-text)]">{selectedJD.company || "—"}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-[var(--color-muted)] uppercase">职位</label>
                    <p className="text-sm text-[var(--color-text)]">{selectedJD.role || "—"}</p>
                  </div>
                  {selectedJD.keywords.length > 0 && (
                    <div>
                      <label className="text-[10px] font-medium text-[var(--color-muted)] uppercase">关键词</label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedJD.keywords.map((kw) => (
                          <span key={kw} className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-primary-muted)] text-[var(--color-text-soft)]">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--color-muted)] uppercase">JD 正文</label>
                    <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap leading-relaxed mt-1 max-h-64 overflow-y-auto bg-[var(--color-bg)] rounded-[var(--radius-sm)] p-3">
                      {selectedJD.body || "—"}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-4 border-t border-[var(--color-divider)]">
                  <WarmButton
                    variant="soft"
                    size="sm"
                    onClick={() => setEditingJD({ ...selectedJD })}
                  >
                    <Pencil size={12} className="mr-1" />
                    编辑
                  </WarmButton>
                  <WarmButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirm(selectedJD)}
                  >
                    <Trash2 size={12} className="mr-1" />
                    删除
                  </WarmButton>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Sheet */}
      <AnimatePresence>
        {editingJD && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setEditingJD(null)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
              className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-[var(--color-surface)] border-l border-[var(--color-border)] overflow-y-auto z-50"
            >
              <div className="p-6">
                <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--color-text)] mb-4">
                  编辑 JD
                </h3>
                <div className="space-y-3 mb-6">
                  <div>
                    <label className="text-xs font-medium text-[var(--color-text-soft)] block mb-1">
                      公司名
                    </label>
                    <input
                      type="text"
                      value={editingJD.company}
                      onChange={(e) => setEditingJD({ ...editingJD, company: e.target.value })}
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--color-text-soft)] block mb-1">
                      职位名
                    </label>
                    <input
                      type="text"
                      value={editingJD.role}
                      onChange={(e) => setEditingJD({ ...editingJD, role: e.target.value })}
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--color-text-soft)] block mb-1">
                      JD 正文
                    </label>
                    <textarea
                      value={editingJD.body}
                      onChange={(e) => setEditingJD({ ...editingJD, body: e.target.value })}
                      rows={12}
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] resize-none"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-4 border-t border-[var(--color-divider)]">
                  <WarmButton variant="primary" size="sm" onClick={handleSaveEdit}>
                    保存
                  </WarmButton>
                  <WarmButton variant="ghost" size="sm" onClick={() => setEditingJD(null)}>
                    取消
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
                确定删除该 JD 记录？关联的报告不受影响。
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
