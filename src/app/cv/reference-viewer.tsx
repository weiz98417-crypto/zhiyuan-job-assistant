"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Pencil, Check, BookOpen, Tag, Calendar, FileText, Gauge } from "lucide-react";
import { WarmButton, PaperCard } from "@/components/design";

interface CVSection {
  id: string;
  title: string;
  content: string;
}

interface ReferenceDetail {
  id: number;
  name: string;
  source: string;
  sections: CVSection[];
  tags: string[];
  notes: string;
  created_at: string;
  roleCategory?: string;
  visibility?: string;
  status?: string;
  qualityScore?: number;
  anonymized?: boolean;
  updated_at?: string;
}

interface ReferenceSummary {
  id: number;
  name: string;
  source: string;
  tags: string[];
  notes: string;
  created_at: string;
  roleCategory?: string;
  visibility?: string;
  status?: string;
  qualityScore?: number;
  anonymized?: boolean;
  updated_at?: string;
}

interface ReferenceViewerProps {
  resume: ReferenceDetail;
  allResumes: ReferenceSummary[];
  onClose: () => void;
  onNavigate: (id: number) => void;
  onUpdate: (id: number, updates: Record<string, unknown>) => Promise<void>;
}

export default function ReferenceViewer({
  resume,
  allResumes,
  onClose,
  onNavigate,
  onUpdate,
}: ReferenceViewerProps) {
  const [sections, setSections] = useState<CVSection[]>(resume.sections);
  const [editSectionId, setEditSectionId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(resume.name);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editNotes, setEditNotes] = useState(resume.notes);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSections(resume.sections);
    setEditName(resume.name);
    setEditNotes(resume.notes);
    setEditSectionId(null);
  }, [resume]);

  const visibilityLabel = resume.visibility === "team"
    ? "团队共享"
    : resume.visibility === "team_pending"
      ? "待审核共享"
      : resume.visibility === "disabled"
        ? "已停用"
        : "私有";
  const statusLabel = resume.status === "pending"
    ? "待审核"
    : resume.status === "disabled"
      ? "已停用"
      : resume.status === "index_failed"
        ? "索引失败"
        : "可用";

  // Cross-reference: same-tag resumes
  const relatedResumes = allResumes
    .filter(r => r.id !== resume.id)
    .map(r => ({
      ...r,
      overlap: r.tags.filter(t => resume.tags.includes(t)).length,
    }))
    .filter(r => r.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 3);

  const handleSaveSection = async () => {
    if (!editSectionId) return;
    const updated = sections.map(s =>
      s.id === editSectionId ? { ...s, content: editContent } : s
    );
    setSections(updated);
    setSaving(true);
    await onUpdate(resume.id, { sections: updated });
    setSaving(false);
    setEditSectionId(null);
  };

  const handleSaveName = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    await onUpdate(resume.id, { name: editName.trim() });
    setSaving(false);
    // Show new name immediately — prop update might lag behind async fetchReferences
    setEditName(editName.trim());
    setIsEditingName(false);
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    await onUpdate(resume.id, { notes: editNotes });
    setSaving(false);
    setIsEditingNotes(false);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.19, 1, 0.22, 1] }}
          className="bg-[var(--color-surface)] rounded-[var(--radius-xl)] shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-divider)] shrink-0">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <BookOpen size={20} className="text-[var(--color-primary)] shrink-0" />
              {isEditingName ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setIsEditingName(false); }}
                    className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1 text-sm font-[family-name:var(--font-display)]"
                  />
                  <WarmButton size="sm" onClick={handleSaveName} disabled={saving}>
                    <Check size={14} />
                  </WarmButton>
                </div>
              ) : (
                <h2
                  className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--color-text)] truncate cursor-pointer hover:text-[var(--color-primary)]"
                  onClick={() => setIsEditingName(true)}
                  title="点击编辑名称"
                >
                  {resume.name}
                </h2>
              )}
            </div>
            <button onClick={onClose} className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)] rounded">
              <X size={18} />
            </button>
          </div>

          {/* Meta bar */}
          <div className="flex flex-wrap items-center gap-2 px-6 py-2 text-xs text-[var(--color-muted)] border-b border-[var(--color-divider)] shrink-0">
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              {new Date(resume.created_at).toLocaleDateString("zh-CN")}
            </span>
            <span>{resume.source === "upload" ? "📄 上传" : "📋 粘贴"}</span>
            {resume.roleCategory && (
              <span className="px-1.5 py-0.5 rounded-full bg-[var(--color-primary-muted)] text-[var(--color-text-soft)]">
                {resume.roleCategory}
              </span>
            )}
            <span className="px-1.5 py-0.5 rounded-full bg-[var(--color-primary-muted)] text-[var(--color-text-soft)]">
              {visibilityLabel}
            </span>
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              {statusLabel}
            </span>
            {typeof resume.qualityScore === "number" && (
              <span className="flex items-center gap-1">
                <Gauge size={12} />
                质量 {Math.round(resume.qualityScore * 100)}
              </span>
            )}
            {resume.tags.length > 0 && (
              <div className="flex items-center gap-1">
                <Tag size={12} />
                {resume.tags.map(t => (
                  <span key={t} className="px-1.5 py-0.5 rounded-full bg-[var(--color-primary-muted)] text-[var(--color-text-soft)]">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Body — scrollable sections */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 scrollbar-thin">
            {sections.filter(s => s.content?.trim()).map((section) => (
              <PaperCard key={section.id} padding="md">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-[family-name:var(--font-display)] font-bold text-sm text-[var(--color-text)]">
                    {section.title}
                  </h3>
                  <button
                    onClick={() => {
                      if (editSectionId === section.id) {
                        setEditSectionId(null);
                      } else {
                        setEditSectionId(section.id);
                        setEditContent(section.content);
                      }
                    }}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-[var(--radius-sm)] text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)]"
                  >
                    <Pencil size={11} />
                    {editSectionId === section.id ? "取消" : "编辑"}
                  </button>
                </div>

                {editSectionId === section.id ? (
                  <div className="space-y-2">
                    <textarea
                      autoFocus
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={Math.max(3, editContent.split("\n").length + 2)}
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] p-3 text-sm text-[var(--color-text)] font-[var(--font-body)] resize-none focus:outline-none focus:border-[var(--color-primary)]"
                    />
                    <div className="flex gap-2">
                      <WarmButton size="sm" onClick={handleSaveSection} disabled={saving}>
                        <Check size={12} className="mr-1" />
                        {saving ? "保存中..." : "保存"}
                      </WarmButton>
                      <WarmButton variant="ghost" size="sm" onClick={() => setEditSectionId(null)}>
                        <X size={12} className="mr-1" />
                        取消
                      </WarmButton>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--color-text-soft)] whitespace-pre-wrap leading-relaxed font-[var(--font-body)]">
                    {section.content}
                  </p>
                )}
              </PaperCard>
            ))}

            {/* Notes */}
            <PaperCard padding="md">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-[family-name:var(--font-display)] font-bold text-sm text-[var(--color-text)] flex items-center gap-1">
                  <FileText size={14} />
                  备注
                </h3>
                <button
                  onClick={() => {
                    if (isEditingNotes) {
                      handleSaveNotes();
                    } else {
                      setIsEditingNotes(true);
                      setEditNotes(resume.notes);
                    }
                  }}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-[var(--radius-sm)] text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)]"
                >
                  <Pencil size={11} />
                  {isEditingNotes ? "保存" : "编辑"}
                </button>
              </div>
              {isEditingNotes ? (
                <textarea
                  autoFocus
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] p-2 text-sm text-[var(--color-text)] resize-none focus:outline-none focus:border-[var(--color-primary)]"
                  placeholder="添加备注，如：'这个简历的量化表达很好'、'STAR结构参考这个'"
                />
              ) : (
                <p className="text-sm text-[var(--color-text-soft)]">
                  {resume.notes || "暂无备注"}
                </p>
              )}
            </PaperCard>

            {/* Cross-reference: related resumes */}
            {relatedResumes.length > 0 && (
              <div>
                <h3 className="font-[family-name:var(--font-display)] font-bold text-sm text-[var(--color-text)] mb-2 flex items-center gap-1">
                  <BookOpen size={14} className="text-[var(--color-primary)]" />
                  同类标签的简历
                </h3>
                <div className="grid gap-2 sm:grid-cols-3">
                  {relatedResumes.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => onNavigate(r.id)}
                      className="p-3 rounded-[var(--radius-md)] border border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-muted)] transition-colors text-left group"
                    >
                      <p className="text-sm font-medium text-[var(--color-text)] group-hover:text-[var(--color-primary)] truncate">
                        {r.name}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {r.tags.slice(0, 3).map(t => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-divider)] text-[var(--color-text-soft)]">
                            {t}
                          </span>
                        ))}
                        {r.overlap > 1 && (
                          <span className="text-[10px] text-[var(--color-muted)]">{r.overlap} 个共同标签</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
