"use client";

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
  if (!payload) return null;
  return (
    <aside
      data-testid="analyst-canvas"
      /* 样张 v2 任务 2.3:窄屏以覆盖层呈现;lg+ 保持行内双面画布(默认 40% 宽) */
      className="fixed inset-0 z-40 flex flex-col lg:static lg:z-auto lg:w-[min(420px,40vw)] lg:shrink-0 lg:border-l"
      style={{
        ...(maximized ? { width: "100%" } : {}),
        background: "var(--color-analyst-bg)",
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
                  <div className="display text-3xl" style={{ color: "#e08a63" }}>
                    {payload.score.toFixed(1)}
                    <span className="text-sm">/5</span>
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
