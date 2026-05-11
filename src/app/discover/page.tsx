"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Plus,
  X,
  Settings,
  Clock,
  ExternalLink,
  RefreshCw,
  Zap,
  Eye,
  SkipForward,
} from "lucide-react";
import {
  HandwritingTitle,
  WarmButton,
  PaperCard,
} from "@/components/design";

interface ScanSource {
  company: string;
  platform: string;
  enabled: boolean;
}

interface ScanResult {
  id: string;
  company: string;
  role: string;
  platform: string;
  url: string;
  foundAt: string;
  status: "new" | "evaluated" | "skipped";
  snippet?: string;
}

interface ScanHistoryEntry {
  date: string;
  resultsFound: number;
  newCount: number;
}

export default function DiscoverPage() {
  const [sources, setSources] = useState<ScanSource[]>([]);
  const [keywords, setKeywords] = useState({
    positive: ["AI产品经理", "AI运营", "大模型", "AI解决方案", "AI项目经理", "AI增长"],
    negative: ["实习生", "实习", "数据分析师", "算法工程师", "Golang", "Java后端"],
  });
  const [results, setResults] = useState<ScanResult[]>([]);
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const [hasCLIData, setHasCLIData] = useState(false);
  const [lastScanDate, setLastScanDate] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [newKeyword, setNewKeyword] = useState("");
  const [newNegKeyword, setNewNegKeyword] = useState("");
  const [activeTab, setActiveTab] = useState<"results" | "sources" | "history">("results");
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [selectedResult, setSelectedResult] = useState<ScanResult | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    async function fetchScanStatus() {
      try {
        const res = await fetch("/api/scan/status");
        if (res.ok) {
          const result = await res.json();
          if (result.success && result.data) {
            setSources(result.data.sources || []);
            setResults(result.data.results || []);
            setHistory(result.data.history || []);
            setHasCLIData(result.data.hasData || false);
            setLastScanDate(result.data.lastScanDate || null);
          }
        }
      } catch {
        // API unavailable, stay with empty state
      } finally {
        setDataLoading(false);
        setMounted(true);
      }
    }
    fetchScanStatus();
  }, []);

  const triggerScan = () => {
    // Scanning is CLI-only. Show instructions.
    setScanning(true);
    setTimeout(() => setScanning(false), 3000);
  };

  const skipResult = (id: string) => {
    setResults((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "skipped" as const } : r))
    );
  };

  const addKeyword = (type: "positive" | "negative") => {
    const val = type === "positive" ? newKeyword : newNegKeyword;
    if (!val.trim()) return;
    setKeywords((prev) => ({
      ...prev,
      [type]: [...prev[type], val.trim()],
    }));
    if (type === "positive") setNewKeyword("");
    else setNewNegKeyword("");
  };

  const removeKeyword = (type: "positive" | "negative", keyword: string) => {
    setKeywords((prev) => ({
      ...prev,
      [type]: prev[type].filter((k) => k !== keyword),
    }));
  };

  const activeResults = results.filter((r) => r.status === "new");

  if (!mounted) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-[var(--color-divider)] rounded w-40" />
        <div className="h-64 bg-[var(--color-divider)] rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-[var(--color-muted)] text-sm mb-1">
            {dataLoading ? "加载中..." : `${activeResults.length} 个新机会${lastScanDate ? ` · 上次扫描 ${lastScanDate}` : ""}`}
          </p>
          <HandwritingTitle as="h1">职位发现</HandwritingTitle>
        </div>
        <WarmButton variant="primary" size="sm" onClick={triggerScan}>
          <RefreshCw size={16} className="mr-1.5" />
          扫描说明
        </WarmButton>
      </div>

      {/* CLI Instructions */}
      <AnimatePresence>
        {scanning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <PaperCard padding="md">
              <div className="flex items-start gap-3">
                <Zap size={16} className="text-[var(--color-primary)] mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)] mb-2">扫描通过 CLI 执行</p>
                  <p className="text-xs text-[var(--color-muted)] mb-2">
                    职位扫描是命令行操作，不在浏览器中运行。使用以下命令：
                  </p>
                  <code className="block text-xs bg-[var(--color-bg)] rounded-[var(--radius-sm)] p-2 text-[var(--color-text)] mb-2">
                    node scan.mjs
                  </code>
                  <p className="text-xs text-[var(--color-muted)]">
                    扫描结果会写入 data/pipeline.md 和 data/scan-history.tsv，页面会自动读取显示。
                  </p>
                </div>
              </div>
            </PaperCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No CLI data banner */}
      {!dataLoading && !hasCLIData && (
        <PaperCard padding="md">
          <div className="flex items-start gap-3">
            <Settings size={16} className="text-[var(--color-muted)] mt-0.5" />
            <div>
              <p className="text-sm font-medium text-[var(--color-text)] mb-1">暂无扫描数据</p>
              <p className="text-xs text-[var(--color-muted)]">
                配置 portals.yml 和 keywords 后，运行 <code className="text-[var(--color-text)]">node scan.mjs</code> 开始扫描。
                扫描结果会自动出现在这里。
              </p>
            </div>
          </div>
        </PaperCard>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-0.5 bg-[var(--color-divider)] rounded-[var(--radius-md)] w-fit">
        {[
          { id: "results" as const, label: "新职位" },
          { id: "sources" as const, label: "扫描源" },
          { id: "history" as const, label: "扫描历史" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-[var(--radius-sm)] text-sm transition-colors ${
              activeTab === tab.id
                ? "bg-[var(--color-surface)] text-[var(--color-text)] font-medium"
                : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Results Tab ── */}
      {activeTab === "results" && (
        <div className="space-y-4">
          {/* Keywords */}
          <PaperCard padding="sm">
            <div className="space-y-3">
              {/* Positive keywords */}
              <div>
                <p className="text-xs text-[var(--color-muted)] mb-2">正向关键词</p>
                <div className="flex flex-wrap gap-1.5">
                  {keywords.positive.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-[var(--color-primary-muted)] text-[var(--color-text)]"
                    >
                      {kw}
                      <button onClick={() => removeKeyword("positive", kw)}>
                        <X size={12} className="text-[var(--color-muted)]" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <input
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addKeyword("positive")}
                    placeholder="添加正向关键词..."
                    className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)]"
                  />
                  <WarmButton variant="soft" size="sm" onClick={() => addKeyword("positive")}>
                    <Plus size={12} />
                  </WarmButton>
                </div>
              </div>

              {/* Negative keywords */}
              <div>
                <p className="text-xs text-[var(--color-muted)] mb-2">排除关键词</p>
                <div className="flex flex-wrap gap-1.5">
                  {keywords.negative.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-300"
                    >
                      {kw}
                      <button onClick={() => removeKeyword("negative", kw)}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <input
                    value={newNegKeyword}
                    onChange={(e) => setNewNegKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addKeyword("negative")}
                    placeholder="添加排除关键词..."
                    className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)]"
                  />
                  <WarmButton variant="ghost" size="sm" onClick={() => addKeyword("negative")}>
                    <Plus size={12} />
                  </WarmButton>
                </div>
              </div>
            </div>
          </PaperCard>

          {/* Results */}
          <div className="grid gap-3 sm:grid-cols-2">
            {results.map((result) => (
              <PaperCard
                key={result.id}
                padding="md"
                hover="lift"
                className={result.status !== "new" ? "opacity-60" : ""}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)] text-sm">
                        {result.company}
                      </h3>
                      <span className="text-xs px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[var(--color-divider)] text-[var(--color-muted)]">
                        {result.platform}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--color-text-soft)]">{result.role}</p>
                    {result.snippet && (
                      <p className="text-xs text-[var(--color-muted)] mt-1 line-clamp-2">
                        {result.snippet}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-[var(--color-muted)] flex items-center gap-1">
                    <Clock size={10} />
                    {new Date(result.foundAt).toLocaleDateString("zh-CN")}
                  </span>
                  <div className="flex gap-2">
                    {result.status === "new" && (
                      <>
                        <WarmButton
                          variant="soft"
                          size="sm"
                          onClick={() => skipResult(result.id)}
                        >
                          <SkipForward size={12} className="mr-1" />
                          跳过
                        </WarmButton>
                        <WarmButton
                          variant="primary"
                          size="sm"
                          onClick={() => setSelectedResult(result)}
                        >
                          <Eye size={12} className="mr-1" />
                          评估
                        </WarmButton>
                      </>
                    )}
                    {result.status === "skipped" && (
                      <span className="text-xs text-[var(--color-muted)]">已跳过</span>
                    )}
                    {result.status === "evaluated" && (
                      <span className="text-xs text-[var(--color-primary)]">已评估</span>
                    )}
                  </div>
                </div>
              </PaperCard>
            ))}
          </div>
        </div>
      )}

      {/* ── Sources Tab ── */}
      {activeTab === "sources" && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-muted)]">
            {sources.length} 个扫描源 · {sources.filter((s) => s.enabled).length} 个已启用
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {sources.map((source) => (
              <PaperCard key={`${source.company}-${source.platform}`} padding="sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">{source.company}</p>
                    <p className="text-xs text-[var(--color-muted)]">{source.platform}</p>
                  </div>
                  <button
                    onClick={() =>
                      setSources((prev) =>
                        prev.map((s) =>
                          s.company === source.company && s.platform === source.platform
                            ? { ...s, enabled: !s.enabled }
                            : s
                        )
                      )
                    }
                    className={`w-10 h-5 rounded-full transition-colors ${
                      source.enabled ? "bg-[var(--color-primary)]" : "bg-[var(--color-divider)]"
                    } relative`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        source.enabled ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </PaperCard>
            ))}
          </div>
        </div>
      )}

      {/* ── History Tab ── */}
      {activeTab === "history" && (
        <div className="space-y-3">
          {history.map((entry) => (
            <PaperCard key={entry.date} padding="sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock size={16} className="text-[var(--color-muted)]" />
                  <span className="text-sm font-medium text-[var(--color-text)]">{entry.date}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-[var(--color-text-soft)]">
                    发现 {entry.resultsFound} 个职位
                  </span>
                  <span className="text-[var(--color-primary)]">
                    +{entry.newCount} 新
                  </span>
                </div>
              </div>
            </PaperCard>
          ))}
          {history.length === 0 && (
            <p className="text-center text-[var(--color-muted)] text-sm py-8">
              暂无扫描历史
            </p>
          )}
        </div>
      )}

      {/* ── Result Detail Modal ── */}
      <AnimatePresence>
        {selectedResult && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/20 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedResult(null)}
            />
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] p-6 w-full max-w-md shadow-[var(--shadow-lg)]"
                initial={{ scale: 0.95, y: 16 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 16 }}
              >
                <div className="flex items-center justify-between mb-4">
                  <HandwritingTitle as="h2">职位详情</HandwritingTitle>
                  <button onClick={() => setSelectedResult(null)}>
                    <X size={20} className="text-[var(--color-muted)]" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--color-text)]">
                      {selectedResult.company}
                    </h3>
                    <p className="text-sm text-[var(--color-text-soft)]">{selectedResult.role}</p>
                  </div>

                  <div className="flex gap-2">
                    <span className="text-xs px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--color-divider)] text-[var(--color-muted)]">
                      {selectedResult.platform}
                    </span>
                    <span className="text-xs px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--color-divider)] text-[var(--color-muted)]">
                      {new Date(selectedResult.foundAt).toLocaleString("zh-CN")}
                    </span>
                  </div>

                  {selectedResult.snippet && (
                    <div>
                      <p className="text-sm text-[var(--color-muted)] mb-1">JD 摘要</p>
                      <p className="text-sm text-[var(--color-text-soft)] bg-[var(--color-bg)] rounded-[var(--radius-sm)] p-3">
                        {selectedResult.snippet}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <WarmButton
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        skipResult(selectedResult.id);
                        setSelectedResult(null);
                      }}
                    >
                      跳过
                    </WarmButton>
                    <WarmButton
                      variant="primary"
                      size="sm"
                      onClick={() => setSelectedResult(null)}
                    >
                      <ExternalLink size={14} className="mr-1" />
                      一键评估
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
