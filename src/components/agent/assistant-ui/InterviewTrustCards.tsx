"use client";

/**
 * Spec 30 / WP2+WP3：评分锚定信任卡（bands/锚定词/三态/证据展开）与拒信确认卡。
 * 数据来源：interview_score 与 rejection_parse 的 uiPayload（经 WP0 投影白名单放行）。
 * spec 33 换装：容器/徽章/展开/确认按钮改用 trust kit 原语；档位词换算收口 band-scale。
 */

import { useState } from "react";
import { recordPerceptionEvent } from "@/lib/server/perception-client";
import {
  bandLabel,
  stateLabel,
  DIMENSION_LABELS,
  REJECTION_REASON_LABELS,
  TrustCardFrame,
  BandBadge,
  StateChip,
  ExpandableEvidence,
  ConfirmButton,
  DismissHint,
} from "@/components/agent/trust";

interface RubricShape {
  bands?: Record<string, number>;
  overallBand?: number;
  evidence?: Record<string, string>;
  states?: Record<string, string>;
  review?: {
    effectiveEvidence?: string;
    mainGaps?: string;
    stateVerdict?: string;
    betterStructure?: string;
  };
}

/** 评分锚定信任卡：主显锚定词·N/4 + 逐维档位/三态 + 可展开证据（展开触发感知埋点）。 */
export function InterviewScoreCard({ payload }: { payload: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const rubric = (payload?.bands ? payload : null) as (RubricShape & Record<string, unknown>) | null;

  // 未评分态（WP6/Spec 26：无 bands = 未评分，不与 band 0 混淆）；观察文案在 suggestions
  if (!rubric || !rubric.bands) {
    const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions.map(String) : [];
    return (
      <TrustCardFrame>
        <p className="text-[var(--color-text)] font-medium">这一题这轮没有打分</p>
        {suggestions.map((s, i) => (
          <p key={i} className="text-[var(--color-muted)]">{s}</p>
        ))}
      </TrustCardFrame>
    );
  }

  const overallBand = typeof rubric.overallBand === "number" ? rubric.overallBand : 0;
  const dims = Object.entries(rubric.bands);
  const review = rubric.review || {};

  return (
    <TrustCardFrame>
      <div className="flex items-baseline gap-2">
        <BandBadge label={bandLabel(overallBand)} band={overallBand} />
        <span className="text-[10px] text-[var(--color-muted)]">评分锚定</span>
      </div>

      <div className="space-y-1">
        {dims.map(([dim, band]) => (
          <div key={dim} className="flex items-center gap-2 flex-wrap">
            <span className="text-[var(--color-muted)] w-16 shrink-0">{DIMENSION_LABELS[dim] || dim}</span>
            <BandBadge label={bandLabel(band)} band={band} muted />
            <StateChip state={stateLabel(rubric.states?.[dim] || "")} />
          </div>
        ))}
      </div>

      <ExpandableEvidence
        expanded={expanded}
        onToggle={() => {
          setExpanded((prev) => !prev);
          if (!expanded) void recordPerceptionEvent("score_evidence_expand", { dimensionCount: dims.length });
        }}
      >
        {dims.map(([dim]) => {
          const quote = rubric.evidence?.[dim] || "";
          if (!quote) return null;
          return (
            <p key={dim} className="text-[var(--color-muted)]">
              <span className="text-[var(--color-text)]">{DIMENSION_LABELS[dim] || dim}：</span>「{quote}」
            </p>
          );
        })}
        {review.effectiveEvidence ? <p><span className="text-[var(--color-text)]">有效证据：</span>{review.effectiveEvidence}</p> : null}
        {review.mainGaps ? <p><span className="text-[var(--color-text)]">主要缺口：</span>{review.mainGaps}</p> : null}
        {review.stateVerdict ? <p><span className="text-[var(--color-text)]">三态判定：</span>{review.stateVerdict}</p> : null}
        {review.betterStructure ? <p><span className="text-[var(--color-text)]">更好的回答结构：</span>{review.betterStructure}</p> : null}
      </ExpandableEvidence>
    </TrustCardFrame>
  );
}

/** 拒信确认卡（Spec 30 / WP3）：确认走 /api/memory/candidates PATCH（既有治理端点），忽略即不动。 */
export function RejectionParseCard({ payload }: { payload: Record<string, unknown> }) {
  const [confirmed, setConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  const candidateId = typeof payload?.candidateId === "number" ? payload.candidateId : null;
  const parse = (payload?.parse && typeof payload.parse === "object" ? payload.parse : {}) as {
    company?: string;
    role?: string;
    reasonLabel?: string;
    quote?: string;
    freeText?: string;
  };

  const onConfirm = async () => {
    if (candidateId == null || confirming) return;
    setConfirming(true);
    setError("");
    try {
      const res = await fetch("/api/memory/candidates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: candidateId, action: "confirm", confirmedJobUse: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `确认失败 (${res.status})`);
      } else {
        setConfirmed(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <TrustCardFrame>
      <p className="text-[var(--color-text)] font-medium">
        {parse.company || "某公司"}{parse.role ? ` · ${parse.role}` : ""} 的拒绝原因
      </p>
      <p>
        <span className="text-[var(--color-muted)]">原因：</span>
        <span className="text-[var(--color-text)]">{REJECTION_REASON_LABELS[parse.reasonLabel || "other"] || "其他"}</span>
      </p>
      {parse.quote ? (
        <p className="text-[var(--color-muted)]">原文：「{parse.quote}」</p>
      ) : null}
      {parse.freeText ? <p className="text-[var(--color-muted)]">{parse.freeText}</p> : null}

      {candidateId == null ? (
        <p className="text-[var(--color-muted)]">
          {payload?.ledgerStatus === "skipped_postgres_only"
            ? "本地模式不入账。"
            : "该解析未产生新候选（可能已存在或被策略拦截），无需确认。"}
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <ConfirmButton confirmed={confirmed} confirming={confirming} onConfirm={() => void onConfirm()} />
          {!confirmed ? <DismissHint>忽略则 30 天后自动过期</DismissHint> : null}
        </div>
      )}
      {error ? <p className="text-red-600">{error}</p> : null}
    </TrustCardFrame>
  );
}
