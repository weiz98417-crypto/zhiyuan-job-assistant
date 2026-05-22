"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Zap, Clock, Building2, MapPin,
  EyeOff, ChevronRight, RefreshCw, AlertTriangle,
  X, Filter, Settings, ExternalLink, SkipForward,
  Eye, Plus,
} from "lucide-react";
import {
  HandwritingTitle, WarmButton, PaperCard,
  StaggerList, StaggerItem,
} from "@/components/design";
import { useToast } from "@/lib/use-toast";

// ── Types ───────────────────────────────────────────────────────────

interface JobItem {
  id: number;
  company: string;
  title: string;
  url: string;
  location: string;
  department: string;
  status: "new" | "dismissed" | "evaluated";
  discovered_at: string;
}

interface ScanStatus {
  scanId: string;
  status: "pending" | "running" | "done" | "failed";
  companiesDone: number;
  companiesTotal: number;
  jobsFound: number;
  jobsNew: number;
  companies: { name: string; status: string; jobsFound: number; error?: string }[];
}

interface ScanHistoryEntry {
  scanId: string;
  createdAt: string;
  companiesDone: number;
  jobsFound: number;
  jobsNew: number;
  totalJobs: number;
  failedCompanies: { company: string; error: string; level: string }[];
}

// ── Helpers ─────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

// ── Page ────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const [mounted, setMounted] = useState(false);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [scanning, setScanning] = useState(false);
  const [activeTab, setActiveTab] = useState<"results" | "sources" | "history">("results");
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [evalJob, setEvalJob] = useState<JobItem | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());
  const [showScanIntro, setShowScanIntro] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { showToast } = useToast();

  useEffect(() => { setMounted(true); }, []);

  // ── Data fetching ────────────────────────────────────────────

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/scan/jobs?status=new&limit=50");
      if (!res.ok) return;
      const data = await res.json();
      setJobs(data?.data?.jobs || []);
    } catch { /* ignore */ }
  }, []);

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
      if (scan && scan.status === "running") {
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
      if (st.status === "done" || st.status === "failed") {
        setScanning(false);
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        await fetchJobs();
        await fetchHistory();
        if (st.status === "done" && st.jobsNew > 0) {
          showToast(`扫描完成 — 发现 ${st.jobsFound} 个职位，${st.jobsNew} 个为新`);
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
    try {
      const res = await fetch("/api/scan", { method: "POST" });
      if (res.status === 409) {
        const data = await res.json();
        showToast("扫描已在运行中");
        setScanning(true);
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(() => pollStatus(data.existingScanId), 3000);
        return;
      }
      if (!res.ok) {
        showToast("启动扫描失败", "error");
        return;
      }
      const data = await res.json();
      setScanning(true);
      if (pollRef.current) clearInterval(pollRef.current);
      setScanStatus({ scanId: data.scanId, status: "pending", companiesDone: 0, companiesTotal: data.companiesTotal || 32, jobsFound: 0, jobsNew: 0, companies: [] });
      pollRef.current = setInterval(() => pollStatus(data.scanId), 3000);
      setShowScanIntro(false);
    } catch {
      showToast("网络错误", "error");
    }
  };

  // ── Job actions ──────────────────────────────────────────────

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

  const visibleJobs = jobs.filter(j => !dismissedIds.has(j.id));
  const errorCompanies = scanStatus?.companies?.filter(c => c.status === "error") || [];
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
          <HandwritingTitle as="h1">职位发现</HandwritingTitle>
        </div>
        <div className="flex items-center gap-2">
          <WarmButton variant="ghost" size="sm" onClick={() => setShowScanIntro(!showScanIntro)}>
            <Settings size={14} className="mr-1" />
            说明
          </WarmButton>
          <WarmButton
            variant="primary"
            size="sm"
            onClick={startScan}
            disabled={scanning}
          >
            {scanning ? (
              <span className="flex items-center gap-2">
                <RefreshCw size={14} className="animate-spin" />
                扫描中 ({scanStatus?.companiesDone || 0}/{scanStatus?.companiesTotal || "?"})
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Search size={14} />
                开始扫描
              </span>
            )}
          </WarmButton>
        </div>
      </div>

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
                    点击「开始扫描」后，后台 Worker 会自动打开浏览器抓取 portals.yml 中配置的 32 家公司招聘官网。
                    扫描过程约 2-5 分钟，你可以离开页面，回来刷新即可。
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
              {visibleJobs.length} 个新职位
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
                    <span>已发现 {scanStatus.jobsFound} 个职位</span>
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
          { id: "results" as const, label: "新职位" },
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
              <HandwritingTitle as="h2">尚未扫描职位</HandwritingTitle>
              <p className="text-[var(--color-muted)] text-sm">点击「开始扫描」自动抓取 32 家目标公司的招聘官网</p>
              <WarmButton variant="primary" size="sm" onClick={startScan}>开始扫描</WarmButton>
            </div>
          ) : (
            <StaggerList className="grid gap-3 sm:grid-cols-2">
              {visibleJobs.map(job => (
                <StaggerItem key={job.id}>
                  <PaperCard padding="md" hover="lift" className="relative">
                    {/* NEW badge */}
                    {job.status === "new" && (
                      <span className="absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full bg-[var(--color-primary)] text-white font-medium">
                        NEW
                      </span>
                    )}
                    <div className="space-y-2">
                      <p className="text-xs text-[var(--color-muted)] font-medium uppercase tracking-wide">{job.company}</p>
                      <p className="text-sm font-medium text-[var(--color-text)] line-clamp-2 leading-snug">{job.title}</p>
                      <div className="flex items-center gap-3 text-xs text-[var(--color-muted)] flex-wrap">
                        {job.location && <span className="flex items-center gap-1"><MapPin size={11} />{job.location}</span>}
                        {job.department && <span className="flex items-center gap-1"><Building2 size={11} />{job.department}</span>}
                        <span className="flex items-center gap-1"><Clock size={11} />{timeAgo(job.discovered_at)}</span>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <WarmButton variant="soft" size="sm" onClick={() => setEvalJob(job)}>
                          <Eye size={12} className="mr-1" />评估
                        </WarmButton>
                        <WarmButton variant="ghost" size="sm" onClick={() => dismissJob(job.id)}>
                          <SkipForward size={12} className="mr-1" />跳过
                        </WarmButton>
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
          <p className="text-sm text-[var(--color-muted)]">32 家公司 · 3 种 ATS 类型</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { name: "Moka 系 (12家)", desc: "字节/美团/快手/滴滴/小米/B站/小红书/网易/知乎/理想/蔚来/得物", color: "bg-blue-50 text-blue-700" },
              { name: "北森系 (5家)", desc: "京东/比亚迪/贝壳/携程/唯品会", color: "bg-purple-50 text-purple-700" },
              { name: "自定义 (15家)", desc: "腾讯/阿里/蚂蚁/百度/拼多多/米哈游/大疆/DeepSeek等 — LLM提取", color: "bg-amber-50 text-amber-700" },
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
                  <HandwritingTitle as="h2" className="text-lg">职位评估</HandwritingTitle>
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
                <div className="text-center py-8 text-sm text-[var(--color-muted)]">
                  <p>评估功能由 AI Agent 处理</p>
                  <p className="mt-1">点击下方按钮送入评估管道</p>
                </div>
                <WarmButton variant="primary" size="md" className="w-full"
                  onClick={async () => {
                    try {
                      await fetch("/api/pipeline/enqueue", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ url: evalJob.url, company: evalJob.company, title: evalJob.title }),
                      });
                      showToast("已送入评估管道");
                      await fetch(`/api/scan/jobs/${evalJob.id}`, {
                        method: "PATCH", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "evaluated" }),
                      });
                      setEvalJob(null);
                      fetchJobs();
                    } catch { showToast("发送失败", "error"); }
                  }}>
                  <ExternalLink size={14} className="mr-1" />送入评估管道
                </WarmButton>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
