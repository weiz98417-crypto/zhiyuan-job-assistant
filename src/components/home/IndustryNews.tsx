"use client";

import { useEffect, useState } from "react";
import { PaperCard } from "@/components/design";
import { Newspaper, ExternalLink, RefreshCw } from "lucide-react";

interface NewsItem {
  id: number;
  source: string;
  title: string;
  summary: string;
  url?: string;
  publishedAt?: string;
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "刚刚";
  if (diffH < 24) return `${diffH}h前`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d前`;
}

export default function IndustryNews() {
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function fetchNews(force = false) {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/news/industry${force ? "?force=1" : ""}`);
      const json = await res.json();
      if (json.success) {
        setNews(json.data || []);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchNews();
  }, []);

  return (
    <PaperCard padding="md">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-[var(--color-text)] flex items-center gap-2">
          <Newspaper size={16} className="text-[var(--color-primary)]" />
          行业快讯
        </h2>
        <button
          onClick={() => fetchNews(true)}
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)] transition-colors flex items-center gap-1"
          title="刷新快讯"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          刷新
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && news === null && (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-12 h-4 bg-[var(--color-divider)] rounded mt-0.5 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-[var(--color-divider)] rounded w-3/4" />
                <div className="h-2 bg-[var(--color-divider)] rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <p className="text-sm text-[var(--color-muted)] py-4 text-center">快讯暂不可用</p>
      )}

      {/* News items */}
      {news && !error && news.length === 0 && (
        <p className="text-sm text-[var(--color-muted)] py-4 text-center">快讯暂不可用</p>
      )}

      {news && news.length > 0 && (
        <div className="space-y-2.5">
          {news.slice(0, 6).map((item) => (
            <a
              key={item.id}
              href={item.url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3 py-1.5 px-2 -mx-2 rounded-[var(--radius-sm)] hover:bg-[var(--color-primary-muted)] transition-colors group"
            >
              <span className="text-xs text-[var(--color-muted)] w-12 flex-shrink-0 mt-0.5 truncate">
                {item.source}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors leading-snug line-clamp-1">
                  {item.summary || item.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-[var(--color-muted)]">
                    {formatRelativeTime(item.publishedAt)}
                  </span>
                  {item.url && (
                    <ExternalLink size={10} className="text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </PaperCard>
  );
}
