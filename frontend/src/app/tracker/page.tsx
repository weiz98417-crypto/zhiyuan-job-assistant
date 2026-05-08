"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Filter,
  ArrowUpDown,
  Grid3X3,
  List,
  Layers,
  Download,
  ChevronDown,
  X,
  Calendar,
  Info,
  ExternalLink,
  GripVertical,
} from "lucide-react";
import {
  HandwritingTitle,
  WarmButton,
  PaperCard,
  ScoreBadge,
  StatusTag,
} from "@/components/design";
import { StaggerList, StaggerItem } from "@/components/design/PageTransition";
import db from "@/lib/db";
import { exportApplicationsMD, downloadAsFile } from "@/lib/exporters";
import type { Application, ApplicationStatus, InterviewRound } from "@/types";
import { STATUS_LABELS, STATUS_ORDER } from "@/types";

type ViewMode = "list" | "grouped" | "kanban";

export default function TrackerPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"date" | "score" | "company">("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [mounted, setMounted] = useState(false);
  const [detailApp, setDetailApp] = useState<Application | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<ApplicationStatus | null>(null);
  const [showInterviewModal, setShowInterviewModal] = useState<Application | null>(null);
  const [interviewForm, setInterviewForm] = useState<InterviewRound>({
    round: 1,
    date: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const apps = await db.applications.toArray();
    setApplications(apps);
    setMounted(true);
  }

  const filtered = applications
    .filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          a.company.toLowerCase().includes(q) ||
          a.role.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") cmp = a.date.localeCompare(b.date);
      else if (sortBy === "score") cmp = a.score - b.score;
      else if (sortBy === "company") cmp = a.company.localeCompare(b.company, "zh");
      return sortAsc ? cmp : -cmp;
    });

  const grouped = STATUS_ORDER.map((status) => ({
    status,
    apps: filtered.filter((a) => a.status === status),
  })).filter((g) => g.apps.length > 0);

  const kanbanColumns = STATUS_ORDER.map((status) => ({
    status,
    apps: filtered.filter((a) => a.status === status),
    count: filtered.filter((a) => a.status === status).length,
  }));

  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const updateStatus = async (app: Application, status: ApplicationStatus) => {
    const updates: Partial<Application> = { status, updatedAt: new Date() };
    // If moving to interview, auto-add interview round
    if (status === "interview" && (!app.interviews || app.interviews.length === 0)) {
      setShowInterviewModal({ ...app, status: "interview" });
      return;
    }
    await db.applications.update(app.id!, updates);
    if (detailApp && detailApp.id === app.id) {
      setDetailApp({ ...detailApp, ...updates });
    }
    loadData();
  };

  const saveInterview = async () => {
    if (!showInterviewModal) return;
    const app = showInterviewModal;
    const interviews = [...(app.interviews || []), { ...interviewForm }];
    await db.applications.update(app.id!, {
      status: "interview" as ApplicationStatus,
      interviews,
      updatedAt: new Date(),
    });
    setShowInterviewModal(null);
    loadData();
  };

  const addInterviewRound = async (app: Application) => {
    if (!app.interviews || app.interviews.length === 0) {
      setShowInterviewModal(app);
      return;
    }
    const nextRound = (app.interviews[app.interviews.length - 1]?.round || 0) + 1;
    setShowInterviewModal(app);
    setInterviewForm({
      round: nextRound,
      date: new Date().toISOString().slice(0, 10),
    });
  };

  /* ── Drag & Drop (Kanban) ── */
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, app: Application) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ id: app.id }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, status: ApplicationStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStatus(status);
  };

  const handleDragLeave = () => {
    setDragOverStatus(null);
  };

  const handleDrop = async (e: React.DragEvent, status: ApplicationStatus) => {
    e.preventDefault();
    setDragOverStatus(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      const app = applications.find((a) => a.id === data.id);
      if (app && app.status !== status) {
        await updateStatus(app, status);
      }
    } catch {
      // Invalid drag data
    }
  };

  const exportSelected = () => {
    const selectedApps = applications.filter((a) => selected.has(a.id!));
    const md = exportApplicationsMD(selectedApps);
    downloadAsFile(md, "applications.md");
  };

  const exportAll = () => {
    const md = exportApplicationsMD(filtered);
    downloadAsFile(md, "applications.md");
  };

  /* ── Loading skeleton ── */
  if (!mounted) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-[var(--color-divider)] rounded w-40" />
        <div className="h-64 bg-[var(--color-divider)] rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  /* ── Empty State ── */
  if (applications.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-primary-muted)] flex items-center justify-center">
          <Layers size={24} className="text-[var(--color-primary)]" />
        </div>
        <div>
          <HandwritingTitle as="h2">还没有投递记录</HandwritingTitle>
          <p className="text-[var(--color-muted)] text-sm mt-2">
            评估完 JD 后，点击"加入追踪"——你的投递记录会出现在这里
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-[var(--color-muted)] text-sm mb-1">
            {applications.length} 条投递记录
          </p>
          <HandwritingTitle as="h1">投递追踪</HandwritingTitle>
        </div>
        <div className="flex gap-2">
          <WarmButton variant="ghost" size="sm" onClick={exportAll}>
            <Download size={16} className="mr-1.5" />
            导出全部
          </WarmButton>
          {selected.size > 0 && (
            <WarmButton variant="ghost" size="sm" onClick={exportSelected}>
              <Download size={16} className="mr-1.5" />
              导出已选 ({selected.size})
            </WarmButton>
          )}
        </div>
      </div>

      {/* Filters */}
      <PaperCard padding="sm">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Search size={16} className="text-[var(--color-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索公司或岗位..."
              className="flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")}>
                <X size={14} className="text-[var(--color-muted)]" />
              </button>
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ApplicationStatus | "all")}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:outline-none"
          >
            <option value="all">全部状态</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>

          <button
            onClick={() => setSortAsc(!sortAsc)}
            className="flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            <ArrowUpDown size={14} />
            {sortBy === "date" ? "日期" : sortBy === "score" ? "分数" : "公司"}
          </button>

          <div className="flex gap-1 p-0.5 bg-[var(--color-divider)] rounded-[var(--radius-sm)]">
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-[4px] transition-colors ${
                viewMode === "list"
                  ? "bg-[var(--color-surface)] text-[var(--color-text)]"
                  : "text-[var(--color-muted)]"
              }`}
              title="列表视图"
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setViewMode("grouped")}
              className={`p-1.5 rounded-[4px] transition-colors ${
                viewMode === "grouped"
                  ? "bg-[var(--color-surface)] text-[var(--color-text)]"
                  : "text-[var(--color-muted)]"
              }`}
              title="分组视图"
            >
              <Layers size={14} />
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={`p-1.5 rounded-[4px] transition-colors ${
                viewMode === "kanban"
                  ? "bg-[var(--color-surface)] text-[var(--color-text)]"
                  : "text-[var(--color-muted)]"
              }`}
              title="看板视图"
            >
              <Grid3X3 size={14} />
            </button>
          </div>
        </div>
      </PaperCard>

      {/* ── List View ── */}
      {viewMode === "list" && (
        <StaggerList className="space-y-2">
          {filtered.map((app) => (
            <StaggerItem key={app.id}>
              <PaperCard padding="sm" hover="lift">
                <div className="flex items-center gap-4">
                  <input
                    type="checkbox"
                    checked={selected.has(app.id!)}
                    onChange={() => toggleSelect(app.id!)}
                    className="w-4 h-4 rounded accent-[var(--color-primary)]"
                  />
                  <ScoreBadge score={app.score} size="sm" showLabel={false} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text)] truncate">
                      {app.company}
                    </p>
                    <p className="text-xs text-[var(--color-muted)] truncate">
                      {app.role}
                    </p>
                  </div>
                  {/* Interview indicator */}
                  {app.status === "interview" && app.interviews && app.interviews.length > 0 && (
                    <span className="text-xs text-[var(--color-primary)] bg-[var(--color-primary-muted)] px-2 py-0.5 rounded-[var(--radius-sm)]">
                      第{app.interviews[app.interviews.length - 1].round}轮
                      {app.interviews[0].totalRounds ? ` / 共${app.interviews[0].totalRounds}轮` : ""}
                    </span>
                  )}
                  <div className="relative group">
                    <StatusTag status={app.status} interactive />
                    <div className="absolute right-0 top-full mt-1 z-10 hidden group-hover:block bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-lg p-1 min-w-[120px]">
                      {STATUS_ORDER.map((s) => (
                        <button
                          key={s}
                          onClick={() => updateStatus(app, s)}
                          className={`block w-full text-left px-3 py-1.5 text-sm rounded-[var(--radius-sm)] transition-colors ${
                            s === app.status
                              ? "bg-[var(--color-primary-muted)] text-[var(--color-text)]"
                              : "text-[var(--color-text-soft)] hover:bg-[var(--color-divider)]"
                          }`}
                        >
                          {STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => setDetailApp(app)}
                    className="p-1 text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
                    title="查看详情"
                  >
                    <Info size={16} />
                  </button>
                  <span className="text-xs text-[var(--color-muted)] w-24 text-right">
                    {app.date}
                  </span>
                </div>
              </PaperCard>
            </StaggerItem>
          ))}
        </StaggerList>
      )}

      {/* ── Grouped View ── */}
      {viewMode === "grouped" &&
        grouped.map((group) => (
          <div key={group.status} className="space-y-2">
            <div className="flex items-center gap-3 py-1">
              <StatusTag status={group.status} />
              <span className="text-xs text-[var(--color-muted)]">
                {group.apps.length} 条
              </span>
            </div>
            <StaggerList className="space-y-2">
              {group.apps.map((app) => (
                <StaggerItem key={app.id}>
                  <PaperCard padding="sm" hover="lift">
                    <div className="flex items-center gap-4">
                      <ScoreBadge score={app.score} size="sm" showLabel={false} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text)]">
                          {app.company}
                        </p>
                        <p className="text-xs text-[var(--color-muted)]">{app.role}</p>
                      </div>
                      {app.status === "interview" && app.interviews && app.interviews.length > 0 && (
                        <span className="text-xs text-[var(--color-primary)] bg-[var(--color-primary-muted)] px-2 py-0.5 rounded-[var(--radius-sm)]">
                          第{app.interviews[app.interviews.length - 1].round}轮
                        </span>
                      )}
                      <button
                        onClick={() => setDetailApp(app)}
                        className="p-1 text-[var(--color-muted)] hover:text-[var(--color-text)]"
                      >
                        <Info size={16} />
                      </button>
                      <span className="text-xs text-[var(--color-muted)]">{app.date}</span>
                    </div>
                  </PaperCard>
                </StaggerItem>
              ))}
            </StaggerList>
          </div>
        ))}

      {/* ── Kanban View ── */}
      {viewMode === "kanban" && (
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4">
          {kanbanColumns.map((column) => (
            <div
              key={column.status}
              className="flex-shrink-0 w-56"
              onDragOver={(e) => handleDragOver(e, column.status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.status)}
            >
              {/* Column header */}
              <div
                className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-[var(--radius-md)] ${
                  dragOverStatus === column.status
                    ? "bg-[var(--color-primary-soft)]"
                    : "bg-[var(--color-divider)]"
                } transition-colors`}
              >
                <StatusTag status={column.status} size="sm" />
                <span className="text-xs text-[var(--color-muted)]">{column.count}</span>
              </div>

              {/* Column cards */}
              <div className="space-y-2 min-h-[120px]">
                <AnimatePresence>
                  {column.apps.map((app) => (
                    <motion.div
                      key={app.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-3 shadow-[var(--shadow-sm)] hover:-translate-y-0.5 transition-transform"
                    >
                      <div
                        draggable
                        onDragStart={(e: React.DragEvent<HTMLDivElement>) => handleDragStart(e, app)}
                        className="cursor-grab active:cursor-grabbing"
                      >
                      <div className="flex items-start gap-2">
                        <GripVertical size={12} className="text-[var(--color-muted)] mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--color-text)] truncate">
                            {app.company}
                          </p>
                          <p className="text-xs text-[var(--color-muted)] truncate leading-relaxed">
                            {app.role}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <ScoreBadge score={app.score} size="sm" showLabel={false} />
                            {app.interviews && app.interviews.length > 0 && (
                              <span className="text-xs text-[var(--color-primary)]">
                                R{app.interviews[app.interviews.length - 1].round}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDetailApp(app); }}
                          className="p-0.5 text-[var(--color-muted)] hover:text-[var(--color-text)]"
                        >
                          <Info size={14} />
                        </button>
                      </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {column.apps.length === 0 && (
                  <div className="h-16 flex items-center justify-center border border-dashed border-[var(--color-border)] rounded-[var(--radius-md)] text-xs text-[var(--color-muted)]">
                    拖拽到此
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Detail Panel (Slide-over) ── */}
      <AnimatePresence>
        {detailApp && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/20 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDetailApp(null)}
            />
            {/* Panel */}
            <motion.div
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[var(--color-surface)] border-l border-[var(--color-border)] z-50 overflow-y-auto"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
            >
              <div className="p-6 space-y-6">
                {/* Close */}
                <div className="flex items-center justify-between">
                  <HandwritingTitle as="h2">投递详情</HandwritingTitle>
                  <button
                    onClick={() => setDetailApp(null)}
                    className="p-2 text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Basic Info */}
                <PaperCard padding="md">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <ScoreBadge score={detailApp.score} size="md" />
                      <div>
                        <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--color-text)]">
                          {detailApp.company}
                        </h3>
                        <p className="text-sm text-[var(--color-muted)]">{detailApp.role}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <StatusTag status={detailApp.status} />
                      <span className="text-xs text-[var(--color-muted)] self-center">{detailApp.date}</span>
                    </div>
                  </div>
                </PaperCard>

                {/* Report link */}
                {detailApp.reportPath && (
                  <PaperCard padding="sm">
                    <div className="flex items-center gap-2">
                      <ExternalLink size={16} className="text-[var(--color-primary)]" />
                      <a
                        href={detailApp.reportPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[var(--color-primary)] hover:underline"
                      >
                        查看评估报告
                      </a>
                    </div>
                  </PaperCard>
                )}

                {/* Notes */}
                <PaperCard padding="md">
                  <h4 className="text-sm font-medium text-[var(--color-text)] mb-2">备注</h4>
                  <p className="text-sm text-[var(--color-text-soft)]">
                    {detailApp.notes || "暂无备注"}
                  </p>
                </PaperCard>

                {/* Interview Records */}
                <PaperCard padding="md">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-[var(--color-text)]">面试记录</h4>
                    <WarmButton
                      variant="soft"
                      size="sm"
                      onClick={() => addInterviewRound(detailApp)}
                    >
                      <Calendar size={14} className="mr-1" />
                      添加轮次
                    </WarmButton>
                  </div>
                  {detailApp.interviews && detailApp.interviews.length > 0 ? (
                    <div className="space-y-2">
                      {detailApp.interviews.map((r: InterviewRound, i: number) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 p-2 bg-[var(--color-primary-muted)] rounded-[var(--radius-sm)] text-sm"
                        >
                          <span className="font-[family-name:var(--font-display)] font-bold text-[var(--color-primary)]">
                            R{r.round}
                          </span>
                          <span className="text-[var(--color-text)]">{r.date}</span>
                          {r.notes && (
                            <span className="text-[var(--color-muted)] text-xs">{r.notes}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--color-muted)]">
                      {detailApp.status === "interview"
                        ? "点击上方面试轮次按钮添加记录"
                        : "尚未进入面试阶段"}
                    </p>
                  )}
                </PaperCard>

                {/* Quick actions */}
                <div className="flex gap-2">
                  <WarmButton
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      if (detailApp.url) window.open(detailApp.url, '_blank');
                    }}
                  >
                    {detailApp.url ? "查看原始JD" : "无JD链接"}
                  </WarmButton>
                  {detailApp.status === "offer" && (
                    <WarmButton
                      variant="soft"
                      size="sm"
                      onClick={() => { /* navigate to compare */ }}
                    >
                      添加到Offer对比
                    </WarmButton>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Interview Modal ── */}
      <AnimatePresence>
        {showInterviewModal && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/20 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInterviewModal(null)}
            />
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] p-6 w-full max-w-sm shadow-[var(--shadow-lg)]"
                initial={{ scale: 0.95, y: 16 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 16 }}
              >
                <HandwritingTitle as="h2" className="mb-4">面试轮次</HandwritingTitle>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-[var(--color-text-soft)] mb-1">
                      轮次
                    </label>
                    <input
                      type="number"
                      value={interviewForm.round}
                      min={1}
                      max={10}
                      onChange={(e) =>
                        setInterviewForm({ ...interviewForm, round: parseInt(e.target.value) || 1 })
                      }
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--color-text-soft)] mb-1">
                      总轮次（可选）
                    </label>
                    <input
                      type="number"
                      value={interviewForm.totalRounds || ""}
                      min={1}
                      max={10}
                      onChange={(e) =>
                        setInterviewForm({
                          ...interviewForm,
                          totalRounds: e.target.value ? parseInt(e.target.value) : undefined,
                        })
                      }
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--color-text-soft)] mb-1">
                      日期
                    </label>
                    <input
                      type="date"
                      value={interviewForm.date}
                      onChange={(e) =>
                        setInterviewForm({ ...interviewForm, date: e.target.value })
                      }
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--color-text-soft)] mb-1">
                      备注（可选）
                    </label>
                    <input
                      type="text"
                      value={interviewForm.notes || ""}
                      onChange={(e) =>
                        setInterviewForm({ ...interviewForm, notes: e.target.value })
                      }
                      placeholder="面试方式、面试官等..."
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] placeholder:text-[var(--color-muted)]"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <WarmButton variant="ghost" size="sm" onClick={() => setShowInterviewModal(null)}>
                      取消
                    </WarmButton>
                    <WarmButton variant="primary" size="sm" onClick={saveInterview}>
                      保存面试记录
                    </WarmButton>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
