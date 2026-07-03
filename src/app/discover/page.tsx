"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Zap, Clock, Building2, MapPin,
  EyeOff, ChevronRight, RefreshCw, AlertTriangle,
  X, Filter, Settings, ExternalLink, SkipForward,
  Eye, Plus, Save, Bot,
} from "lucide-react";
import {
  HandwritingTitle, WarmButton, PaperCard,
  StaggerList, StaggerItem,
} from "@/components/design";
import {
  DISCOVERY_VISIBLE_STATUSES,
  fetchDiscoveryJobDetail,
  getAgentEvaluationUrl,
  getWeakDuplicateHintCounts,
  jobFingerprint,
  jobStatusBadge,
  mergeJobDiscoveryItems,
  saveDiscoveryJobJD,
  timeAgo,
  type DiscoveryJDDetail,
} from "@/lib/job-discovery";
import { useToast } from "@/lib/use-toast";

// ── Types ───────────────────────────────────────────────────────────

interface JobItem {
  id: number;
  company: string;
  title: string;
  url: string;
  location: string;
  department: string;
  jd_id?: number;
  last_error?: string;
  status: "new" | "viewed" | "saved" | "evaluating" | "evaluated" | "dismissed";
  discovered_at: string;
}

interface ScanStatus {
  scanId: string;
  status: "pending" | "running" | "done" | "failed" | "canceled";
  companiesDone: number;
  companiesTotal: number;
  jobsFound: number;
  jobsNew: number;
  companies: { name: string; status: string; jobsFound: number; error?: string; level?: string | null }[];
  titleFilter?: { positive: string[]; negative: string[] };
  locationFilter?: string;
  maxResults?: number;
}

interface ScanHistoryEntry {
  scanId: string;
  createdAt: string;
  companiesDone: number;
  jobsFound: number;
  jobsNew: number;
  totalJobs: number;
  failedCompanies: { company: string; error: string; level: string }[];
  emptyCompanies?: { company: string; error: string; level: string }[];
  titleFilter?: { positive: string[]; negative: string[] };
  locationFilter?: string;
  maxResults?: number;
}

const DEFAULT_DISCOVERY_TITLE_KEYWORDS = "AI产品经理,大模型产品经理,Agent产品经理,数据产品经理,AI运营";
const DEFAULT_DISCOVERY_EXCLUDE_KEYWORDS = "实习,销售,客服,外包,劳务,兼职,电话销售,地推";

// ── Page ────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [scanning, setScanning] = useState(false);
  const [activeTab, setActiveTab] = useState<"results" | "sources" | "history">("results");
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [showDismissed, setShowDismissed] = useState(false);
  const [evalJob, setEvalJob] = useState<JobItem | null>(null);
  const [detail, setDetail] = useState<DiscoveryJDDetail | null>(null);
  const [manualBody, setManualBody] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [savingJD, setSavingJD] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());
  const [showScanIntro, setShowScanIntro] = useState(false);
  const [titleKeyword, setTitleKeyword] = useState(DEFAULT_DISCOVERY_TITLE_KEYWORDS);
  const [excludeKeyword, setExcludeKeyword] = useState(DEFAULT_DISCOVERY_EXCLUDE_KEYWORDS);
  const [locationFilter, setLocationFilter] = useState("");
  const [maxResults, setMaxResults] = useState(100);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { showToast } = useToast();

  useEffect(() => { setMounted(true); }, []);

  // ── Data fetching ────────────────────────────────────────────

  const fetchJobs = useCallback(async () => {
    try {
      const statuses = showDismissed ? ["dismissed"] : DISCOVERY_VISIBLE_STATUSES;
      const batches = await Promise.all(
        statuses.map(async (status) => {
          const res = await fetch(`/api/scan/jobs?status=${status}&limit=50`);
          if (!res.ok) return [] as JobItem[];
          const data = await res.json();
          return (data?.data?.jobs || []) as JobItem[];
        }),
      );
      setJobs(
        mergeJobDiscoveryItems(batches.flat()).sort((a, b) =>
          new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime()
        ),
      );
    } catch { /* ignore */ }
  }, [showDismissed]);

  const fetchHistory = useCallback(async (page = 1) => {
    try {
      const res = await fetch(`/api/scan/history?page=${page}&limit=10`);
      if (!res.ok) return;
      const data = await res.json();
      setHistory(data?.data?.history || []);
      setHistoryTotal(data?.data?.total || 0);
    } catch { /* ignore */ }
  }, []);

  const checkActiveScan = useCallback(async () => {
    try {
      const res = await fetch("/api/scan/status?active=true");
      if (!res.ok) return false;
      const data = await res.json();
      const scan = data?.data;
      if (scan && (scan.status === "running" || scan.status === "pending")) {
        setScanStatus(scan);
        setScanning(true);
        return true;
      }
      return false;
    } catch { return false; }
  }, []);

  const pollStatus = useCallback(async (scanId: string) => {
    try {
      const res = await fetch(`/api/scan/status?scanId=${scanId}`);
      if (!res.ok) return;
      const data = await res.json();
      const st = data?.data;
      if (!st) return;
      setScanStatus(st);
      if (st.status === "done" || st.status === "failed" || st.status === "canceled") {
        setScanning(false);
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        await fetchJobs();
        await fetchHistory();
        if (st.status === "done" && st.jobsNew > 0) {
          showToast(`岗位发现完成 — 发现 ${st.jobsFound} 个机会，${st.jobsNew} 个为新`);
        } else if (st.status === "canceled") {
          showToast("扫描已取消");
        }
      }
    } catch { /* ignore */ }
  }, [fetchJobs, fetchHistory, showToast]);

  // ── Init ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!mounted) return;
    (async () => {
      setLoading(true);
      await fetchJobs();
      const active = await checkActiveScan();
      if (!active) await fetchHistory();
      setLoading(false);
    })();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [mounted, fetchJobs, checkActiveScan, fetchHistory]);

  // ── Scan trigger ─────────────────────────────────────────────

  const startScan = async () => {
    const trimmedKeyword = titleKeyword.trim();
    if (!trimmedKeyword) {
      showToast("请先填写岗位名称或关键词", "error");
      return;
    }
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleKeyword: trimmedKeyword, excludeKeyword, location: locationFilter.trim(), maxResults }),
      });
      if (res.status === 409) {
        const data = await res.json();
        showToast("扫描已在运行中");
        setScanning(true);
        const existingScanId = data.existingScanId;
        setScanStatus(prev => prev || { scanId: existingScanId, status: "running", companiesDone: 0, companiesTotal: 0, jobsFound: 0, jobsNew: 0, companies: [], locationFilter, maxResults });
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(() => pollStatus(existingScanId), 3000);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.message || "启动扫描失败", "error");
        return;
      }
      const data = await res.json();
      setScanning(true);
      if (pollRef.current) clearInterval(pollRef.current);
      setScanStatus({ scanId: data.scanId, status: "pending", companiesDone: 0, companiesTotal: data.companiesTotal || 0, jobsFound: 0, jobsNew: 0, companies: [], titleFilter: { positive: [trimmedKeyword], negative: excludeKeyword.split(/[,，\s]+/).filter(Boolean) }, locationFilter: locationFilter.trim(), maxResults });
      pollRef.current = setInterval(() => pollStatus(data.scanId), 3000);
      setShowScanIntro(false);
    } catch {
      showToast("网络错误", "error");
    }
  };

  const cancelScan = async () => {
    let scanId = scanStatus?.scanId;
    try {
      if (!scanId) {
        const activeRes = await fetch("/api/scan/status?active=true");
        const activeJson = await activeRes.json().catch(() => ({}));
        scanId = activeJson?.data?.scanId;
      }
      const res = await fetch("/api/scan/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", scanId }),
      });
      if (!res.ok) {
        showToast("取消扫描失败", "error");
        return;
      }
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      setScanning(false);
      setScanStatus(prev => prev ? { ...prev, status: "canceled" } : prev);
      await fetchHistory();
      showToast("扫描已取消");
    } catch {
      showToast("网络错误", "error");
    }
  };

  // Job actions

  const dismissJob = (jobId: number) => {
    setDismissedIds(prev => new Set(prev).add(jobId));
    showToast("已跳过");
    fetch(`/api/scan/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    }).catch(() => {});
  };

  const undoDismiss = (jobId: number) => {
    setDismissedIds(prev => { const s = new Set(prev); s.delete(jobId); return s; });
    fetch(`/api/scan/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "new" }),
    }).catch(() => {});
  };

  const openJobDetail = async (job: JobItem) => {
    setEvalJob(job);
    setDetail(null);
    setManualBody("");
    setDetailError("");
    setDetailLoading(true);
    try {
      const result = await fetchDiscoveryJobDetail(job);
      if (result.detail) {
        setDetail(result.detail);
        setManualBody(result.manualBody);
      } else {
        setDetailError(result.error);
      }
      await fetchJobs();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "JD 加载失败");
    } finally {
      setDetailLoading(false);
    }
  };

  const saveDiscoveryJD = async (evaluate = false) => {
    if (!evalJob) return null;
    const jobId = evalJob.id;
    const jdBody = (manualBody || detail?.body || "").trim();
    if (jdBody.length < 50) {
      showToast("JD 正文太短，请先粘贴完整 JD", "error");
      return null;
    }
    setSavingJD(true);
    try {
      const { jdId } = await saveDiscoveryJobJD(evalJob.id, {
        jdBody,
        company: detail?.company || evalJob.company,
        role: detail?.role || evalJob.title,
        evaluate,
      });
      const nextStatus: JobItem["status"] = evaluate ? "evaluating" : "saved";
      setEvalJob((prev) => prev && prev.id === jobId ? { ...prev, jd_id: jdId, status: nextStatus } : prev);
      setJobs((prev) => prev.map((job) => job.id === jobId ? { ...job, jd_id: jdId, status: nextStatus } : job));
      await fetchJobs();
      return jdId;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存 JD 失败", "error");
      return null;
    } finally {
      setSavingJD(false);
    }
  };

  const saveToLibrary = async () => {
    const jdId = await saveDiscoveryJD(false);
    if (jdId) showToast("已保存到 JD 库");
  };

  const evaluateWithAgent = async () => {
    const jdId = await saveDiscoveryJD(true);
    if (!jdId) return;
    router.push(getAgentEvaluationUrl(jdId));
  };

  const goToJDManagement = () => {
    router.push("/evaluate/jds");
  };

  // ── Skeleton ─────────────────────────────────────────────────

  if (!mounted) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-[var(--color-divider)] rounded w-40" />
        <div className="h-64 bg-[var(--color-divider)] rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  // ── Derived ──────────────────────────────────────────────────

  const visibleJobs = showDismissed ? jobs : jobs.filter(j => !dismissedIds.has(j.id));
  const weakDuplicateHintCounts = getWeakDuplicateHintCounts(visibleJobs);
  const errorCompanies = scanStatus?.companies?.filter(c => c.status === "error") || [];
  const emptyCompanies = scanStatus?.companies?.filter(c => c.status === "empty") || [];
  const hasErrors = errorCompanies.length > 0;
  const allFailed = scanStatus?.status === "failed"
    || (scanStatus?.companiesTotal || 0) > 0 && errorCompanies.length === scanStatus?.companiesTotal;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-[var(--color-muted)] text-sm mb-1">
            {loading ? "加载中..."
              : visibleJobs.length > 0 ? `${visibleJobs.length} 个新机会`
              : "企业招聘官网 · 自动发现"}
          </p>
          <HandwritingTitle as="h1">岗位发现工作台</HandwritingTitle>
        </div>
        <div className="flex items-center gap-2">
          <WarmButton variant="ghost" size="sm" onClick={() => setShowScanIntro(!showScanIntro)}>
            <Settings size={14} className="mr-1" />
            说明
          </WarmButton>
          {scanning && (
            <WarmButton variant="ghost" size="sm" onClick={cancelScan}>
              <X size={14} className="mr-1" />
              取消扫描
            </WarmButton>
          )}
        </div>
      </div>

      <PaperCard padding="sm">
        <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_0.8fr_0.7fr_auto] items-end">
          <label className="block">
            <span className="block text-xs font-medium text-[var(--color-muted)] mb-1">岗位名称 / 关键词</span>
            <input
              value={titleKeyword}
              onChange={(e) => setTitleKeyword(e.target.value)}
              placeholder="例如：AI产品经理、大模型产品经理、数据产品经理"
              disabled={scanning}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-[var(--color-muted)] mb-1">排除关键词</span>
            <input
              value={excludeKeyword}
              onChange={(e) => setExcludeKeyword(e.target.value)}
              placeholder="例如：实习,销售,客服,外包"
              disabled={scanning}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-[var(--color-muted)] mb-1">就业地点</span>
            <input
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              placeholder="留空为全国，例如：北京、上海、杭州、深圳"
              disabled={scanning}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-[var(--color-muted)] mb-1">最多结果</span>
            <select
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              disabled={scanning}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
            >
              <option value={100}>100</option>
              <option value={50}>50</option>
              <option value={20}>20</option>
            </select>
          </label>
          <WarmButton variant="primary" size="sm" onClick={startScan} disabled={scanning || !titleKeyword.trim()}>
            {scanning ? (
              <>
                <RefreshCw size={14} className="mr-1 animate-spin" />
                扫描中
              </>
            ) : (
              <>
                <Search size={14} className="mr-1" />
                开始岗位发现
              </>
            )}
          </WarmButton>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--color-muted)]">
          <span>流程：公司官网优先，0 个新结果时补扫猎聘 / 前程无忧 / 智联。</span>
          <span>地点：{locationFilter.trim() || "全国"}</span>
          <span>上限：本次最多展示 {maxResults} 个岗位机会</span>
        </div>
      </PaperCard>

      {/* ── Scan intro banner ──────────────────────────────────── */}
      <AnimatePresence>
        {showScanIntro && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <PaperCard padding="md">
              <div className="flex items-start gap-3">
                <Zap size={16} className="text-[var(--color-primary)] mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)] mb-2">扫描说明</p>
                  <p className="text-xs text-[var(--color-muted)] mb-2">
                    点击「开始岗位发现」后，后台 Worker 会先抓取配置公司的招聘官网；如果没有命中新机会，再按同一岗位、地点和数量上限补扫猎聘 / 前程无忧 / 智联。
                    扫描过程取决于公司数量和平台连接情况，你可以随时取消。
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    也可以命令行执行: <code className="text-[var(--color-text)] bg-[var(--color-bg)] px-1 rounded">npm run scan:once</code>
                  </p>
                </div>
              </div>
            </PaperCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Summary bar ────────────────────────────────────────── */}
      {!loading && visibleJobs.length > 0 && !scanning && (
        <PaperCard padding="sm">
          <div className="flex items-center gap-6 flex-wrap text-sm">
            <span className="flex items-center gap-1.5 text-[var(--color-text)] font-medium">
              <Zap size={14} className="text-[var(--color-primary)]" />
              {visibleJobs.length} 个新机会
            </span>
            <span className="flex items-center gap-1.5 text-[var(--color-muted)]">
              <Building2 size={14} />
              {new Set(visibleJobs.map(j => j.company)).size} 家公司
            </span>
            <span className="flex items-center gap-1.5 text-[var(--color-muted)]">
              <Filter size={14} />
              过滤: 含&ldquo;AI产品经理&rdquo; / 排除&ldquo;实习&rdquo;
            </span>
          </div>
        </PaperCard>
      )}

      {/* ── Scanning progress ──────────────────────────────────── */}
      <AnimatePresence>
        {scanning && scanStatus && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <PaperCard padding="sm">
              <div className="flex items-center gap-4">
                <RefreshCw size={16} className="animate-spin text-[var(--color-primary)]" />
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-[var(--color-muted)] mb-1">
                    <span>正在扫描 {scanStatus.companiesDone}/{scanStatus.companiesTotal} 家公司</span>
                    <span>已发现 {scanStatus.jobsFound} 个岗位机会 / 上限 {scanStatus.maxResults || maxResults}</span>
                  </div>
                  <div className="h-1.5 bg-[var(--color-divider)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-500"
                      style={{ width: `${scanStatus.companiesTotal ? (scanStatus.companiesDone / scanStatus.companiesTotal) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
              {scanStatus.companies?.length > 0 && (
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {scanStatus.companies.slice(0, 12).map(c => (
                    <span key={c.name}
                      className={`text-xs px-1.5 py-0.5 rounded-full ${
                        c.status === "error" ? "bg-red-50 text-red-600"
                        : c.jobsFound > 0 ? "bg-green-50 text-green-700"
                        : "bg-[var(--color-divider)] text-[var(--color-muted)]"
                      }`}>
                      {c.name.slice(0, 3)} {c.jobsFound || ""}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--color-muted)]">
                <span>岗位：{scanStatus.titleFilter?.positive?.join("、") || titleKeyword || "未设置"}</span>
                <span>地点：{scanStatus.locationFilter || locationFilter || "全国"}</span>
                <span>来源：公司官网优先，必要时补扫招聘平台</span>
              </div>
              <div className="mt-3 flex justify-end">
                <WarmButton variant="ghost" size="sm" onClick={cancelScan}>
                  <X size={13} className="mr-1" />
                  取消扫描
                </WarmButton>
              </div>
            </PaperCard>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {emptyCompanies.length > 0 && !scanning && visibleJobs.length === 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <PaperCard padding="md" className="!border-amber-200">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--color-text)]">本次没有匹配到岗位机会</p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    当前条件是「{scanStatus?.titleFilter?.positive?.join("、") || titleKeyword || "未设置"}」/「{scanStatus?.locationFilter || locationFilter || "全国"}」，可以放宽岗位关键词或地点后再扫。
                  </p>
                  <div className="mt-2 space-y-1">
                    {emptyCompanies.slice(0, 5).map(c => (
                      <p key={c.name} className="text-xs text-[var(--color-muted)]">
                        {c.name}: {c.error || "zero results"}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </PaperCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error banner ───────────────────────────────────────── */}
      <AnimatePresence>
        {hasErrors && !scanning && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <PaperCard padding="md" className={allFailed ? "!border-red-200" : "!border-amber-200"}>
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className={allFailed ? "text-red-500 mt-0.5" : "text-amber-500 mt-0.5"} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--color-text)]">
                    {allFailed ? "所有公司扫描失败" : `${errorCompanies.length} 家公司扫描失败`}
                  </p>
                  <div className="mt-2 space-y-1">
                    {errorCompanies.slice(0, 5).map(c => (
                      <p key={c.name} className="text-xs text-[var(--color-muted)]">
                        {c.name}: {c.error || "未知错误"}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </PaperCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tab bar ────────────────────────────────────────────── */}
      <div className="flex gap-1 p-0.5 bg-[var(--color-divider)] rounded-[var(--radius-md)] w-fit">
        {[
          { id: "results" as const, label: "岗位机会" },
          { id: "sources" as const, label: "扫描源" },
          { id: "history" as const, label: "扫描历史" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-[var(--radius-sm)] text-sm transition-colors ${
              activeTab === tab.id
                ? "bg-[var(--color-surface)] text-[var(--color-text)] font-medium"
                : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "results" && (
        <div className="flex gap-1 p-0.5 bg-[var(--color-divider)] rounded-[var(--radius-md)] w-fit">
          <button
            type="button"
            onClick={() => setShowDismissed(false)}
            className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-xs transition-colors ${
              !showDismissed ? "bg-[var(--color-surface)] text-[var(--color-text)] font-medium" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            岗位机会
          </button>
          <button
            type="button"
            onClick={() => setShowDismissed(true)}
            className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-xs transition-colors ${
              showDismissed ? "bg-[var(--color-surface)] text-[var(--color-text)] font-medium" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            已跳过
          </button>
        </div>
      )}

      {/* ── Tab: Results ───────────────────────────────────────── */}
      {activeTab === "results" && (
        <>
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <PaperCard key={i} padding="md" className="animate-pulse">
                  <div className="h-4 bg-[var(--color-divider)] rounded w-24 mb-2" />
                  <div className="h-5 bg-[var(--color-divider)] rounded w-64 mb-2" />
                  <div className="h-3 bg-[var(--color-divider)] rounded w-40" />
                </PaperCard>
              ))}
            </div>
          ) : visibleJobs.length === 0 ? (
            <div className="max-w-xl mx-auto py-16 text-center space-y-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-primary-muted)] flex items-center justify-center">
                <Search size={24} className="text-[var(--color-primary)]" />
              </div>
              <HandwritingTitle as="h2">尚未开始岗位发现</HandwritingTitle>
              <p className="text-[var(--color-muted)] text-sm">点击「开始岗位发现」自动抓取国内目标公司的招聘官网</p>
              <WarmButton variant="primary" size="sm" onClick={startScan}>开始岗位发现</WarmButton>
            </div>
          ) : (
            <StaggerList className="grid gap-3 sm:grid-cols-2">
              {visibleJobs.map(job => (
                <StaggerItem key={job.id}>
                  <PaperCard padding="md" hover="lift" className="relative">
                    {(() => {
                      const badge = jobStatusBadge(job.status);
                      return (
                        <span className={`absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      );
                    })()}
                    <div className="space-y-2 pr-16">
                      <p className="text-xs text-[var(--color-muted)] font-medium uppercase tracking-wide">{job.company}</p>
                      <p className="text-sm font-medium text-[var(--color-text)] line-clamp-2 leading-snug">{job.title}</p>
                      <div className="flex items-center gap-3 text-xs text-[var(--color-muted)] flex-wrap">
                        {job.location && <span className="flex items-center gap-1"><MapPin size={11} />{job.location}</span>}
                        {job.department && <span className="flex items-center gap-1"><Building2 size={11} />{job.department}</span>}
                        <span className="flex items-center gap-1"><Clock size={11} />{timeAgo(job.discovered_at)}</span>
                        {(weakDuplicateHintCounts.get(jobFingerprint(job)) || 0) > 0 && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 border border-amber-100">
                            可能重复 +{weakDuplicateHintCounts.get(jobFingerprint(job))}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <WarmButton variant="soft" size="sm" onClick={() => openJobDetail(job)}>
                          <Eye size={12} className="mr-1" />查看 JD
                        </WarmButton>
                        <WarmButton variant="ghost" size="sm" onClick={() => openJobDetail(job)}>
                          <Bot size={12} className="mr-1" />Agent 评估
                        </WarmButton>
                        {job.status === "dismissed" || dismissedIds.has(job.id) ? (
                          <WarmButton variant="ghost" size="sm" onClick={() => undoDismiss(job.id)}>
                            <Plus size={12} className="mr-1" />恢复
                          </WarmButton>
                        ) : (
                          <WarmButton variant="ghost" size="sm" onClick={() => dismissJob(job.id)}>
                            <SkipForward size={12} className="mr-1" />跳过
                          </WarmButton>
                        )}
                        {job.jd_id ? (
                          <WarmButton variant="ghost" size="sm" onClick={goToJDManagement}>
                            <ChevronRight size={12} className="mr-1" />去 JD 管理
                          </WarmButton>
                        ) : null}
                        <a href={job.url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] flex items-center gap-0.5 ml-auto">
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    </div>
                  </PaperCard>
                </StaggerItem>
              ))}
            </StaggerList>
          )}
        </>
      )}

      {/* ── Tab: Sources ────────────────────────────────────────── */}
      {activeTab === "sources" && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-muted)]">国内目标公司 · 官网优先 · 平台补扫</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { name: "大厂产品与数据", desc: "字节/腾讯/阿里/百度/美团/快手/京东/小米/拼多多", color: "bg-blue-50 text-blue-700" },
              { name: "内容与社区", desc: "小红书/B站/网易/滴滴等，重点看产品、运营、数据岗位", color: "bg-purple-50 text-purple-700" },
              { name: "AI 与硬件", desc: "华为/大疆/米哈游/理想等，优先发现 AI、Agent、数据产品机会", color: "bg-amber-50 text-amber-700" },
            ].map(g => (
              <PaperCard key={g.name} padding="sm">
                <p className={`text-xs px-2 py-0.5 rounded-full inline-block mb-2 ${g.color}`}>{g.name}</p>
                <p className="text-xs text-[var(--color-muted)]">{g.desc}</p>
              </PaperCard>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: History ────────────────────────────────────────── */}
      {activeTab === "history" && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <p className="text-center text-[var(--color-muted)] text-sm py-8">暂无扫描历史</p>
          ) : (
            <>
              {history.map(entry => (
                <PaperCard key={entry.scanId} padding="md" hover="lift">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        {new Date(entry.createdAt).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-[var(--color-muted)]">
                        <span>发现 {entry.jobsFound} 个（+{entry.jobsNew} 新）</span>
                        <span>{entry.titleFilter?.positive?.join("、") || "未记录关键词"}</span>
                        <span>{entry.locationFilter || "全国"}</span>
                        <span>上限 {entry.maxResults || 50}</span>
                        <span>{entry.companiesDone} 家公司</span>
                        {entry.failedCompanies?.length > 0 && (
                          <span className="text-amber-600">{entry.failedCompanies.length} 家失败</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-[var(--color-muted)]" />
                  </div>
                </PaperCard>
              ))}
              {historyTotal > history.length && (
                <div className="text-center pt-2">
                  <WarmButton variant="ghost" size="sm" onClick={() => { const np = historyPage + 1; setHistoryPage(np); fetchHistory(np); }}>
                    加载更多
                  </WarmButton>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Eval slide-over panel ──────────────────────────────── */}
      <AnimatePresence>
        {evalJob && (
          <>
            <motion.div className="fixed inset-0 bg-black/20 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEvalJob(null)} />
            <motion.div
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[var(--color-surface)] border-l border-[var(--color-border)] z-50 shadow-[var(--shadow-lg)] overflow-y-auto"
              initial={{ x: 320 }} animate={{ x: 0 }} exit={{ x: 320 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
            >
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <HandwritingTitle as="h2" className="text-lg">JD 详情</HandwritingTitle>
                  <button onClick={() => setEvalJob(null)} className="p-1 rounded-full hover:bg-[var(--color-divider)] transition-colors">
                    <X size={18} className="text-[var(--color-muted)]" />
                  </button>
                </div>
                <PaperCard padding="md">
                  <p className="text-xs text-[var(--color-muted)] mb-1">{evalJob.company}</p>
                  <p className="text-sm font-medium text-[var(--color-text)]">{evalJob.title}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs">
                    {evalJob.location && <span className="text-[var(--color-muted)]">{evalJob.location}</span>}
                    <a href={evalJob.url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">
                      查看原链接 <ExternalLink size={10} className="inline" />
                    </a>
                  </div>
                </PaperCard>
                {detailLoading ? (
                  <div className="py-10 text-center text-sm text-[var(--color-muted)]">
                    <RefreshCw size={16} className="animate-spin mx-auto mb-2" />
                    正在读取 JD 正文...
                  </div>
                ) : (
                  <div className="space-y-3">
                    {detailError && (
                      <div className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        {detailError}
                      </div>
                    )}
                    <label className="text-xs font-medium text-[var(--color-muted)]">JD 正文</label>
                    <textarea
                      value={manualBody}
                      onChange={(e) => setManualBody(e.target.value)}
                      placeholder="如果自动抓取失败，把 JD 正文粘贴到这里。"
                      className="min-h-[280px] w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm leading-relaxed text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <WarmButton variant="soft" size="md" onClick={saveToLibrary} disabled={savingJD || detailLoading}>
                        <Save size={14} className="mr-1" />保存到 JD 库
                      </WarmButton>
                      <WarmButton variant="primary" size="md" onClick={evaluateWithAgent} disabled={savingJD || detailLoading}>
                        <Bot size={14} className="mr-1" />让 Agent 评估
                      </WarmButton>
                    </div>
                    <WarmButton variant="ghost" size="sm" className="w-full" onClick={() => dismissJob(evalJob.id)}>
                      <SkipForward size={14} className="mr-1" />跳过
                    </WarmButton>
                    {evalJob.jd_id ? (
                      <WarmButton variant="ghost" size="sm" className="w-full" onClick={goToJDManagement}>
                        <ChevronRight size={14} className="mr-1" />去 JD 管理
                      </WarmButton>
                    ) : null}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
