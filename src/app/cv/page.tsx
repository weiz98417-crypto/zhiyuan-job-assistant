"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Download,
  Search,
  Check,
  X,
  Eye,
  Plus,
  Trash2,
  Sparkles,
  ChevronDown,
  Loader2,
  Pencil,
  BookOpen,
  Upload,
  ClipboardPaste,
  GitCompare,
  CheckCircle,
  Users,
  Lock,
  Gauge,
} from "lucide-react";
import {
  HandwritingTitle,
  WarmButton,
  PaperCard,
} from "@/components/design";
import db from "@/lib/db";
import {
  loadCVData,
  loadCVDataFromServer,
  createVersion,
  deleteVersion,
  switchVersion,
  renameVersion,
  saveCVData,
  computeSectionsHash,
} from "@/lib/cv-storage";
import OptimizePanel from "./optimize-panel";
import VersionDiff from "./version-diff";
import ReferenceViewer from "./reference-viewer";
import { ROLE_DIRECTION_OPTIONS } from "@/types";
import type { Application, EvaluationReport, CVSection, RoleDirection } from "@/types";

interface AIKnowledge {
  label: string;
  matched: boolean;
  suggestion?: string;
}

const TEMPLATES = [
  { id: "clean", name: "简洁经典", description: "传统一栏排版，干净专业" },
  { id: "modern", name: "现代双栏", description: "左侧侧边栏，技能标签化" },
  { id: "compact", name: "紧凑效率", description: "高密度排版，适合经验丰富者" },
];

function renderMarkdown(text: string): string {
  if (!text) return "";
  return text
    .replace(/^### (.+)$/gm, '<h4 class="font-semibold text-sm mt-2 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="font-bold text-sm text-gray-800 mt-3 mb-1">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="ml-3 text-xs">• $1</li>')
    .replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul class="my-1">$1</ul>')
    .replace(/\n\n/g, '<br/>')
    .replace(/\n/g, '<br/>');
}

function PreviewBlock({ title, content, sidebar, tags }: {
  title?: string;
  content?: string;
  sidebar?: boolean;
  tags?: boolean;
}) {
  if (tags && content) {
    const items = content.split(/[,，\n]/).filter(Boolean);
    return (
      <div>
        <h3 className="text-sm font-bold text-gray-700 border-b border-gray-300 pb-1 mb-2">{title}</h3>
        <div className="flex flex-wrap gap-1">
          {items.map((tag, i) => (
            <span key={i} className="text-xs px-1.5 py-0.5 bg-gray-200 rounded text-gray-700">{tag.trim()}</span>
          ))}
        </div>
      </div>
    );
  }

  const htmlContent = renderMarkdown(content || "");

  return (
    <div>
      <h3 className={sidebar
        ? "text-sm font-bold text-gray-700 border-b border-gray-300 pb-1 mb-2"
        : "text-sm font-bold text-gray-700 border-b-2 border-amber-400 pb-1 mb-2"
      }>{title}</h3>
      {htmlContent ? (
        <div
          className={sidebar ? "text-xs text-gray-600 leading-relaxed" : "text-xs text-gray-700 leading-relaxed"}
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      ) : (
        <p className={sidebar ? "text-xs text-gray-300 italic" : "text-xs text-gray-300 italic"}>待填写...</p>
      )}
    </div>
  );
}

function referenceVisibilityLabel(value?: string): string {
  if (value === "team") return "团队共享";
  if (value === "team_pending") return "待审核";
  if (value === "disabled") return "已停用";
  return "私有";
}

function referenceStatusLabel(value?: string): string {
  if (value === "pending") return "待审核";
  if (value === "disabled") return "已停用";
  if (value === "index_failed") return "索引失败";
  return "可用";
}

function referenceStatusClass(value?: string): string {
  if (value === "pending") return "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300";
  if (value === "disabled" || value === "index_failed") return "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300";
  return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300";
}

export default function CVPage() {
  const [sections, setSections] = useState<CVSection[]>([]);
  const [savedHash, setSavedHash] = useState("");
  const [cvData, setCVData] = useState(() => loadCVData());
  const [showVersionMenu, setShowVersionMenu] = useState(false);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editVersionName, setEditVersionName] = useState("");
  const [showNewVersionInput, setShowNewVersionInput] = useState(false);
  const [newVersionName, setNewVersionName] = useState("");
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [saveFeedback, setSaveFeedback] = useState(false);

  const [applications, setApplications] = useState<Application[]>([]);
  const [reports, setReports] = useState<EvaluationReport[]>([]);
  const [selectedJDId, setSelectedJDId] = useState<number | null>(null);
  const [selectedReport, setSelectedReport] = useState<EvaluationReport | null>(null);
  const [keywords, setKeywords] = useState<AIKnowledge[]>([]);
  const [matchPercent, setMatchPercent] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [sectionFeedback, setSectionFeedback] = useState<
    { sectionId: string; strengthScore: number; notes: string[] }[]
  >([]);
  const [missingTerms, setMissingTerms] = useState<string[]>([]);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("clean");
  const [mounted, setMounted] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [activeOptimizeSection, setActiveOptimizeSection] = useState<string | null>(null);
  const [flashSectionId, setFlashSectionId] = useState<string | null>(null);
  const [clearConfirmId, setClearConfirmId] = useState<string | null>(null);
  const [roleDirection, setRoleDirection] = useState<RoleDirection>("auto");
  const [profileRoleOptions, setProfileRoleOptions] = useState<{ value: string; label: string }[]>([]);
  const optimizedRef = useRef(false);

  // Version diff mode
  const [diffMode, setDiffMode] = useState<{ oldId: string; newId: string } | null>(null);

  // Reference resume library
  interface ReferenceResumeSummary {
    id: number; name: string; source: string; tags: string[]; notes: string; created_at: string;
    roleCategory?: string; visibility?: string; status?: string; qualityScore?: number; anonymized?: boolean; ownedByUser?: boolean; updated_at?: string;
  }
  const [referenceResumes, setReferenceResumes] = useState<ReferenceResumeSummary[]>([]);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importText, setImportText] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"paste" | "upload">("paste");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importRoleCategory, setImportRoleCategory] = useState("");
  const [importVisibility, setImportVisibility] = useState<"private" | "team">("private");
  const [importDragOver, setImportDragOver] = useState(false);
  const [importedRefId, setImportedRefId] = useState<number | null>(null);
  const [renameImportedValue, setRenameImportedValue] = useState("");
  const [showRenamePrompt, setShowRenamePrompt] = useState(false);
  const [renameSaving, setRenameSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Import own CV from file ──
  const [cvImportLoading, setCvImportLoading] = useState(false);
  const [cvImportError, setCvImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{ versionId: string; coverageRatio: number | null } | null>(null);
  const cvFileInputRef = useRef<HTMLInputElement>(null);

  const handleImportCV = async (file: File) => {
    setCvImportLoading(true);
    setCvImportError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/cv/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "导入失败");
      if (!data.data?.persisted?.cvData) throw new Error("导入内容没有写入云端，已阻止只更新当前页面");
      if (data.data?.persisted?.cvData) {
        const persisted = data.data.persisted.cvData;
        setCVData(persisted);
        localStorage.setItem("zhiyuan-cv", JSON.stringify(persisted));
        if (data.data.persisted.status === "pending") {
          setPendingImport({
            versionId: String(data.data.persisted.versionId),
            coverageRatio: Number(data.data.persisted.integrity?.coverageRatio || 0),
          });
          return;
        }
      }
    } catch (err: unknown) {
      setCvImportError(err instanceof Error ? err.message : "导入失败");
    } finally {
      setCvImportLoading(false);
    }
  };

  // Reference viewer modal
  const [viewingRefId, setViewingRefId] = useState<number | null>(null);
  const [viewingRefDetail, setViewingRefDetail] = useState<ReferenceDetail | null>(null);
  const [viewingRefLoading, setViewingRefLoading] = useState(false);

  interface ReferenceDetail {
    id: number; name: string; source: string;
    sections: CVSection[]; tags: string[]; notes: string; created_at: string;
    roleCategory?: string; visibility?: string; status?: string; qualityScore?: number; anonymized?: boolean; ownedByUser?: boolean; updated_at?: string;
  }

  const fetchReferences = useCallback(async () => {
    try {
      const res = await fetch("/api/cv/references");
      if (res.ok) {
        const data = await res.json();
        if (data.success) setReferenceResumes(data.data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchReferences();
  }, [fetchReferences]);

  const handleImportReference = async () => {
    setImportLoading(true);
    setImportError(null);
    try {
      let res: Response;
      if (importMode === "upload" && importFile) {
        const formData = new FormData();
        formData.append("file", importFile);
        formData.append("roleCategory", importRoleCategory);
        formData.append("visibility", importVisibility);
        formData.append("saveAsExcellent", "true");
        res = await fetch("/api/cv/import-reference", {
          method: "POST",
          body: formData,
        });
      } else if (importMode === "paste" && importText.trim()) {
        res = await fetch("/api/cv/import-reference", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: importText,
            roleCategory: importRoleCategory,
            visibility: importVisibility,
            saveAsExcellent: true,
          }),
        });
      } else {
        setImportError("请粘贴简历文本或上传文件");
        setImportLoading(false);
        return;
      }
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "导入失败");
      setImportText("");
      setImportFile(null);
      setImportRoleCategory("");
      setImportVisibility("private");
      // Show rename prompt instead of immediately closing
      setImportedRefId(data.data.id);
      setRenameImportedValue(data.data.name);
      setShowRenamePrompt(true);
      fetchReferences();
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : "导入失败");
    } finally {
      setImportLoading(false);
    }
  };

  const handleRenameImported = async () => {
    if (!importedRefId || !renameImportedValue.trim()) return;
    setRenameSaving(true);
    try {
      await fetch(`/api/cv/references/${importedRefId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameImportedValue.trim() }),
      });
    } catch { /* ignore */ }
    setRenameSaving(false);
    setShowRenamePrompt(false);
    setShowImportPanel(false);
    fetchReferences();
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setImportDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setImportFile(file);
      setImportMode("upload");
      setImportError(null);
    }
  };

  const handleDeleteReference = async (id: number, name: string) => {
    if (!confirm(`确定删除参考简历『${name}』？`)) return;
    try {
      await fetch(`/api/cv/references/${id}`, { method: "DELETE" });
      fetchReferences();
    } catch { /* ignore */ }
  };

  const handleViewReference = async (id: number) => {
    setViewingRefLoading(true);
    try {
      const res = await fetch(`/api/cv/references/${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setViewingRefDetail(data.data);
          setViewingRefId(id);
        }
      }
    } catch { /* ignore */ }
    setViewingRefLoading(false);
  };

  const handleNavigateReference = async (id: number) => {
    setViewingRefLoading(true);
    try {
      const res = await fetch(`/api/cv/references/${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setViewingRefDetail(data.data);
          setViewingRefId(id);
        }
      }
    } catch { /* ignore */ }
    setViewingRefLoading(false);
  };

  const handleUpdateReference = async (id: number, updates: Record<string, unknown>) => {
    const res = await fetch(`/api/cv/references/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) return;
    if (viewingRefDetail?.id === id) {
      const detailRes = await fetch(`/api/cv/references/${id}`);
      if (detailRes.ok) {
        const data = await detailRes.json();
        if (data.success) setViewingRefDetail(data.data);
      }
    }
    fetchReferences();
  };

  const versionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      const [apps, reps, serverCV] = await Promise.all([
        db.applications.toArray(),
        db.reports.toArray(),
        loadCVDataFromServer(),
      ]);
      setApplications(apps);
      setReports(reps);
      if (serverCV) {
        setCVData(serverCV);
        const latestPending = Object.values(serverCV.versions)
          .filter((version) => version.id !== serverCV.activeVersion && version.source === "imported" && version.integrityStatus === "needs_review")
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
        if (latestPending) setPendingImport({ versionId: latestPending.id, coverageRatio: null });
      }
      setMounted(true);
    }
    load();
  }, []);

  useEffect(() => {
    const active = cvData.versions[cvData.activeVersion];
    if (active) {
      setSections(active.sections.map((s) => ({ ...s })));
      setSavedHash(computeSectionsHash(active.sections));
    }
  }, [cvData]);

  // Load role direction from server-side profile API
  const [profileGoals, setProfileGoals] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    fetch("/api/data/profile")
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data?.goals) {
          setProfileGoals(d.data.goals);
          const roles: { value: string; label: string }[] = [];
          if (d.data.goals.targetRoles?.length) {
            for (const r of d.data.goals.targetRoles) {
              const name = typeof r === "string" ? r : (r.role || r.name);
              if (name && !roles.some(x => x.value === name)) roles.push({ value: name, label: name });
            }
          }
          if (roles.length > 0) setProfileRoleOptions(roles);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (versionMenuRef.current && !versionMenuRef.current.contains(e.target as Node)) {
        setShowVersionMenu(false);
        setEditingVersionId(null);
        setShowNewVersionInput(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isDirty = computeSectionsHash(sections) !== savedHash;

  const doSave = useCallback(() => {
    const currentVersion = cvData.versions[cvData.activeVersion];
    if (!currentVersion) return;
    const updated = {
      ...cvData,
      versions: {
        ...cvData.versions,
        [cvData.activeVersion]: {
          ...currentVersion,
          sections: sections.map((s) => ({ ...s })),
          source: optimizedRef.current ? "optimized" as const : currentVersion.source,
        },
      },
    };
    void (async () => {
      try {
        const persisted = await saveCVData(updated, cvData);
        setCVData(persisted);
        const persistedSections = persisted.versions[persisted.activeVersion]?.sections || sections;
        setSavedHash(computeSectionsHash(persistedSections));
        setSaveFeedback(true);
        optimizedRef.current = false;
        setTimeout(() => setSaveFeedback(false), 1500);
      } catch (error) {
        setCvImportError(error instanceof Error ? error.message : "简历保存失败");
      }
    })();
  }, [sections, cvData]);

  const confirmAction = (action: () => void) => {
    if (isDirty) {
      setPendingAction(() => action);
      setShowUnsavedDialog(true);
    } else {
      action();
    }
  };

  const handleSwitchVersion = (versionId: string) => {
    confirmAction(async () => {
      try {
        const result = await switchVersion(versionId);
        if (result) {
          setCVData(result);
          setShowVersionMenu(false);
        }
      } catch (error) {
        setCvImportError(error instanceof Error ? error.message : "版本切换失败");
      }
    });
  };

  const handleCreateVersion = async () => {
    const name = newVersionName.trim() || "新版本";
    try {
      const result = await createVersion(name);
      setCVData(result);
      setShowNewVersionInput(false);
      setNewVersionName("");
      setShowVersionMenu(false);
    } catch (error) {
      setCvImportError(error instanceof Error ? error.message : "版本创建失败");
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    try {
      const result = await deleteVersion(versionId);
      setCVData(result);
      if (Object.keys(result.versions).length <= 1) setShowVersionMenu(false);
    } catch (error) {
      setCvImportError(error instanceof Error ? error.message : "版本删除失败");
    }
  };

  const handleRenameVersion = async (versionId: string) => {
    if (!editVersionName.trim()) return;
    try {
      const result = await renameVersion(versionId, editVersionName.trim());
      if (result) setCVData(result);
      setEditingVersionId(null);
    } catch (error) {
      setCvImportError(error instanceof Error ? error.message : "版本重命名失败");
    }
  };

  const updateSection = (id: string, content: string) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, content } : s)));
  };

  /* ── JD Matching (AI-powered) ── */
  const analyzeJD = async (reportId: number) => {
    setSelectedJDId(reportId);
    const report = reports.find((r) => r.id === reportId);
    setSelectedReport(report || null);

    if (!report) return;
    // Skip if all sections are empty
    if (sections.every((s) => !s.content.trim())) return;

    setAnalyzeLoading(true);
    setKeywords([]);
    setMatchPercent(0);
    setSuggestions([]);
    setSectionFeedback([]);
    setMissingTerms([]);

    // Try to get JD text from JD library for richer analysis
    const jdKeywords = report.keywords || [];
    let jdText = "";
    if (jdKeywords.length === 0) {
      try {
        const jdFromDb = await db.jds.where("reportId").equals(report.reportNum).first();
        jdText = jdFromDb?.body || "";
      } catch { /* ignore */ }
    }

    // Fallback: generate keywords from role + archetype if JD data is unavailable
    let effectiveKeywords = jdKeywords;
    const effectiveJdText = jdText;
    if (jdKeywords.length === 0 && !jdText) {
      const fallbackTerms = [report.role, report.archetype].filter(Boolean)
        .flatMap(t => (t || "").split(/[/\-\s]+/))
        .filter(w => w.length >= 2);
      effectiveKeywords = fallbackTerms;
    }

    try {
      const res = await fetch("/api/cv/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: Object.fromEntries(sections.map((s) => [s.id, s.content])),
          keywords: effectiveKeywords,
          jdText: effectiveJdText || undefined,
          role: report.role,
          archetype: report.archetype,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "AI 分析失败");
      }

      const result = await res.json();
      if (!result.success || !result.data) {
        throw new Error(result.error || "AI 分析失败");
      }

      const { matchPercent: aiMatch, keywordMatches, missingTerms: aiMissing, suggestions: aiSuggestions, sectionFeedback: aiFeedback } = result.data;

      setMatchPercent(aiMatch || 0);
      setKeywords(
        (keywordMatches || []).map((km: { keyword: string; matched: boolean; suggestion?: string }) => ({
          label: km.keyword,
          matched: km.matched,
          suggestion: km.suggestion,
        })) as AIKnowledge[]
      );
      setMissingTerms(aiMissing || []);
      setSuggestions(aiSuggestions || []);
      setSectionFeedback(aiFeedback || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "未知错误";
      const jdKeywords = report.keywords || [];
      const cvText = sections.map((s) => s.content).join(" ");
      const knowledge: AIKnowledge[] = jdKeywords.map((kw) => ({
        label: kw,
        matched: cvText.toLowerCase().includes(kw.toLowerCase()),
      }));
      setKeywords(knowledge);
      setMatchPercent(
        knowledge.length > 0
          ? Math.round((knowledge.filter((k) => k.matched).length / knowledge.length) * 100)
          : 0
      );
      setSuggestions([`AI 分析暂不可用（${message}），以下为本地关键词匹配结果。`]);
      console.error("CV analyze API error:", message);
    } finally {
      setAnalyzeLoading(false);
    }
  };

  /* ── PDF Download ── */
  const downloadPDF = async () => {
    setPdfLoading(true);
    try {
      const stored = localStorage.getItem("zhiyuan-profile");
      const profile = stored ? JSON.parse(stored) : {};

      const res = await fetch("/api/generate-cv-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections,
          template: selectedTemplate,
          targetCompany: selectedReport?.company,
          profile,
        }),
      });

      if (!res.ok) {
        let serverError = "PDF 生成失败";
        try {
          const errBody = await res.json();
          if (errBody.error) serverError = errBody.error;
        } catch { /* use default message */ }
        throw new Error(serverError);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `cv-${selectedReport?.company || "target"}-${date}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "未知错误";
      console.error("PDF download failed:", message);
    } finally {
      setPdfLoading(false);
    }
  };

  if (!mounted) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-[var(--color-divider)] rounded w-40" />
        <div className="h-64 bg-[var(--color-divider)] rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  const versionIds = Object.keys(cvData.versions);
  const activeVersion = cvData.versions[cvData.activeVersion];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-[var(--color-muted)] text-sm mb-1">让简历与 JD 精准匹配</p>
          <HandwritingTitle as="h1">简历管理</HandwritingTitle>
        </div>
        <div className="flex gap-2">
          {/* Hidden CV file input */}
          <input
            ref={cvFileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.md,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportCV(file);
              e.target.value = "";
            }}
          />
          <WarmButton
            variant="ghost"
            size="sm"
            onClick={() => cvFileInputRef.current?.click()}
            disabled={cvImportLoading}
          >
            {cvImportLoading ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <Upload size={16} className="mr-1.5" />}
            {cvImportLoading ? "解析中..." : "导入简历"}
          </WarmButton>
          <WarmButton
            variant="ghost"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
          >
            <Eye size={16} className="mr-1.5" />
            {showPreview ? "编辑" : "预览"}
          </WarmButton>
          <WarmButton variant="primary" size="sm" onClick={downloadPDF} disabled={pdfLoading}>
            {pdfLoading ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <Download size={16} className="mr-1.5" />}
            {pdfLoading ? "生成中..." : "下载 PDF"}
          </WarmButton>
        </div>
      </div>

      {cvImportError && (
        <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-[var(--radius-sm)]">
          <X size={14} />
          {cvImportError}
          <button onClick={() => setCvImportError(null)} className="ml-auto text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {pendingImport && (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/20">
          <Gauge size={14} />
          <span>
            导入内容已完整保存为待确认版本
            {pendingImport.coverageRatio === null ? "，完整性需要人工确认" : `，自动覆盖率 ${Math.round(pendingImport.coverageRatio * 100)}%`}
            。系统没有静默替换当前简历。
          </span>
          <button
            type="button"
            onClick={() => {
              void switchVersion(pendingImport.versionId).then((result) => {
                if (result) setCVData(result);
                setPendingImport(null);
              }).catch((error) => setCvImportError(error instanceof Error ? error.message : "确认导入版本失败"));
            }}
            className="ml-auto rounded-[var(--radius-sm)] bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800"
          >
            确认设为当前版本
          </button>
          <button type="button" onClick={() => setPendingImport(null)} className="text-amber-700 hover:text-amber-900">稍后处理</button>
        </div>
      )}

      {/* Version selector + Save */}
      <div className="flex items-center gap-3 flex-wrap" ref={versionMenuRef}>
        {/* Version dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowVersionMenu(!showVersionMenu)}
            className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-bg)] border border-[var(--color-border)] text-sm text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors"
          >
            <span className="text-[var(--color-muted)]">版本:</span>
            <span className="font-medium">
              {activeVersion?.id} · {activeVersion?.label}
            </span>
            <ChevronDown size={14} className={`text-[var(--color-muted)] transition-transform ${showVersionMenu ? "rotate-180" : ""}`} />
          </button>

          <AnimatePresence>
            {showVersionMenu && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute top-full mt-1 left-0 w-72 bg-[var(--color-surface-raised)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-lg z-50 overflow-hidden"
              >
                {versionIds.map((vid) => {
                  const v = cvData.versions[vid];
                  const isActive = vid === cvData.activeVersion;
                  const isEditing = editingVersionId === vid;
                  return (
                    <div
                      key={vid}
                      className={`flex items-center gap-2 px-3 py-2 text-sm border-b border-[var(--color-divider)] last:border-b-0 ${
                        isActive ? "bg-[var(--color-primary-muted)]" : "hover:bg-[var(--color-divider)]"
                      }`}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editVersionName}
                          onChange={(e) => setEditVersionName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameVersion(vid);
                            if (e.key === "Escape") setEditingVersionId(null);
                          }}
                          onBlur={() => handleRenameVersion(vid)}
                          className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1 text-sm"
                        />
                      ) : (
                        <button
                          onClick={() => handleSwitchVersion(vid)}
                          className="flex-1 text-left flex items-center gap-2"
                        >
                          {isActive && <Check size={14} className="text-[var(--color-primary)] shrink-0" />}
                          {!isActive && <span className="w-[14px] shrink-0" />}
                          <span className="font-medium">{v.id}</span>
                          <span>·</span>
                          <span>{v.label}</span>
                          {v.source === "optimized" && (
                            <Sparkles size={10} className="text-[var(--color-primary)] shrink-0" />
                          )}
                          <span className="text-[var(--color-muted)] text-xs ml-auto">
                            {new Date(v.createdAt).toLocaleDateString("zh-CN")}
                          </span>
                        </button>
                      )}
                      <div className="flex items-center gap-1 shrink-0">
                        {!isEditing && versionIds.length > 1 && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingVersionId(vid);
                                setEditVersionName(v.label);
                              }}
                              className="p-1 text-[var(--color-muted)] hover:text-[var(--color-text)] rounded"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteVersion(vid);
                              }}
                              className="p-1 text-[var(--color-muted)] hover:text-red-500 rounded"
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* New version input or button */}
                {showNewVersionInput ? (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <input
                      autoFocus
                      value={newVersionName}
                      onChange={(e) => setNewVersionName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateVersion();
                        if (e.key === "Escape") {
                          setShowNewVersionInput(false);
                          setNewVersionName("");
                        }
                      }}
                      placeholder="版本名称..."
                      className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1 text-sm"
                    />
                    <WarmButton size="sm" onClick={handleCreateVersion}>
                      <Check size={14} />
                    </WarmButton>
                    <WarmButton
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowNewVersionInput(false);
                        setNewVersionName("");
                      }}
                    >
                      <X size={14} />
                    </WarmButton>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNewVersionInput(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)] transition-colors"
                  >
                    <Plus size={14} />
                    新建版本
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Save button */}
        <WarmButton
          variant={isDirty ? "primary" : "ghost"}
          size="sm"
          onClick={doSave}
          disabled={!isDirty}
        >
          {saveFeedback ? (
            <>
              <Check size={16} className="mr-1.5" />
              已保存
            </>
          ) : (
            <>
              <FileText size={16} className="mr-1.5" />
              {isDirty ? "保存" : "已保存"}
            </>
          )}
        </WarmButton>

        {/* Compare button */}
        {versionIds.length >= 2 && (
          <WarmButton
            variant="ghost"
            size="sm"
            onClick={() => {
              const currentId = cvData.activeVersion;
              const otherId = versionIds.find((vid) => vid !== currentId) || versionIds[0];
              setDiffMode({ oldId: currentId, newId: otherId });
            }}
          >
            <GitCompare size={16} className="mr-1.5" />
            对比
          </WarmButton>
        )}
      </div>

      {/* Version Diff View */}
      {diffMode ? (
        (() => {
          const oldVersion = cvData.versions[diffMode.oldId];
          const newVersion = cvData.versions[diffMode.newId];
          if (!oldVersion || !newVersion) return null;
          return (
            <VersionDiff
              oldVersion={{ id: diffMode.oldId, label: oldVersion.label, sections: oldVersion.sections }}
              newVersion={{ id: diffMode.newId, label: newVersion.label, sections: newVersion.sections }}
              versionIds={versionIds}
              versionLabels={Object.fromEntries(versionIds.map((vid) => [vid, cvData.versions[vid]?.label || vid]))}
              onSwitchVersion={(oldId, newId) => setDiffMode({ oldId, newId })}
              onSetCurrent={(versionId) => {
                void switchVersion(versionId).then((result) => {
                  if (result) setCVData(result);
                  setDiffMode(null);
                }).catch((error) => setCvImportError(error instanceof Error ? error.message : "版本切换失败"));
              }}
              onBack={() => setDiffMode(null)}
            />
          );
        })()
      ) : (
      <div className="grid gap-6 lg:grid-cols-3 xl:grid-cols-[1fr_380px]">
        {/* Left: CV Editor */}
        <div className="lg:col-span-2 xl:col-span-1 space-y-4">
          {/* Template selector */}
          <PaperCard padding="sm">
            <div className="flex items-center gap-3">
              <span className="text-sm text-[var(--color-text-soft)]">模板：</span>
              <div className="flex gap-2">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t.id)}
                    className={`px-3 py-1.5 text-xs rounded-[var(--radius-sm)] transition-colors ${
                      selectedTemplate === t.id
                        ? "bg-[var(--color-primary)] text-[var(--color-surface-raised)]"
                        : "bg-[var(--color-divider)] text-[var(--color-text-soft)] hover:bg-[var(--color-primary-muted)]"
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Role direction selector */}
            <div className="mt-3 pt-3 border-t border-[var(--color-divider)]">
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--color-text-soft)] shrink-0">岗位方向：</span>
                <select
                  value={roleDirection}
                  onChange={(e) => setRoleDirection(e.target.value as RoleDirection)}
                  className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                >
                  <option value="auto">自动检测（从求职画像推断）</option>
                  {profileRoleOptions.length > 0 && (
                    <optgroup label="—— 你的求职画像 ——">
                      {profileRoleOptions.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="—— 手动指定 ——">
                    {ROLE_DIRECTION_OPTIONS.filter(o => o.value !== "auto").map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <p className="text-xs text-[var(--color-muted)] mt-1">
                {roleDirection === "auto"
                  ? (profileRoleOptions.length > 0
                    ? `→ 已检测：使用「${profileRoleOptions[0].label}」写作模版`
                    : "→ 未检测到求职画像，将使用通用优化")
                  : `→ 使用「${ROLE_DIRECTION_OPTIONS.find(o => o.value === roleDirection)?.label || roleDirection}」写作模版`
                }
              </p>
            </div>
          </PaperCard>

          {/* Sections */}
          {showPreview ? (
            <PaperCard padding="lg">
              {selectedTemplate === "modern" ? (
                <div className="bg-white text-black rounded-[var(--radius-sm)] shadow-md max-w-[210mm] mx-auto min-h-[297mm] font-[var(--font-body)] flex">
                  <div className="w-1/3 bg-gray-100 p-6 space-y-5">
                    <PreviewBlock title={sections.find((s) => s.id === "summary")?.title} content={sections.find((s) => s.id === "summary")?.content} sidebar />
                    <PreviewBlock title={sections.find((s) => s.id === "skills")?.title} content={sections.find((s) => s.id === "skills")?.content} sidebar tags />
                    <PreviewBlock title={sections.find((s) => s.id === "education")?.title} content={sections.find((s) => s.id === "education")?.content} sidebar />
                  </div>
                  <div className="flex-1 p-6 space-y-5">
                    <PreviewBlock title={sections.find((s) => s.id === "experience")?.title} content={sections.find((s) => s.id === "experience")?.content} />
                    <PreviewBlock title={sections.find((s) => s.id === "projects")?.title} content={sections.find((s) => s.id === "projects")?.content} />
                  </div>
                </div>
              ) : selectedTemplate === "compact" ? (
                <div className="bg-white text-black rounded-[var(--radius-sm)] shadow-md p-6 max-w-[210mm] mx-auto min-h-[297mm] font-[var(--font-body)]">
                  <div className="space-y-3">
                    {sections.map((section) => (
                      <div key={section.id}>
                        <h2 className="text-sm font-bold text-gray-800 border-b border-gray-300 pb-0.5 mb-1.5 uppercase tracking-wide">
                          {section.title}
                        </h2>
                        <div className="text-xs text-gray-700 whitespace-pre-wrap leading-snug">
                          {section.content || <span className="text-gray-300 italic">待填写...</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-white text-black rounded-[var(--radius-sm)] shadow-md p-8 max-w-[210mm] mx-auto min-h-[297mm] font-[var(--font-body)]">
                  <div className="space-y-6">
                    {sections.map((section) => (
                      <div key={section.id}>
                        <h2 className="text-lg font-bold text-gray-800 border-b-2 border-amber-400 pb-1 mb-3">
                          {section.title}
                        </h2>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                          {section.content || <span className="text-gray-300 italic">待填写...</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </PaperCard>
          ) : (
            sections.map((section) => {
              const isOptimizing = activeOptimizeSection === section.id;
              const isFlashing = flashSectionId === section.id;

              const targetJD = selectedReport
                ? {
                    role: selectedReport.role,
                    company: selectedReport.company,
                    keywords: selectedReport.keywords || [],
                  }
                : undefined;

              return (
                <div
                  key={section.id}
                  className={`transition-all duration-300 rounded-[var(--radius-md)] ${
                    isFlashing ? "ring-2 ring-emerald-400 shadow-lg shadow-emerald-200/50" : ""
                  }`}
                >
                <PaperCard padding="md">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)]">
                      {section.title}
                    </h3>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          setActiveOptimizeSection(isOptimizing ? null : section.id)
                        }
                        className={`flex items-center gap-1 text-xs px-2 py-1 rounded-[var(--radius-sm)] transition-all ${
                          isOptimizing
                            ? "bg-[var(--color-primary)] text-white"
                            : "text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)]"
                        }`}
                      >
                        <Sparkles size={12} />
                        AI 优化
                      </button>
                      <button
                        onClick={() => setClearConfirmId(section.id)}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-[var(--radius-sm)] text-[var(--color-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
                        title="清除内容"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={section.content}
                    onChange={(e) => updateSection(section.id, e.target.value)}
                    rows={section.id === "experience" || section.id === "projects" ? 12 : 5}
                    className={`w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] p-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)] resize-none font-[var(--font-body)] ${
                      isFlashing ? "bg-emerald-50/30" : ""
                    }`}
                    placeholder={`在此填写${section.title}内容...`}
                  />

                  <AnimatePresence>
                    {isOptimizing && (
                      <OptimizePanel
                        sectionId={section.id}
                        sectionContent={section.content}
                        fullCV={Object.fromEntries(sections.map((s) => [s.id, s.content]))}
                        targetJD={targetJD}
                        referenceResumes={referenceResumes.map(r => ({ id: r.id, name: r.name }))}
                        roleDirection={roleDirection}
                        onSelect={(content) => {
                          updateSection(section.id, content);
                          optimizedRef.current = true;
                          setActiveOptimizeSection(null);
                          setFlashSectionId(section.id);
                          setTimeout(() => setFlashSectionId(null), 1200);
                        }}
                        onClose={() => setActiveOptimizeSection(null)}
                      />
                    )}
                  </AnimatePresence>
                </PaperCard>
                </div>
              );
            })
          )}
        </div>

        {/* Clear confirmation modal */}
        <AnimatePresence>
          {clearConfirmId && (
            <>
              <motion.div
                className="fixed inset-0 bg-black/20 z-40"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setClearConfirmId(null)}
              />
              <motion.div
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              >
                <motion.div
                  className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] p-6 w-full max-w-sm shadow-[var(--shadow-lg)]"
                  initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
                >
                  <p className="text-[var(--color-text)] font-medium mb-2">确认清除</p>
                  <p className="text-sm text-[var(--color-muted)] mb-4">
                    确定要清除「{sections.find(s => s.id === clearConfirmId)?.title}」的全部内容吗？此操作不可撤销。
                  </p>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setClearConfirmId(null)}
                      className="px-3 py-1.5 text-sm rounded-[var(--radius-sm)] text-[var(--color-muted)] hover:bg-[var(--color-bg)] transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => {
                        updateSection(clearConfirmId, "");
                        setClearConfirmId(null);
                      }}
                      className="px-3 py-1.5 text-sm rounded-[var(--radius-sm)] bg-red-500 text-white hover:bg-red-600 transition-colors"
                    >
                      确认清除
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Right: JD Context + References + Match Details */}
        <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          {/* JD Context Card — always visible */}
          <PaperCard padding="md">
            <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] mb-3 flex items-center gap-2">
              <Search size={16} className="text-[var(--color-primary)]" />
              🎯 当前优化目标
            </h3>

            {selectedReport ? (
              <div className="space-y-3">
                {/* JD info display */}
                <div className="p-3 rounded-[var(--radius-sm)] bg-[var(--color-primary-muted)] space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏢</span>
                    <span className="font-medium text-[var(--color-text)]">{selectedReport.company}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📋</span>
                    <span className="text-sm text-[var(--color-text-soft)]">{selectedReport.role}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📊</span>
                    <span className="text-sm text-[var(--color-text-soft)]">
                      匹配度: <span className="font-bold text-[var(--color-primary)]">{matchPercent}%</span>
                    </span>
                  </div>
                  {/* Keywords pills */}
                  {keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {(keywords.filter(k => k.matched).length > 0
                        ? keywords.filter(k => k.matched).slice(0, 6)
                        : keywords.slice(0, 6)
                      ).map((kw) => (
                        <span
                          key={kw.label}
                          className={`text-xs px-1.5 py-0.5 rounded-full ${
                            kw.matched
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                              : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300"
                          }`}
                        >
                          {kw.label}
                        </span>
                      ))}
                      {keywords.length > 6 && (
                        <span className="text-xs text-[var(--color-muted)]">+{keywords.length - 6}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Switch JD button */}
                <button
                  onClick={() => { setSelectedJDId(null); setSelectedReport(null); }}
                  className="w-full text-xs text-[var(--color-primary)] hover:underline"
                >
                  更换 JD
                </button>
              </div>
            ) : (
              <div>
                {reports.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--color-muted)]">
                      选择一个已评估的 JD 开始针对性优化
                    </p>
                    <select
                      value={selectedJDId || ""}
                      onChange={(e) => analyzeJD(Number(e.target.value))}
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                    >
                      <option value="">选择已评估的 JD...</option>
                      {reports.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.company} — {r.role}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--color-muted)]">
                    暂无评估报告。先在 JD 管理中分析岗位，然后回来配对。
                  </p>
                )}
              </div>
            )}
          </PaperCard>

          {/* Reference Resume Library */}
          <PaperCard padding="md">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] flex items-center gap-2">
                <BookOpen size={16} className="text-[var(--color-primary)]" />
                参考简历
              </h3>
              <button
                onClick={() => setShowImportPanel(!showImportPanel)}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-[var(--radius-sm)] text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)] transition-colors"
              >
                <Plus size={12} />
                导入
              </button>
            </div>

            {/* Import panel */}
            <AnimatePresence>
              {showImportPanel && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mb-3"
                >
                  <div className="p-3 rounded-[var(--radius-sm)] bg-[var(--color-bg)] space-y-2">
                    {/* Import mode tabs */}
                    <div className="flex gap-1 p-0.5 rounded-[var(--radius-sm)] bg-[var(--color-divider)]">
                      <button
                        onClick={() => { setImportMode("paste"); setImportError(null); }}
                        className={`flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded-[var(--radius-sm)] transition-colors ${
                          importMode === "paste"
                            ? "bg-[var(--color-surface)] text-[var(--color-text)] font-medium shadow-sm"
                            : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                        }`}
                      >
                        <ClipboardPaste size={12} />
                        粘贴文本
                      </button>
                      <button
                        onClick={() => { setImportMode("upload"); setImportError(null); }}
                        className={`flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded-[var(--radius-sm)] transition-colors ${
                          importMode === "upload"
                            ? "bg-[var(--color-surface)] text-[var(--color-text)] font-medium shadow-sm"
                            : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                        }`}
                      >
                        <Upload size={12} />
                        上传文件
                      </button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <label className="block">
                        <span className="text-[10px] text-[var(--color-muted)]">岗位方向</span>
                        <input
                          value={importRoleCategory}
                          onChange={(e) => setImportRoleCategory(e.target.value)}
                          placeholder="AI产品经理 / AI运营 / AI售前"
                          className="mt-1 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1.5 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                        />
                      </label>
                      <div>
                        <span className="text-[10px] text-[var(--color-muted)]">可见性</span>
                        <div className="mt-1 flex rounded-[var(--radius-sm)] border border-[var(--color-border)] overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setImportVisibility("private")}
                            className={`flex items-center gap-1 px-2 py-1.5 text-xs ${
                              importVisibility === "private"
                                ? "bg-[var(--color-primary)] text-white"
                                : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
                            }`}
                          >
                            <Lock size={11} />
                            私有
                          </button>
                          <button
                            type="button"
                            onClick={() => setImportVisibility("team")}
                            className={`flex items-center gap-1 px-2 py-1.5 text-xs border-l border-[var(--color-border)] ${
                              importVisibility === "team"
                                ? "bg-[var(--color-primary)] text-white"
                                : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
                            }`}
                          >
                            <Users size={11} />
                            团队
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Paste mode */}
                    {importMode === "paste" && (
                      <>
                        <p className="text-xs text-[var(--color-muted)]">
                          粘贴优秀简历全文，AI 将自动解析为结构化分段
                        </p>
                        <textarea
                          value={importText}
                          onChange={(e) => setImportText(e.target.value)}
                          rows={5}
                          placeholder="在此粘贴简历全文..."
                          className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-sm)] p-2 text-xs text-[var(--color-text)] resize-none focus:outline-none focus:border-[var(--color-primary)]"
                        />
                      </>
                    )}

                    {/* Upload mode */}
                    {importMode === "upload" && (
                      <div
                        onDragOver={(e) => { e.preventDefault(); setImportDragOver(true); }}
                        onDragLeave={() => setImportDragOver(false)}
                        onDrop={handleFileDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-[var(--radius-md)] p-4 text-center cursor-pointer transition-colors ${
                          importDragOver
                            ? "border-[var(--color-primary)] bg-[var(--color-primary-muted)]"
                            : "border-[var(--color-border)] hover:border-[var(--color-primary)]"
                        }`}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".txt,.md,.doc,.docx,.pdf,.png,.jpg,.jpeg,.webp"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setImportFile(file);
                              setImportError(null);
                            }
                          }}
                          className="hidden"
                        />
                        {importFile ? (
                          <div className="space-y-1">
                            <p className="text-xs text-[var(--color-text)] font-medium truncate">{importFile.name}</p>
                            <p className="text-[10px] text-[var(--color-muted)]">
                              {(importFile.size / 1024).toFixed(1)} KB &middot; {importFile.type || "未知类型"}
                            </p>
                            <button
                              onClick={(e) => { e.stopPropagation(); setImportFile(null); }}
                              className="text-[10px] text-[var(--color-primary)] hover:underline"
                            >
                              移除
                            </button>
                          </div>
                        ) : (
                          <>
                            <Upload size={20} className="mx-auto text-[var(--color-muted)] mb-1" />
                            <p className="text-xs text-[var(--color-muted)]">
                              拖拽文件到此处或点击选择
                            </p>
                            <p className="text-[10px] text-[var(--color-muted)] mt-1">
                              支持 Word (.docx) / PDF / 图片 (.png/.jpg/.webp) / 文本 (.txt/.md)
                            </p>
                          </>
                        )}
                      </div>
                    )}

                    {importError && (
                      <p className="text-xs text-red-500">{importError}</p>
                    )}

                    {/* Rename prompt after import */}
                    {showRenamePrompt && (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-[var(--radius-md)] border border-emerald-200 dark:border-emerald-800 space-y-2">
                        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          <CheckCircle size={12} className="inline mr-1" />
                          解析成功！给这份简历起个名字吧：
                        </p>
                        <div className="flex gap-2">
                          <input
                            autoFocus
                            value={renameImportedValue}
                            onChange={(e) => setRenameImportedValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleRenameImported(); }}
                            className="flex-1 bg-white dark:bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-1.5 text-sm"
                            placeholder="输入简历名称..."
                          />
                          <button
                            onClick={handleRenameImported}
                            disabled={renameSaving || !renameImportedValue.trim()}
                            className="text-xs px-3 py-1.5 rounded-[var(--radius-sm)] bg-emerald-500 text-white disabled:opacity-50"
                          >
                            {renameSaving ? "保存中..." : "保存"}
                          </button>
                          <button
                            onClick={() => { setShowRenamePrompt(false); setShowImportPanel(false); }}
                            className="text-xs px-2 py-1.5 text-[var(--color-muted)]"
                          >
                            跳过
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={handleImportReference}
                        disabled={importLoading || (importMode === "paste" ? !importText.trim() : !importFile)}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] text-white disabled:opacity-50"
                      >
                        {importLoading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                        {importLoading ? "解析中..." : "导入并解析"}
                      </button>
                      <button
                        onClick={() => { setShowImportPanel(false); setImportText(""); setImportFile(null); setImportError(null); }}
                        className="text-xs px-3 py-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)]"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {referenceResumes.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
                {referenceResumes.map((ref) => (
                  <div
                    key={ref.id}
                    className="flex items-center gap-2 text-left px-2 py-1.5 rounded-[var(--radius-sm)] text-sm hover:bg-[var(--color-divider)] transition-colors group"
                  >
                    <BookOpen size={12} className="text-[var(--color-muted)] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="truncate text-[var(--color-text)]">{ref.name}</span>
                        {ref.visibility && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-primary-muted)] text-[var(--color-text-soft)] shrink-0">
                            {referenceVisibilityLabel(ref.visibility)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 text-[10px] text-[var(--color-muted)]">
                        {ref.roleCategory && <span className="truncate">{ref.roleCategory}</span>}
                        {ref.status && (
                          <span className={`px-1.5 py-0.5 rounded-full ${referenceStatusClass(ref.status)}`}>
                            {referenceStatusLabel(ref.status)}
                          </span>
                        )}
                        {typeof ref.qualityScore === "number" && (
                          <span className="inline-flex items-center gap-0.5">
                            <Gauge size={10} />
                            {Math.round(ref.qualityScore * 100)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-[var(--color-muted)] shrink-0">
                      {ref.source === "upload" ? "📄" : "📋"}
                    </span>
                    <span className="text-[10px] text-[var(--color-muted)] shrink-0">
                      {new Date(ref.created_at).toLocaleDateString("zh-CN")}
                    </span>
                    <button
                      onClick={() => handleViewReference(ref.id)}
                      disabled={viewingRefLoading}
                      className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-[var(--radius-sm)] text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)] opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    >
                      <Eye size={10} />
                      查看
                    </button>
                    {ref.ownedByUser !== false && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteReference(ref.id, ref.name); }}
                        className="p-0.5 text-[var(--color-muted)] hover:text-red-500 shrink-0 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-muted)]">
                暂无参考简历。导入行业优秀简历，AI 优化时自动参考其表达风格。
              </p>
            )}

          </PaperCard>

          {/* Match percentage */}
          {selectedReport && (
            <PaperCard padding="md">
              <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] mb-3 flex items-center gap-2">
                <Sparkles size={16} className="text-[var(--color-primary)]" />
                匹配度
              </h3>

              {analyzeLoading ? (
                <div className="flex items-center justify-center py-4 gap-2">
                  <Loader2 size={20} className="animate-spin text-[var(--color-primary)]" />
                  <span className="text-sm text-[var(--color-muted)]">AI 分析中...</span>
                </div>
              ) : (
                <>
                  <div className="text-center">
                    <span className="font-[family-name:var(--font-display)] text-4xl font-bold text-[var(--color-primary)]">
                      {matchPercent}%
                    </span>
                    <p className="text-xs text-[var(--color-muted)] mt-1">
                      {selectedReport.company} — {selectedReport.role}
                    </p>
                  </div>

                  {keywords.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                      <p className="text-xs text-[var(--color-muted)] mb-2">JD 关键词匹配</p>
                      {keywords.map((kw) => (
                        <div
                          key={kw.label}
                          className={`flex items-start gap-2 text-xs px-2 py-1 rounded-[var(--radius-sm)] ${
                            kw.matched
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                              : "bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-300"
                          }`}
                        >
                          {kw.matched ? <Check size={12} className="mt-0.5 shrink-0" /> : <X size={12} className="mt-0.5 shrink-0" />}
                          <div>
                            <span>{kw.label}</span>
                            {!kw.matched && kw.suggestion && (
                              <p className="text-[var(--color-muted)] mt-0.5">{kw.suggestion}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {missingTerms.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs text-[var(--color-muted)] mb-2">JD 要求但简历中缺失</p>
                      <div className="flex flex-wrap gap-1.5">
                        {missingTerms.map((term) => (
                          <span
                            key={term}
                            className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-300"
                          >
                            {term}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {sectionFeedback.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs text-[var(--color-muted)] mb-2">逐部分反馈</p>
                      {sectionFeedback.map((fb) => {
                        const sectionTitle = sections.find((s) => s.id === fb.sectionId)?.title || fb.sectionId;
                        return (
                          <div key={fb.sectionId} className="p-2 rounded-[var(--radius-sm)] bg-[var(--color-divider)]">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-[var(--color-text)]">{sectionTitle}</span>
                              <span className="text-xs text-[var(--color-muted)]">
                                强度: {"★".repeat(fb.strengthScore)}{"☆".repeat(5 - fb.strengthScore)}
                              </span>
                            </div>
                            {fb.notes.map((note, i) => (
                              <p key={i} className="text-xs text-[var(--color-text-soft)] ml-1">· {note}</p>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </PaperCard>
          )}

          {/* AI Suggestions */}
          {suggestions.length > 0 && (
            <PaperCard padding="md">
              <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] mb-3 flex items-center gap-2">
                <Sparkles size={16} className="text-[var(--color-primary)]" />
                AI 优化建议
              </h3>
              <div className="space-y-3">
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-[var(--radius-sm)] bg-[var(--color-primary-muted)] text-sm text-[var(--color-text-soft)]"
                  >
                    <p>{s}</p>
                    <div className="flex gap-2 mt-2">
                      <WarmButton
                        variant="soft"
                        size="sm"
                        onClick={() => {
                          setSuggestions((prev) => prev.filter((_, j) => j !== i));
                        }}
                      >
                        <Check size={12} className="mr-1" />
                        接受
                      </WarmButton>
                      <WarmButton
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSuggestions((prev) => prev.filter((_, j) => j !== i));
                        }}
                      >
                        <X size={12} className="mr-1" />
                        忽略
                      </WarmButton>
                    </div>
                  </div>
                ))}
              </div>
            </PaperCard>
          )}
        </div>
      </div>
      )}

      {/* Unsaved changes dialog */}
      <AnimatePresence>
        {showUnsavedDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
            onClick={() => setShowUnsavedDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-[var(--color-surface-raised)] rounded-[var(--radius-lg)] shadow-xl p-6 max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[var(--color-text)] font-medium mb-2">当前版本有未保存的更改</p>
              <p className="text-sm text-[var(--color-muted)] mb-4">是否放弃未保存的更改并切换版本？</p>
              <div className="flex gap-2 justify-end">
                <WarmButton
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowUnsavedDialog(false);
                    setPendingAction(null);
                  }}
                >
                  取消
                </WarmButton>
                <WarmButton
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setShowUnsavedDialog(false);
                    if (pendingAction) {
                      pendingAction();
                      setPendingAction(null);
                    }
                  }}
                >
                  放弃更改
                </WarmButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reference Viewer Modal */}
      {viewingRefDetail && (
        <ReferenceViewer
          resume={viewingRefDetail}
          allResumes={referenceResumes}
          onClose={() => { setViewingRefDetail(null); setViewingRefId(null); }}
          onNavigate={handleNavigateReference}
          onUpdate={handleUpdateReference}
        />
      )}
    </div>
  );
}
