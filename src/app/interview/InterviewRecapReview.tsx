"use client";

import { useMemo } from "react";
import { BookOpenText, Clock, ExternalLink, FileText, MessageSquare, Star } from "lucide-react";
import { PaperCard } from "@/components/design";
import type { ChatSession, InterviewRecap, InterviewSessionState } from "@/types";
import { isInterviewSession } from "@/lib/agent/interview-session-state";

interface InterviewRecapReviewProps {
  sessions: ChatSession[];
  onOpenSession: (id: number) => void;
}

function sessionDate(session: ChatSession): Date {
  return new Date(session.updatedAt || session.createdAt || Date.now());
}

function averageScore(state?: InterviewSessionState): number | null {
  const scores = [
    ...(state?.scoreArtifacts || []).map((item) => item.score.overall),
    ...(state?.questionGraph || []).map((item) => item.score?.overall),
  ].filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  if (!scores.length) return null;
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
}

function lastTranscriptText(session: ChatSession): string {
  const turn = [...(session.interviewState?.transcript || [])]
    .reverse()
    .find((item) => item.content?.trim());
  if (turn?.content) return turn.content.replace(/\s+/g, " ").trim();
  const message = [...(session.messages || [])]
    .reverse()
    .find((item) => item.role !== "tool" && item.content?.trim());
  return (message?.content || "暂无转录内容").replace(/\s+/g, " ").trim();
}

function StructuredRecapSection({
  title,
  items,
  limit = 2,
}: {
  title: string;
  items?: string[];
  limit?: number;
}) {
  const visible = (items || []).filter(Boolean).slice(0, limit);
  if (!visible.length) return null;
  return (
    <section className="space-y-1">
      <p className="text-xs font-medium text-[var(--color-primary)]">{title}</p>
      <ul className="space-y-1 text-xs text-[var(--color-text-soft)]">
        {visible.map((item, index) => (
          <li key={`${title}-${index}`} className="leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StructuredRecap({ recap }: { recap: InterviewRecap }) {
  const questionFeedback = (recap.questionFeedback || []).slice(0, 2);
  return (
    <div className="space-y-3 text-sm text-[var(--color-text)]">
      <section>
        <p className="text-xs font-medium text-[var(--color-primary)] mb-1">复盘摘要</p>
        <p className="leading-relaxed">{recap.overallVerdict}</p>
      </section>

      <div className="grid gap-2 sm:grid-cols-2">
        <StructuredRecapSection title="优势" items={recap.strengths} />
        <StructuredRecapSection title="薄弱点" items={recap.weakSpots || recap.weaknesses} />
      </div>

      <StructuredRecapSection title="追问表现" items={recap.followUpPerformance} />
      <StructuredRecapSection title="回答证据" items={recap.evidenceFromAnswers} />

      {questionFeedback.length ? (
        <section className="space-y-1">
          <p className="text-xs font-medium text-[var(--color-primary)]">逐题反馈</p>
          <div className="space-y-2">
            {questionFeedback.map((item, index) => (
              <div key={item.questionNodeId || index} className="text-xs text-[var(--color-text-soft)] leading-relaxed">
                <p className="font-medium text-[var(--color-text)]">
                  {index + 1}. {item.question}
                  {typeof item.score === "number" ? ` · ${item.score}/5` : ""}
                </p>
                {item.answerExcerpt ? <p>答题证据：{item.answerExcerpt}</p> : null}
                {item.feedback ? <p>反馈：{item.feedback}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <StructuredRecapSection title="下一步" items={recap.nextPracticePlan} limit={3} />
    </div>
  );
}

export default function InterviewRecapReview({
  sessions,
  onOpenSession,
}: InterviewRecapReviewProps) {
  const reviewSessions = useMemo(() => {
    return sessions
      .filter((session) => !session.deletedAt)
      .filter((session) => isInterviewSession(session))
      .filter((session) => {
        const state = session.interviewState;
        return Boolean(state?.recap || state?.transcript?.length || state?.questionGraph?.length);
      })
      .sort((a, b) => sessionDate(b).getTime() - sessionDate(a).getTime())
      .slice(0, 6);
  }, [sessions]);

  return (
    <PaperCard padding="md">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <BookOpenText size={16} className="text-[var(--color-primary)]" />
            <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)]">
              复盘与转录回看
            </h3>
            <span className="text-sm text-[var(--color-muted)]">{reviewSessions.length} 条</span>
          </div>
        </div>

        {reviewSessions.length === 0 ? (
          <div className="text-center py-10">
            <FileText size={28} className="mx-auto text-[var(--color-muted)] mb-3" />
            <p className="text-sm text-[var(--color-muted)]">
              完成一次 Agent 模拟面试并请求复盘后，这里会展示结构化总结和转录入口。
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {reviewSessions.map((session) => {
              const id = session.id;
              if (id == null) return null;
              const state = session.interviewState;
              const plan = state?.planSnapshot;
              const score = averageScore(state);
              const recap = state?.recap;
              const date = sessionDate(session);
              return (
                <article
                  key={id}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text)] line-clamp-1">
                        {plan?.jdSnapshot?.company || "未知公司"} · {plan?.jdSnapshot?.role || "目标岗位"}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-muted)] line-clamp-1">
                        {plan?.resumeSnapshot?.title || "未绑定简历"} · {plan?.mode || "realistic"}
                      </p>
                    </div>
                    <button
                      onClick={() => onOpenSession(id)}
                      className="p-1 text-[var(--color-muted)] hover:text-[var(--color-primary)] transition-colors shrink-0"
                      title="打开转录"
                    >
                      <ExternalLink size={14} />
                    </button>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-[var(--color-muted)] flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Clock size={11} />
                      {date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare size={11} />
                      {state?.transcript?.length || 0} 条转录
                    </span>
                    {score != null && (
                      <span className="inline-flex items-center gap-1 text-[var(--color-primary)]">
                        <Star size={11} />
                        {score}/5
                      </span>
                    )}
                  </div>

                  {recap ? (
                    <StructuredRecap recap={recap} />
                  ) : (
                    <div className="text-sm text-[var(--color-text)]">
                      <p className="text-xs font-medium text-[var(--color-primary)] mb-1">
                        最近转录
                      </p>
                      <p className="line-clamp-4">
                        {lastTranscriptText(session)}
                      </p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </PaperCard>
  );
}
