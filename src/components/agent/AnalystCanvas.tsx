"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { isFivePointScore } from "@/lib/score-scale";

/**
 * 分析面（0.11.0-D 双面画布）：深炭证据面。
 * 报告、提案预览、岗位池在此展开——对话面保持安静，证据在这立信。
 */

export interface AnalystCanvasPayload {
  kind: "report" | "empty";
  title?: string;
  subtitle?: string;
  score?: number;
  reportNum?: number;
  readBackVerified?: boolean;
  blocks?: Record<string, unknown>;
  labels?: Record<string, string>;
}

const REPORT_BLOCK_KEYS = ["a", "b", "c", "d", "e", "f", "g"] as const;
const DEFAULT_REPORT_BLOCK_LABELS: Record<string, string> = {
  a: "A · 职位概览",
  b: "B · 简历匹配",
  c: "C · 职级与策略",
  d: "D · 薪资与市场",
  e: "E · 定制化方案",
  f: "F · 面试准备",
  g: "G · 职位合法性",
};

function parseReportBlocks(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function blockContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const content = (value as Record<string, unknown>).content;
  return typeof content === "string" ? content : "";
}

export function AnalystCanvas({
  payload,
  onClose,
  onMaximize,
  maximized,
}: {
  payload: AnalystCanvasPayload | null;
  onClose: () => void;
  onMaximize?: () => void;
  maximized?: boolean;
}) {
  const [reportBlocks, setReportBlocks] = useState<Record<string, unknown>>(() => payload?.blocks || {});
  const [detailState, setDetailState] = useState<"idle" | "loading" | "ready" | "error">(
    payload?.blocks && Object.keys(payload.blocks).length > 0 ? "ready" : "idle",
  );

  useEffect(() => {
    let cancelled = false;
    if (!payload) {
      setReportBlocks({});
      setDetailState("idle");
      return () => { cancelled = true; };
    }
    const inlineBlocks = payload.blocks || {};
    setReportBlocks(inlineBlocks);
    if (payload.kind !== "report" || !payload.reportNum) {
      setDetailState(Object.keys(inlineBlocks).length > 0 ? "ready" : "idle");
      return () => { cancelled = true; };
    }

    setDetailState("loading");
    fetch(`/api/data/reports/${encodeURIComponent(String(payload.reportNum))}`, { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok || json.success !== true) throw new Error(json.error || "报告详情读取失败");
        const data = json.data && typeof json.data === "object" ? json.data as Record<string, unknown> : {};
        const blocks = parseReportBlocks(data.blocks_json || data.blocks);
        if (cancelled) return;
        setReportBlocks(blocks);
        setDetailState(Object.keys(blocks).length > 0 ? "ready" : "error");
      })
      .catch(() => {
        if (!cancelled) setDetailState("error");
      });
    return () => { cancelled = true; };
  }, [payload]);

  const visibleBlocks = useMemo(
    () => REPORT_BLOCK_KEYS
      .map((key) => [key, blockContent(reportBlocks[key])] as const)
      .filter(([, content]) => content.trim().length > 0),
    [reportBlocks],
  );
  if (!payload) return null;
  const reportHref = payload.reportNum ? `/evaluate/reports?report=${encodeURIComponent(String(payload.reportNum))}` : "/evaluate/reports";
  return (
    <aside
      data-testid="analyst-canvas"
      /* 样张 v2 任务 2.3:窄屏以覆盖层呈现;lg+ 保持行内双面画布(默认 40% 宽) */
      className="pointer-events-auto fixed inset-0 z-40 flex min-w-0 flex-col lg:static lg:z-auto lg:w-full lg:border-l"
      role="dialog"
      aria-modal={maximized ? true : undefined}
      aria-label="分析面板"
      style={{
        ...(maximized ? { width: "100%" } : {}),
        background: "var(--color-analyst-bg)",
        backgroundImage: "linear-gradient(rgba(25, 23, 18, 0.78), rgba(25, 23, 18, 0.78)), url('/backgrounds/analyst.webp')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        color: "var(--color-analyst-text)",
      }}
    >
      <div
        className="flex items-center gap-2 border-b px-4 py-2.5 text-xs"
        style={{ borderColor: "var(--color-analyst-border)" }}
      >
        <span style={{ color: "var(--color-analyst-muted)" }}>分析面</span>
        {payload.reportNum ? (
          <span className="rounded-full px-2 py-0.5" style={{ background: "var(--color-analyst-surface)" }}>
            报告 #{payload.reportNum}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-1.5">
          {payload.kind === "report" && (
            <a
              href={reportHref}
              data-testid="analyst-open-report"
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors hover:bg-white/10"
              title="打开完整报告"
            >
              完整报告
              <ExternalLink size={12} />
            </a>
          )}
          {onMaximize ? (
            <button
              type="button"
              onClick={onMaximize}
              className="rounded p-1 transition-colors hover:bg-white/5"
              title={maximized ? "还原" : "最大化（工作台全屏）"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                {maximized ? <path d="M9 3H3v6M15 21h6v-6" /> : <path d="M15 3h6v6M9 21H3v-6" />}
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 transition-colors hover:bg-white/5"
            title="收起分析面"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {payload.kind === "report" ? (
          <>
            <div className="flex items-baseline justify-between">
              <div>
                <div className="display text-xl" style={{ fontFamily: "var(--font-display)" }}>
                  {payload.title || "评估报告"}
                </div>
                {payload.subtitle ? (
                  <div className="mt-0.5 text-xs" style={{ color: "var(--color-analyst-muted)" }}>
                    {payload.subtitle}
                  </div>
                ) : null}
              </div>
              {typeof payload.score === "number" ? (
                <div className="text-right">
                  <div className="display text-3xl" style={{ color: "var(--color-primary)", filter: "brightness(1.35)" }}>
                    {isFivePointScore(payload.score) ? payload.score.toFixed(1) : "待复核"}
                    {isFivePointScore(payload.score) && <span className="text-sm">/5</span>}
                  </div>
                </div>
              ) : null}
            </div>
            {payload.readBackVerified === true ? (
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
                style={{ background: "var(--color-analyst-surface)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                报告已落库并通过读回校验 · 可在报告库查看完整 A-G 分析
              </div>
            ) : null}
            <div
              className="space-y-2"
              data-testid="analyst-report-details"
              style={{
                "--color-text": "var(--color-analyst-text)",
                "--color-text-soft": "var(--color-analyst-text)",
                "--color-muted": "var(--color-analyst-muted)",
                "--color-divider": "var(--color-analyst-border)",
                "--color-surface": "var(--color-analyst-surface)",
                "--color-bg": "var(--color-analyst-bg)",
                "--color-primary-muted": "var(--color-analyst-border)",
              } as CSSProperties}
            >
              {detailState === "loading" && (
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-analyst-muted)" }}>
                  <Loader2 size={13} className="animate-spin" /> 正在读取 A-G 详细分析…
                </div>
              )}
              {detailState === "error" && (
                <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--color-analyst-surface)", color: "var(--color-analyst-muted)" }}>
                  完整报告暂时无法读取，下方预览可能不完整。请点击右上角“完整报告”查看。
                </div>
              )}
              {visibleBlocks.map(([key, content]) => (
                <details key={key} open={key === "a"} className="rounded-lg" style={{ background: "var(--color-analyst-surface)" }}>
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium" style={{ color: "var(--color-analyst-text)" }}>
                    {payload.labels?.[key] || DEFAULT_REPORT_BLOCK_LABELS[key]}
                  </summary>
                  <div className="border-t px-3 py-3 text-sm leading-relaxed" style={{ borderColor: "var(--color-analyst-border)", color: "var(--color-analyst-text)" }}>
                    <MarkdownRenderer content={content} />
                  </div>
                </details>
              ))}
            </div>
          </>
        ) : (
          <div className="text-sm" style={{ color: "var(--color-analyst-muted)" }}>
            暂无证据内容。
          </div>
        )}
      </div>
    </aside>
  );
}
