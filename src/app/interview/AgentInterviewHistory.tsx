"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BadgeCheck, ChevronDown, ChevronUp, Clock, ExternalLink, FileText, MessageSquare, Search, Star, Trash2 } from "lucide-react";
import { PaperCard } from "@/components/design";
import type { ChatSession, InterviewSessionState } from "@/types";
import { isInterviewSession } from "@/lib/agent/interview-session-state";

interface AgentInterviewHistoryProps {
  sessions: ChatSession[];
  onOpenSession: (id: number) => void;
  onDeleteSession: (id: number) => void;
}

function sessionPreview(session: ChatSession): string {
  const useful = [...(session.messages || [])]
    .reverse()
    .find((m) => m.role === "assistant" && m.content?.trim());
  const fallback = [...(session.messages || [])].reverse().find((m) => m.content?.trim());
  return (useful?.content || fallback?.content || "暂无内容").replace(/\s+/g, " ").trim();
}

function sessionDate(session: ChatSession): Date {
  return new Date(session.updatedAt || session.createdAt || Date.now());
}

function countUserTurns(session: ChatSession): number {
  return (session.messages || []).filter((m) => m.role === "user").length;
}

function averageScore(state?: InterviewSessionState): number | null {
  const scores = [
    ...(state?.scoreArtifacts || []).map((item) => item.score.overall),
    ...(state?.questionGraph || []).map((item) => item.score?.overall),
  ].filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  if (!scores.length) return null;
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
}

function statusLabel(status?: string): string {
  if (status === "completed") return "已完成";
  if (status === "paused") return "已暂停";
  if (status === "abandoned") return "已中止";
  return "进行中";
}

export default function AgentInterviewHistory({
  sessions,
  onOpenSession,
  onDeleteSession,
}: AgentInterviewHistoryProps) {
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const interviewSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions
      .filter((session) => !session.deletedAt)
      .filter((session) => isInterviewSession(session))
      .filter((session) => {
        if (!q) return true;
        const plan = session.interviewState?.planSnapshot;
        const haystack = `${session.title} ${plan?.jdSnapshot?.company || ""} ${plan?.jdSnapshot?.role || ""} ${sessionPreview(session)}`.toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => sessionDate(b).getTime() - sessionDate(a).getTime());
  }, [query, sessions]);

  return (
    <PaperCard padding="md">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-[var(--color-primary)]" />
            <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)]">
              Agent 面试记录
            </h3>
            <span className="text-sm text-[var(--color-muted)]">{interviewSessions.length} 条</span>
          </div>
          <div className="flex items-center gap-2 min-w-[220px] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-1.5">
            <Search size={14} className="text-[var(--color-muted)] shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索历史对话"
              className="flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none"
            />
          </div>
        </div>

        {interviewSessions.length === 0 ? (
          <div className="text-center py-10">
            <MessageSquare size={28} className="mx-auto text-[var(--color-muted)] mb-3" />
            <p className="text-sm text-[var(--color-muted)]">
              还没有可展示的 Agent 面试记录。去 Agent 里做一次模拟面试后，这里会自动出现。
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[520px] overflow-y-auto">
            {interviewSessions.map((session) => {
              const id = session.id;
              if (id == null) return null;
              const isExpanded = expandedId === id;
              const preview = sessionPreview(session);
              const date = sessionDate(session);
              const state = session.interviewState;
              const plan = state?.planSnapshot;
              const score = averageScore(state);
              const hasRecap = Boolean(state?.recap);
              return (
                <div
                  key={id}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedId(isExpanded ? null : id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandedId(isExpanded ? null : id);
                      }
                    }}
                    className="p-3 flex items-start justify-between gap-3 hover:bg-[var(--color-primary-muted)] transition-colors cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-[var(--color-primary-muted)] text-[var(--color-text-soft)]">
                          <MessageSquare size={10} />
                          Agent
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-soft)]">
                          <BadgeCheck size={10} />
                          {statusLabel(state?.status)}
                        </span>
                        <span className="text-xs text-[var(--color-muted)] flex items-center gap-1">
                          <Clock size={10} />
                          {date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="text-xs text-[var(--color-muted)]">
                          {countUserTurns(session)} 轮
                        </span>
                        {score != null && (
                          <span className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)]">
                            <Star size={10} />
                            {score}/5
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-1 text-xs ${hasRecap ? "text-emerald-600" : "text-[var(--color-muted)]"}`}>
                          <FileText size={10} />
                          {hasRecap ? "有复盘" : "未复盘"}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-[var(--color-text)] line-clamp-1">
                        {session.title || "面试模拟"}
                      </p>
                      <p className="text-xs text-[var(--color-text-soft)] line-clamp-1 mt-0.5">
                        {plan?.jdSnapshot?.company || "未知公司"} · {plan?.jdSnapshot?.role || "目标岗位"} · {plan?.resumeSnapshot?.title || "未绑定简历"}
                      </p>
                      <p className="text-xs text-[var(--color-muted)] line-clamp-1 mt-0.5">
                        {preview}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSession(id);
                        }}
                        className="p-1 text-[var(--color-muted)] hover:text-[var(--color-primary)] transition-colors"
                        title="打开会话"
                      >
                        <ExternalLink size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession(id);
                        }}
                        className="p-1 text-[var(--color-muted)] hover:text-red-400 transition-colors"
                        title="删除记录"
                      >
                        <Trash2 size={14} />
                      </button>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 pb-3 border-t border-[var(--color-divider)] pt-3 space-y-2">
                          {state?.recap && (
                            <div className="rounded-[var(--radius-sm)] bg-[var(--color-primary-muted)] px-3 py-2 text-sm text-[var(--color-text)]">
                              <p className="text-xs font-medium text-[var(--color-primary)] mb-1">结构化复盘</p>
                              <p className="line-clamp-3">{state.recap.overallVerdict}</p>
                            </div>
                          )}
                          {(session.messages || [])
                            .filter((m) => m.role !== "tool" && m.content?.trim())
                            .slice(-6)
                            .map((message, index) => (
                              <div key={`${id}-${index}`} className="text-sm">
                                <p className="text-xs font-medium text-[var(--color-primary)] mb-0.5">
                                  {message.role === "user" ? "我" : "Agent"}
                                </p>
                                <p className="text-[var(--color-text)] whitespace-pre-wrap line-clamp-4">
                                  {message.content}
                                </p>
                              </div>
                            ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PaperCard>
  );
}
