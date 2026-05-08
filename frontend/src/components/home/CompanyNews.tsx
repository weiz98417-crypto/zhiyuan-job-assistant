"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PaperCard } from "@/components/design";
import { Building2, RefreshCw, Settings } from "lucide-react";

interface CompanyNewsItem {
  id: number;
  source: string;
  title: string;
  summary: string;
  url?: string;
}

export default function CompanyNews() {
  const [news, setNews] = useState<CompanyNewsItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasTargets, setHasTargets] = useState(true);
  const [message, setMessage] = useState("");

  async function fetchNews(force = false) {
    setLoading(true);
    try {
      const res = await fetch(`/api/news/company${force ? "?force=1" : ""}`);
      const json = await res.json();
      if (json.success) {
        setNews(json.data || []);
        setHasTargets(json.hasTargets !== false);
        setMessage(json.message || "");
      }
    } catch {
      setNews([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchNews();
  }, []);

  // No target companies set — show onboarding prompt
  if (!hasTargets && !loading) {
    return (
      <PaperCard padding="md">
        <div className="text-center py-4 space-y-3">
          <Building2 size={24} className="text-[var(--color-muted)] mx-auto" />
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-[var(--color-text)] mb-1">
              目标企业快讯
            </h2>
            <p className="text-xs text-[var(--color-muted)]">
              {message || "在设置中添加目标公司，获取专属招聘动态"}
            </p>
          </div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-primary)] hover:underline"
          >
            <Settings size={14} />
            去设置添加
          </Link>
        </div>
      </PaperCard>
    );
  }

  return (
    <PaperCard padding="md">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-[var(--color-text)] flex items-center gap-2">
          <Building2 size={16} className="text-[var(--color-primary)]" />
          目标企业动态
        </h2>
        <button
          onClick={() => fetchNews(true)}
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)] transition-colors flex items-center gap-1"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          刷新
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && news === null && (
        <div className="space-y-3 animate-pulse">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-14 h-4 bg-[var(--color-divider)] rounded mt-0.5 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-[var(--color-divider)] rounded w-2/3" />
                <div className="h-2 bg-[var(--color-divider)] rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* News items */}
      {news && news.length === 0 && !loading && (
        <p className="text-sm text-[var(--color-muted)] py-4 text-center">暂无目标企业动态</p>
      )}

      {news && news.length > 0 && (
        <div className="space-y-2.5">
          {news.map((item) => (
            <div
              key={item.id}
              className="flex gap-3 py-1.5 px-2 -mx-2 rounded-[var(--radius-sm)] hover:bg-[var(--color-primary-muted)] transition-colors"
            >
              <span className="text-xs font-medium text-[var(--color-text)] w-14 flex-shrink-0 mt-0.5 truncate">
                {item.source}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--color-text)] leading-snug line-clamp-1">
                  {item.summary || item.title}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </PaperCard>
  );
}
